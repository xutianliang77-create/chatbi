/**
 * /context diagnostics
 *
 * 覆盖：
 *   - 输出 provider replay / system prompt / tool schema / message breakdown
 *   - 输出 memory 与 active skill 状态，便于定位上下文来源
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createQueryEngine } from "../../../src/agent/queryEngine";
import type { EngineEvent, QueryEngine } from "../../../src/agent/types";

const tempDirs: string[] = [];

async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "codeclaw-context-"));
  tempDirs.push(dir);
  return dir;
}

async function collect(stream: AsyncGenerator<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function makeEngine(workspace: string): QueryEngine {
  return createQueryEngine({
    currentProvider: null,
    fallbackProvider: null,
    permissionMode: "plan",
    workspace,
    auditDbPath: null,
    dataDbPath: null,
    approvalsDir: path.join(workspace, "approvals"),
    artifactsRoot: path.join(workspace, "artifacts"),
    disableGitSummary: true,
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("/context diagnostics", () => {
  it("shows context source breakdown instead of only aggregate counts", async () => {
    const workspace = await makeWorkspace();
    const engine = makeEngine(workspace);

    await collect(engine.submitMessage("/context"));
    const text = engine.getMessages().at(-1)?.text ?? "";

    expect(text).toContain("Context diagnostics");
    expect(text).toContain("Provider context sources");
    expect(text).toContain("provider-replay-messages:");
    expect(text).toContain("system-prompt:");
    expect(text).toContain("tool-schemas:");
    expect(text).toContain("tool-pool:");
    expect(text).toContain("tool-risk:");
    expect(text).toContain("tool-concurrency:");
    expect(text).toContain("slash-commands:");
    expect(text).toContain("slash-conflicts:");
    expect(text).toContain("Message breakdown");
    expect(text).toContain("roles:");
    expect(text).toContain("sources:");
    expect(text).toContain("Largest context items");
    expect(text).toContain("Largest tool results");
    expect(text).toContain("Context suggestions");
    expect(text).toContain("Memory / skill");
    expect(text).toContain("l2-recall: none");
    expect(text).toContain("active-skill: none");
    expect(text).toContain("Compact state");
  });

  it("reports the active skill in context diagnostics", async () => {
    const workspace = await makeWorkspace();
    const engine = makeEngine(workspace);

    await collect(engine.submitMessage("/skills use review"));
    await collect(engine.submitMessage("/context"));
    const text = engine.getMessages().at(-1)?.text ?? "";

    expect(text).toContain("active-skill: review");
  });

  it("reports the latest workflow skill suggestion in context diagnostics", async () => {
    const workspace = await makeWorkspace();
    const engine = makeEngine(workspace);

    await collect(engine.submitMessage("请查询 Dremio 里 @xu.sample_sales_daily 的表结构"));
    await collect(engine.submitMessage("/context"));
    const text = engine.getMessages().at(-1)?.text ?? "";

    expect(text).toContain("workflow-suggestion: beelink_data (/skills use beelink_data)");
    expect(text).toContain("workflow-suggestion-reason:");
  });
});
