import { describe, expect, it } from "vitest";

import { renderReportHtml } from "../../../src/reports/renderHtml";
import { renderReportMarkdown } from "../../../src/reports/renderMarkdown";
import type { ReportArtifact } from "../../../src/reports/types";

describe("report renderers", () => {
  it("renders markdown with question, insights, data, SQL, and caveats", () => {
    const markdown = renderReportMarkdown(sampleReport());
    expect(markdown).toContain("# Sales report");
    expect(markdown).toContain("## 问题");
    expect(markdown).toContain("Bread is best-selling");
    expect(markdown).toContain("select item_name");
    expect(markdown).toContain("queryId: q-1");
    expect(markdown).toContain("truncated=true");
    expect(markdown).toContain("result=/tmp/result.json");
    expect(markdown).toContain("model: lmstudio / qwen3.6");
    expect(markdown).toContain("preview_truncated");
  });

  it("renders safe HTML and escapes user-controlled text", () => {
    const html = renderReportHtml(sampleReport({ title: "<script>alert(1)</script>" }), {
      echarts: { mode: "none" },
    });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("Bread is best-selling");
    expect(html).toContain("queryId=q-1");
    expect(html).toContain("truncated=true");
    expect(html).toContain("/tmp/result.json");
    expect(html).toContain("暂无图表 artifact");
  });
});

function sampleReport(overrides: Partial<ReportArtifact> = {}): ReportArtifact {
  const now = "2026-05-03T00:00:00.000Z";
  return {
    version: 1,
    id: "report-1",
    title: "Sales report",
    question: "Analyze sales",
    owner: { type: "user", id: "user-1" },
    workspaceId: "ws-1",
    createdAt: now,
    updatedAt: now,
    status: "draft",
    datasets: [
      {
        id: "dataset-1",
        name: "sales",
        sql: "select item_name, sum(quantity) as quantity from sales group by item_name",
        queryId: "q-1",
        previewRows: 5,
        rowCount: 10,
        columns: [{ name: "item_name", type: "VARCHAR" }],
        resultArtifact: {
          path: "/tmp/result.json",
          kind: "json",
          createdAt: now,
        },
        provenance: {
          sql: "select item_name, sum(quantity) as quantity from sales group by item_name",
          queryId: "q-1",
          generatedBy: { provider: "lmstudio", model: "qwen3.6" },
          preview: { rows: 5, rowCount: 10, truncated: true },
          artifacts: {
            result: {
              path: "/tmp/result.json",
              kind: "json",
              createdAt: now,
            },
          },
        },
      },
    ],
    charts: [
      {
        id: "chart-1",
        title: "Top items",
        datasetId: "dataset-1",
        chart: { kind: "bar", x: "item_name", y: "quantity" },
      },
    ],
    sections: [],
    insights: [{ id: "insight-1", markdown: "Bread is best-selling" }],
    caveats: [{ code: "preview_truncated", message: "Only preview rows are shown" }],
    exports: [],
    provenance: { source: "manual", question: "Analyze sales", provider: "lmstudio", model: "qwen3.6" },
    ...overrides,
  };
}
