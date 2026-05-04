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
    expect(read.content).toContain('"id": "tool-user"');

    const list = await registry.invoke("ListReports", { workspaceId: "ws-1" }, ctx());
    expect(list.content).toContain("report-1");
  });

  it("uses the authenticated tool context owner instead of model-provided owner", async () => {
    const registry = new ToolRegistry();
    registerReportTools(registry, { artifactsRoot: tmpRoot });

    await registry.invoke(
      "CreateReportArtifact",
      {
        id: "report-owned-by-context",
        question: "Analyze food sales",
        owner: { type: "user", id: "local" },
        datasets: [{ id: "dataset-1", name: "sales", previewRows: 1 }],
        provenance: { source: "manual" },
      },
      ctx()
    );

    const read = await registry.invoke("ReadReport", { reportId: "report-owned-by-context" }, ctx());
    expect(read.content).toContain('"id": "tool-user"');
    expect(read.content).not.toContain('"id": "local"');
  });

  it("accepts common nested LLM report specs and derives the report question", async () => {
    const registry = new ToolRegistry();
    registerReportTools(registry, { artifactsRoot: tmpRoot });
    const resultPath = path.join(tmpRoot, "gender-result.json");

    const create = await registry.invoke(
      "CreateReportArtifact",
      {
        report: {
          id: "report-nested",
          title: "客户性别对比",
          datasets: [
            {
              id: "dataset-1",
              name: "gender comparison",
              data: [{ gender: "0", user_count: 489 }],
              previewRows: 1,
              resultArtifact: resultPath,
              provenance: {
                sql: "select gender, count(*) as user_count from users group by gender",
                queryId: "q-gender",
                artifacts: { result: resultPath },
              },
            },
          ],
          charts: [{ id: "chart-1", title: "Gender", datasetId: "dataset-1", type: "pie" }],
          sections: [{ title: "概览", content: "客户性别分布。" }],
          provenance: { source: "llm", question: "继续分析客户性别对比" },
        },
      },
      ctx()
    );

    expect(create).toMatchObject({ ok: true });
    const read = await registry.invoke("ReadReport", { reportId: "report-nested" }, ctx());
    expect(read.content).toContain('"question": "继续分析客户性别对比"');
    expect(read.content).toContain('"markdown": "客户性别分布。"');
    expect(read.content).toContain(`"path": "${resultPath}"`);
    const html = await registry.invoke("RenderReportHtml", { reportId: "report-nested" }, ctx());
    expect(html).toMatchObject({ ok: true });
    expect(existsSync(path.join(tmpRoot, "reports", "report-nested", "report.html"))).toBe(true);
  });

  it("returns an actionable retry template when report question is missing", async () => {
    const registry = new ToolRegistry();
    registerReportTools(registry, { artifactsRoot: tmpRoot });

    const create = await registry.invoke(
      "CreateReportArtifact",
      {
        datasets: [{ id: "dataset-1", name: "gender comparison", previewRows: 2 }],
        provenance: { source: "llm" },
      },
      ctx()
    );

    expect(create.ok).toBe(false);
    expect(create.content).toContain("CreateReportArtifact requires a non-empty question");
    expect(create.content).toContain('"question":"客户性别对比"');
    expect(create.content).toContain("Do not claim the report is saved");
  });

  it("injects a top-level SQL rule check into a single SQL dataset", async () => {
    const registry = new ToolRegistry();
    registerReportTools(registry, { artifactsRoot: tmpRoot });

    const create = await registry.invoke(
      "CreateReportArtifact",
      {
        id: "report-rule-check",
        question: "客户性别对比",
        datasets: [
          {
            id: "dataset-1",
            name: "gender comparison",
            sql: "select gender, count(*) as user_count from users group by gender",
            previewRows: 1,
            data: [{ gender: "0", user_count: 489 }],
            provenance: {
              sql: "select gender, count(*) as user_count from users group by gender",
              queryId: "q-gender",
            },
          },
        ],
        ruleCheck: { passed: true, errors: [], warnings: ["No LIMIT needed for small aggregate"] },
        provenance: { source: "llm", question: "客户性别对比" },
      },
      ctx()
    );

    expect(create).toMatchObject({ ok: true });
    expect(create.content).not.toContain("has SQL without rule-check provenance");
    const read = await registry.invoke("ReadReport", { reportId: "report-rule-check" }, ctx());
    expect(read.content).toContain('"ruleCheck"');
    expect(read.content).toContain("No LIMIT needed for small aggregate");
  });
});

function ctx() {
  return {
    workspace: "ws-1",
    userId: "tool-user",
    channel: "http",
    artifactsRoot: tmpRoot,
    permissionManager: {} as PermissionManager,
  };
}
