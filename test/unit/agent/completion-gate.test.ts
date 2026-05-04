import { describe, expect, it } from "vitest";
import { applyCompletionGate } from "../../../src/agent/completionGate";
import type { ToolEvidence } from "../../../src/agent/evidence";

describe("CompletionGate", () => {
  it("adds a warning when a report completion claim has no creation evidence", () => {
    const result = applyCompletionGate("报告已成功创建，并且可以在 Reports 中看到。", []);

    expect(result.blocked).toBe(true);
    expect(result.text).toContain("[CompletionGate]");
    expect(result.text).toContain("CreateReportArtifact");
  });

  it("allows report completion claims when CreateReportArtifact succeeded", () => {
    const result = applyCompletionGate("报告已成功创建，并且可以在 Reports 中看到。", [
      evidence({ toolName: "CreateReportArtifact" }),
    ]);

    expect(result.blocked).toBe(false);
    expect(result.text).not.toContain("[CompletionGate]");
  });

  it("does not treat non-completion analysis as a blocked artifact claim", () => {
    const result = applyCompletionGate("建议下一步创建报告，但目前还没有执行保存。", []);

    expect(result.blocked).toBe(false);
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
