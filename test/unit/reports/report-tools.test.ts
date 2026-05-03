import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ToolRegistry } from "../../../src/agent/tools/registry";
import { registerReportTools } from "../../../src/reports/tools";
import type { PermissionManager } from "../../../src/permissions/manager";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), "codeclaw-report-tools-"));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("report product tools", () => {
  it("registers, creates, renders, reads, and lists reports", async () => {
    const registry = new ToolRegistry();
    registerReportTools(registry, { artifactsRoot: tmpRoot });

    expect(registry.has("CreateReportArtifact")).toBe(true);
    expect(registry.has("RenderReportHtml")).toBe(true);

    const create = await registry.invoke(
      "CreateReportArtifact",
      {
        id: "report-1",
        title: "Food report",
        question: "Analyze food sales",
        workspaceId: "ws-1",
        datasets: [
          {
            id: "dataset-1",
            name: "sales",
            previewRows: 5,
            columns: [{ name: "item_name", type: "VARCHAR" }],
          },
        ],
        insights: [{ id: "insight-1", markdown: "Bread wins" }],
        provenance: { source: "manual", question: "Analyze food sales" },
      },
      ctx()
    );
    expect(create).toMatchObject({ ok: true });
    expect(create.content).toContain("report-1");

    const html = await registry.invoke("RenderReportHtml", { reportId: "report-1" }, ctx());
    expect(html.ok).toBe(true);
    expect(existsSync(path.join(tmpRoot, "reports", "report-1", "report.html"))).toBe(true);

    const read = await registry.invoke("ReadReport", { reportId: "report-1" }, ctx());
    expect(read.content).toContain("Food report");

    const list = await registry.invoke("ListReports", { workspaceId: "ws-1" }, ctx());
    expect(list.content).toContain("report-1");
  });
});

function ctx() {
  return {
    workspace: "ws-1",
    permissionManager: {} as PermissionManager,
  };
}
