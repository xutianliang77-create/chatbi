import { describe, expect, it } from "vitest";

import { validateDashboardSpec } from "../../../src/dashboards/validate";
import type { DashboardSpec } from "../../../src/dashboards/types";

describe("validateDashboardSpec", () => {
  it("accepts a minimal valid dashboard", () => {
    const result = validateDashboardSpec(sampleDashboard());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects invalid widget and filter references", () => {
    const dashboard = sampleDashboard({
      pages: [
        {
          id: "page-1",
          title: "Overview",
          order: 1,
          layout: { columns: 12, rowHeight: 80, responsive: true },
          widgets: [
            {
              id: "widget-1",
              type: "chart",
              title: "Bad",
              datasetId: "missing",
              layout: { x: 0, y: 0, w: 6, h: 4 },
              chart: { kind: "bar", x: "item_name", y: "quantity" },
            },
          ],
        },
      ],
      filters: [
        {
          id: "filter-1",
          title: "Bad filter",
          datasetId: "dataset-1",
          field: "missing",
          type: "single_select",
        },
      ],
    });

    const result = validateDashboardSpec(dashboard);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("widget widget-1 references missing dataset: missing");
    expect(result.errors).toContain("filter filter-1 references missing field: missing");
  });

  it("rejects unchecked SQL datasets", () => {
    const result = validateDashboardSpec(
      sampleDashboard({
        datasets: [
          {
            ...sampleDashboard().datasets[0],
            kind: "sql",
            sql: "select * from sales",
            safety: { readOnlyChecked: false, maxRows: 1000, upstreamPermissions: "current-user" },
          },
        ],
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("sql dataset must be read-only checked: dataset-1");
  });
});

function sampleDashboard(overrides: Partial<DashboardSpec> = {}): DashboardSpec {
  const now = "2026-05-03T00:00:00.000Z";
  return {
    version: 1,
    id: "dashboard-1",
    title: "Sales dashboard",
    owner: { type: "user", id: "user-1" },
    workspaceId: "ws-1",
    createdAt: now,
    updatedAt: now,
    status: "draft",
    datasets: [
      {
        id: "dataset-1",
        name: "sales",
        kind: "artifact",
        previewRows: 5,
        columns: [{ name: "item_name", type: "VARCHAR" }],
        refresh: { mode: "manual" },
        safety: { readOnlyChecked: true, maxRows: 1000, upstreamPermissions: "current-user" },
      },
    ],
    pages: [
      {
        id: "page-1",
        title: "Overview",
        order: 1,
        layout: { columns: 12, rowHeight: 80, responsive: true },
        widgets: [],
      },
    ],
    filters: [],
    parameters: [],
    interactions: [],
    permissions: [],
    schedules: [],
    subscriptions: [],
    provenance: { source: "manual" },
    lifecycle: { version: 1 },
    ...overrides,
  };
}
