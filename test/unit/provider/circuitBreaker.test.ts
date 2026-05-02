import { afterEach, describe, expect, it } from "vitest";
import {
  ProviderCircuitBreaker,
  ProviderCircuitOpenError,
  getProviderCooldownMs,
  getProviderMaxConcurrency,
  getProviderStuckThreshold,
} from "../../../src/provider/circuitBreaker";
import type { ProviderStatus } from "../../../src/provider/types";

const provider: ProviderStatus = {
  instanceId: "lmstudio:default",
  type: "lmstudio",
  displayName: "LM Studio",
  kind: "local",
  enabled: true,
  requiresApiKey: false,
  baseUrl: "http://127.0.0.1:1234/v1",
  model: "qwen",
  timeoutMs: 30_000,
  envVars: [],
  fileConfig: {},
  configured: true,
  available: true,
  reason: "configured",
};

afterEach(() => {
  delete process.env.CHATBI_PROVIDER_MAX_CONCURRENCY;
  delete process.env.CODECLAW_PROVIDER_MAX_CONCURRENCY;
  delete process.env.CHATBI_PROVIDER_COOLDOWN_MS;
  delete process.env.CODECLAW_PROVIDER_COOLDOWN_MS;
  delete process.env.CHATBI_PROVIDER_STUCK_THRESHOLD;
  delete process.env.CODECLAW_PROVIDER_STUCK_THRESHOLD;
});

describe("ProviderCircuitBreaker", () => {
  it("reads ChatBI env limits before legacy env limits", () => {
    process.env.CODECLAW_PROVIDER_MAX_CONCURRENCY = "4";
    process.env.CHATBI_PROVIDER_MAX_CONCURRENCY = "1";
    process.env.CHATBI_PROVIDER_COOLDOWN_MS = "123";
    process.env.CHATBI_PROVIDER_STUCK_THRESHOLD = "4";

    expect(getProviderMaxConcurrency()).toBe(1);
    expect(getProviderCooldownMs()).toBe(123);
    expect(getProviderStuckThreshold()).toBe(4);
  });

  it("blocks acquire when concurrency is full", () => {
    const breaker = new ProviderCircuitBreaker({ maxConcurrency: 1, cooldownMs: 1000 });

    const token = breaker.acquire(provider);

    expect(() => breaker.acquire(provider)).toThrow(ProviderCircuitOpenError);
    breaker.release(token, "success");
    expect(() => breaker.acquire(provider)).not.toThrow();
  });

  it("opens cooldown after a stuck outcome", () => {
    let now = 1000;
    const breaker = new ProviderCircuitBreaker({
      maxConcurrency: 1,
      cooldownMs: 5000,
      stuckThreshold: 1,
      now: () => now,
    });

    const token = breaker.acquire(provider);
    breaker.release(token, "stuck", "assistant output exceeded 8 bytes");

    expect(() => breaker.acquire(provider)).toThrow(/cooling down/);
    now = 7000;
    expect(() => breaker.acquire(provider)).not.toThrow();
  });

  it("uses relaxed defaults for complex tasks", () => {
    expect(getProviderCooldownMs()).toBe(30_000);
    expect(getProviderStuckThreshold()).toBe(2);
  });
});
