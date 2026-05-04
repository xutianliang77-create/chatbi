import { describe, expect, it } from "vitest";
import { buildContextPack } from "../../../src/agent/contextPack";
import type { ToolEvidence } from "../../../src/agent/evidence";

describe("ContextPack", () => {
  it("adds report done criteria for report prompts", () => {
    const pack = buildContextPack({ prompt: "生成一个销售报告" });

    expect(pack).toContain("[ContextPack]");
    expect(pack).toContain("CreateReportArtifact");
    expect(pack).toContain("RenderReportHtml");
  });

  it("stays out of ordinary chat when there is no useful context", () => {
    expect(buildContextPack({ prompt: "hi" })).toBeNull();
  });

  it("summarizes recent evidence for continuation prompts", () => {
    const pack = buildContextPack({
      prompt: "继续",
      evidence: [
        evidence({ toolName: "ExploreForQuestion", resultSummary: "Found @xu.sample_sales_daily" }),
        evidence({ toolName: "RunSqlQuery", resultSummary: "Query preview rows: 5" }),
      ],
    });

    expect(pack).toContain("Recent evidence");
    expect(pack).toContain("ExploreForQuestion succeeded");
    expect(pack).toContain("RunSqlQuery succeeded");
  });
});

function evidence(overrides: Partial<ToolEvidence> = {}): ToolEvidence {
  return {
    id: "ev-1",
    sessionId: "session-1",
    toolName: "read",
    status: "succeeded",
    createdAt: 1,
    argsHash: "hash",
    argsPreview: "{}",
    resultSummary: "ok",
    ...overrides,
  };
}
