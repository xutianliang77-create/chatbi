import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { FileReportStore } from "../../../src/reports/store";
import { ReportService } from "../../../src/reports/service";
import type { ReportDataset } from "../../../src/reports/types";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), "codeclaw-report-service-"));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("ReportService", () => {
  it("creates a report and renders markdown/html artifacts", async () => {
    const service = new ReportService(new FileReportStore({ artifactsRoot: tmpRoot }), {
      artifactsRoot: tmpRoot,
      now: () => new Date("2026-05-03T00:00:00.000Z"),
    });

    const report = await service.create({
      id: "report-1",
      title: "Food report",
      question: "Analyze food sales",
      owner: { type: "user", id: "user-1" },
      workspaceId: "ws-1",
      datasets: [dataset()],
      insights: [{ id: "insight-1", markdown: "Bread wins by quantity" }],
      provenance: { source: "manual", question: "Analyze food sales" },
    });

    const markdown = await service.renderMarkdown(report.id);
    const html = await service.renderHtml(report.id);
    const reread = await service.read(report.id);

    expect(markdown.path).toBe(path.join(tmpRoot, "reports", "report-1", "report.md"));
    expect(html.path).toBe(path.join(tmpRoot, "reports", "report-1", "report.html"));
    expect(existsSync(markdown.path)).toBe(true);
    expect(readFileSync(html.path, "utf8")).toContain("Food report");
    expect(reread.exports.map((item) => item.format).sort()).toEqual(["html", "markdown"]);
  });

  it("rejects invalid reports before persisting", async () => {
    const service = new ReportService(new FileReportStore({ artifactsRoot: tmpRoot }), { artifactsRoot: tmpRoot });

    await expect(
      service.create({
        id: "report-1",
        question: "Analyze food sales",
        owner: { type: "user", id: "user-1" },
        workspaceId: "ws-1",
        datasets: [],
        provenance: { source: "manual", question: "Analyze food sales" },
      })
    ).rejects.toThrow(/invalid report/);
  });
});

function dataset(): ReportDataset {
  return {
    id: "dataset-1",
    name: "sales",
    sql: "select item_name, sum(quantity) as quantity from sales group by item_name",
    queryId: "q-1",
    previewRows: 5,
    columns: [{ name: "item_name", type: "VARCHAR" }, { name: "quantity", type: "INTEGER" }],
    provenance: {
      sql: "select item_name, sum(quantity) as quantity from sales group by item_name",
      queryId: "q-1",
      ruleCheck: { passed: true, errors: [], warnings: [] },
    },
  };
}
