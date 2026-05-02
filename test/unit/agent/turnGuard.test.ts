import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createQueryEngine } from "../../../src/agent/queryEngine";
import {
  TurnGuard,
  getMaxToolTurns,
  getMaxTurnBytes,
  getTerminalRenderBytes,
} from "../../../src/agent/turnGuard";
import { wrapLargeTextArtifact } from "../../../src/agent/tools/artifact";
import { getGlobalProviderCircuitBreaker } from "../../../src/provider/circuitBreaker";
import type { EngineEvent } from "../../../src/agent/types";
import type { ProviderStatus } from "../../../src/provider/types";

const provider: ProviderStatus = {
  instanceId: "openai:default",
  type: "openai",
  displayName: "OpenAI",
  kind: "cloud",
  enabled: true,
  requiresApiKey: true,
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  timeoutMs: 30_000,
  apiKey: "test-key",
  apiKeyEnvVar: "OPENAI_API_KEY",
  envVars: ["OPENAI_API_KEY"],
  fileConfig: {},
  configured: true,
  available: true,
  reason: "configured",
};

  afterEach(() => {
  delete process.env.CHATBI_MAX_TURN_BYTES;
  delete process.env.CODECLAW_MAX_TURN_BYTES;
  delete process.env.CHATBI_MAX_TOOL_TURNS;
  delete process.env.CODECLAW_MAX_TOOL_TURNS;
  delete process.env.CHATBI_TERMINAL_RENDER_BYTES;
  delete process.env.CODECLAW_TERMINAL_RENDER_BYTES;
  delete process.env.CHATBI_PROVIDER_COOLDOWN_MS;
  delete process.env.CODECLAW_PROVIDER_COOLDOWN_MS;
  delete process.env.CHATBI_PROVIDER_STUCK_THRESHOLD;
  delete process.env.CODECLAW_PROVIDER_STUCK_THRESHOLD;
  getGlobalProviderCircuitBreaker().reset();
});

async function collect(stream: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("TurnGuard", () => {
  it("reads ChatBI env limits before legacy env limits", () => {
    process.env.CODECLAW_MAX_TURN_BYTES = "100";
    process.env.CHATBI_MAX_TURN_BYTES = "42";
    process.env.CHATBI_MAX_TOOL_TURNS = "7";

    expect(getMaxTurnBytes()).toBe(42);
    expect(getMaxToolTurns()).toBe(7);
  });

  it("uses conservative defaults for TUI safety", () => {
    expect(getMaxTurnBytes()).toBe(64 * 1024);
    expect(getTerminalRenderBytes()).toBe(24 * 1024);
    expect(getMaxToolTurns()).toBe(24);
  });

  it("returns a stop decision when assistant output exceeds the turn budget", () => {
    const guard = new TurnGuard(8);

    expect(guard.recordAssistantDelta("1234")).toBeNull();
    const stop = guard.recordAssistantDelta("56789");

    expect(stop?.reason).toContain("assistant output exceeded 8 bytes");
    expect(stop?.message).toContain("ChatBI stopped this response");
  });

  it("stops a runaway provider stream and completes with a guard note", async () => {
    process.env.CHATBI_MAX_TURN_BYTES = "8";
    const fetchImpl = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"12345"}}]}\n'));
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"67890"}}]}\n'));
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
            controller.close();
          },
        })
      );

    const engine = createQueryEngine({
      currentProvider: provider,
      fallbackProvider: null,
      permissionMode: "plan",
      workspace: process.cwd(),
      fetchImpl: fetchImpl as typeof fetch,
    });

    const events = await collect(engine.submitMessage("runaway"));
    const complete = [...events].reverse().find((event) => event.type === "message-complete");

    expect(complete).toBeDefined();
    expect((complete as { text: string }).text).toContain("ChatBI stopped this response");
    expect(engine.getMessages().at(-1)?.text).toContain("ChatBI stopped this response");
  });

  it("cools down a stuck primary provider and uses fallback on the next turn", async () => {
    process.env.CHATBI_MAX_TURN_BYTES = "8";
    process.env.CHATBI_PROVIDER_COOLDOWN_MS = "60000";
    process.env.CHATBI_PROVIDER_STUCK_THRESHOLD = "1";
    let calls = 0;
    const fallbackProvider: ProviderStatus = {
      ...provider,
      instanceId: "ollama:default",
      type: "ollama",
      displayName: "Ollama",
      kind: "local",
      requiresApiKey: false,
      baseUrl: "http://127.0.0.1:11434",
      model: "llama3.1",
      apiKey: undefined,
      apiKeyEnvVar: undefined,
    };
    const fetchImpl = async (input: string | URL | Request) => {
      calls += 1;
      const url = String(input);
      if (url.includes("api.openai.com")) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"12345"}}]}\n'));
              controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"67890"}}]}\n'));
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
              controller.close();
            },
          })
        );
      }
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"message":{"content":"fallback-ok"}}\n'));
            controller.close();
          },
        })
      );
    };

    const engine = createQueryEngine({
      currentProvider: provider,
      fallbackProvider,
      permissionMode: "plan",
      workspace: process.cwd(),
      fetchImpl: fetchImpl as typeof fetch,
    });

    await collect(engine.submitMessage("runaway"));
    const second = await collect(engine.submitMessage("try again"));

    expect(second.some((event) => event.type === "message-complete" && event.text.includes("fallback-ok"))).toBe(true);
    expect(calls).toBe(2);
  });

  it("/status shows provider circuit cooldown state", async () => {
    process.env.CHATBI_PROVIDER_COOLDOWN_MS = "60000";
    getGlobalProviderCircuitBreaker().markStuck(provider, "assistant output exceeded 8 bytes");

    const engine = createQueryEngine({
      currentProvider: provider,
      fallbackProvider: null,
      permissionMode: "plan",
      workspace: process.cwd(),
    });

    await collect(engine.submitMessage("/status"));

    const reply = engine.getMessages().at(-1)?.text ?? "";
    expect(reply).toContain("provider-circuit:");
    expect(reply).toContain("- OpenAI: running=0 stuck=1 cooldown=");
    expect(reply).toContain("reason=assistant output exceeded 8 bytes");
  });

  it("wraps oversized assistant text as an artifact summary", () => {
    const root = mkdtempSync(path.join(tmpdir(), "chatbi-artifact-"));
    try {
      const envelope = wrapLargeTextArtifact("abcdef0123456789", "session-1", "msg-1", {
        artifactsRoot: root,
        maxBytes: 8,
        label: "assistant response",
      });

      expect(envelope.artifactPath).toBeDefined();
      expect(envelope.summary).toContain("TRUNCATED assistant response");
      expect(envelope.summary).toContain("read_artifact");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
