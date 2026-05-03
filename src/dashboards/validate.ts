import { assertArtifactRefsWithinRoot } from "../reports/store";
import type { DashboardSpec } from "./types";

export interface DashboardValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DashboardValidationOptions {
  artifactsRoot?: string;
}

export function validateDashboardSpec(
  dashboard: DashboardSpec,
  options: DashboardValidationOptions = {}
): DashboardValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (dashboard.version !== 1) errors.push("dashboard version must be 1");
  if (!dashboard.id) errors.push("dashboard id is required");
  if (!dashboard.title) errors.push("dashboard title is required");
  if (!dashboard.owner?.id) errors.push("dashboard owner is required");
  if (!dashboard.workspaceId) errors.push("dashboard workspaceId is required");
  if (dashboard.pages.length === 0) errors.push("dashboard requires at least one page");

  const datasets = new Map(dashboard.datasets.map((dataset) => [dataset.id, dataset]));
  const widgetIds = new Set<string>();
  for (const dataset of dashboard.datasets) {
    if (dataset.kind === "sql" && !dataset.safety.readOnlyChecked) {
      errors.push(`sql dataset must be read-only checked: ${dataset.id}`);
    }
  }

  for (const page of dashboard.pages) {
    for (const widget of page.widgets) {
      if (widgetIds.has(widget.id)) errors.push(`duplicate widget id: ${widget.id}`);
      widgetIds.add(widget.id);
      if (widget.datasetId && !datasets.has(widget.datasetId)) {
        errors.push(`widget ${widget.id} references missing dataset: ${widget.datasetId}`);
      }
    }
  }

  for (const filter of dashboard.filters) {
    const dataset = datasets.get(filter.datasetId);
    if (!dataset) {
      errors.push(`filter ${filter.id} references missing dataset: ${filter.datasetId}`);
      continue;
    }
    if (!dataset.columns.some((column) => column.name === filter.field)) {
      errors.push(`filter ${filter.id} references missing field: ${filter.field}`);
    }
  }

  for (const interaction of dashboard.interactions) {
    if (!widgetIds.has(interaction.sourceWidgetId)) {
      errors.push(`interaction ${interaction.id} references missing source widget: ${interaction.sourceWidgetId}`);
    }
    for (const widgetId of interaction.targetWidgetIds ?? []) {
      if (!widgetIds.has(widgetId)) errors.push(`interaction ${interaction.id} references missing target widget: ${widgetId}`);
    }
  }

  if (dashboard.status === "published" && dashboard.permissions.length === 0) {
    warnings.push("published dashboard has no explicit permissions");
  }

  if (options.artifactsRoot) {
    try {
      assertArtifactRefsWithinRoot(dashboard, options.artifactsRoot);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
