import { describe, expect, it } from "vitest";

import { validateReportArtifact } from "../../../src/reports/validate";
import type { ReportArtifact } from "../../../src/reports/types";

describe("validateReportArtifact", () => {
  it("accepts a minimal valid report", () => {
    const result = validateReportArtifact(sampleReport());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing datasets and invalid chart references", () => {
    const report = sampleReport({
      datasets: [],
      charts: [
        {
          id: "chart-1",
          title: "Bad chart",
          datasetId: "missing",
          chart: { kind: "bar", x: "item_name", y: "quantity" },
        },
      ],
    });
    const result = validateReportArtifact(report);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("report requires at least one dataset");
    expect(result.errors).toContain("chart chart-1 references missing dataset: missing");
  });

  it("warns when SQL lacks rule-check provenance", () => {
    const result = validateReportArtifact(
      sampleReport({
        datasets: [
          {
            id: "dataset-1",
            name: "sales",
            sql: "select * from sales",
            previewRows: 5,
            columns: [{ name: "item_name" }],
          },
        ],
      })
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain("dataset dataset-1 has SQL without rule-check provenance");
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
        previewRows: 5,
        columns: [{ name: "item_name", type: "VARCHAR" }],
      },
    ],
    charts: [],
    sections: [],
    insights: [],
    caveats: [],
    exports: [],
    provenance: { source: "manual", question: "Analyze sales" },
    ...overrides,
  };
}
