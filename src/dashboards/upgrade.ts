import { createDashboardId } from "./ids";
import type { DashboardDataset, DashboardPage, DashboardSpec, DashboardStore, DashboardWidget } from "./types";
import { enrichReportDatasetsProvenance } from "../reports/provenance";
import type { PrincipalRef, ReportStore } from "../reports/types";

export interface UpgradeReportToDashboardInput {
  reportId: string;
  title?: string;
  owner: PrincipalRef;
  workspaceId: string;
  includeChartIds?: string[];
  refreshMode?: "manual" | "scheduled";
  dashboardId?: string;
  now?: () => Date;
}

export async function upgradeReportToDashboard(
  input: UpgradeReportToDashboardInput,
  deps: {
    reportStore: ReportStore;
    dashboardStore: DashboardStore;
  }
): Promise<DashboardSpec> {
  const now = (input.now ?? (() => new Date()))().toISOString();
  const report = await deps.reportStore.read(input.reportId);
  const include = input.includeChartIds ? new Set(input.includeChartIds) : null;
  const charts = include ? report.charts.filter((chart) => include.has(chart.id)) : report.charts;
  const sourceDatasets = enrichReportDatasetsProvenance(report.datasets, report.provenance, report.caveats);

  const datasets: DashboardDataset[] = sourceDatasets.map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    kind: dataset.sql ? "sql" : "artifact",
    ...(dataset.sql ? { sql: dataset.sql } : {}),
    ...(dataset.resultArtifact ? { resultArtifact: dataset.resultArtifact } : {}),
    ...(dataset.previewArtifact ? { sourceArtifact: dataset.previewArtifact } : {}),
    previewRows: dataset.previewRows,
    ...(dataset.rowCount === undefined ? {} : { rowCount: dataset.rowCount }),
    columns: dataset.columns.map((column) => ({ ...column, semanticRole: "unknown" })),
    refresh: { mode: input.refreshMode ?? "manual" },
    safety: {
      readOnlyChecked: Boolean(dataset.provenance?.ruleCheck?.passed ?? !dataset.sql),
      maxRows: dataset.rowCount ?? 1000,
      upstreamPermissions: "current-user",
    },
    ...(dataset.provenance ? { provenance: dataset.provenance } : {}),
  }));

  const chartWidgets: DashboardWidget[] = charts.map((chart, index) => ({
    id: `widget-${chart.id}`,
    type: "chart",
    title: chart.title,
    datasetId: chart.datasetId,
    layout: { x: (index % 2) * 6, y: Math.floor(index / 2) * 4, w: 6, h: 4 },
    chart: chart.chart,
    ...(chart.quality ? { quality: chart.quality } : {}),
  }));

  const textWidgets: DashboardWidget[] = report.sections.slice(0, 3).map((section, index) => ({
    id: `widget-section-${section.id}`,
    type: "text",
    title: section.title,
    text: section.markdown,
    layout: { x: 0, y: chartWidgets.length * 4 + index * 3, w: 12, h: 3 },
  }));

  const pages: DashboardPage[] = [
    {
      id: "page-overview",
      title: "Overview",
      order: 1,
      layout: { columns: 12, rowHeight: 80, responsive: true },
      widgets: [...chartWidgets, ...textWidgets],
    },
  ];

  const dashboard: DashboardSpec = {
    version: 1,
    id: input.dashboardId ?? createDashboardId(),
    title: input.title ?? report.title,
    description: `Upgraded from report ${report.id}`,
    owner: input.owner,
    workspaceId: input.workspaceId,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    sourceReportId: report.id,
    datasets,
    pages,
    filters: [],
    parameters: [],
    interactions: [],
    permissions: [],
    schedules: [],
    subscriptions: [],
    provenance: {
      source: "report_upgrade",
      sourceReportId: report.id,
      question: report.question,
      sessionId: report.sessionId,
      traceId: report.traceId,
      model: report.provenance.model,
      provider: report.provenance.provider,
    },
    lifecycle: { version: 1 },
  };

  await deps.dashboardStore.create(dashboard);
  await deps.dashboardStore.writeVersion(dashboard);
  await deps.dashboardStore.appendAudit(dashboard.id, {
    id: `audit-${Date.now()}`,
    dashboardId: dashboard.id,
    actor: input.owner,
    action: "create",
    at: now,
    details: { sourceReportId: report.id },
  });

  await deps.reportStore.update({
    ...report,
    updatedAt: now,
    upgrade: {
      dashboardId: dashboard.id,
      upgradedAt: now,
      upgradedBy: input.owner,
    },
  });

  return dashboard;
}
