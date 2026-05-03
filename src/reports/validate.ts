import { assertArtifactRefsWithinRoot } from "./store";
import type { ReportArtifact } from "./types";

export interface ReportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ReportValidationOptions {
  artifactsRoot?: string;
}

export function validateReportArtifact(
  report: ReportArtifact,
  options: ReportValidationOptions = {}
): ReportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (report.version !== 1) errors.push("report version must be 1");
  if (!report.id) errors.push("report id is required");
  if (!report.title) errors.push("report title is required");
  if (!report.question) errors.push("report question is required");
  if (!report.owner?.id) errors.push("report owner is required");
  if (!report.workspaceId) errors.push("report workspaceId is required");
  if (report.datasets.length === 0) errors.push("report requires at least one dataset");

  const datasetIds = new Set<string>();
  for (const dataset of report.datasets) {
    if (datasetIds.has(dataset.id)) errors.push(`duplicate dataset id: ${dataset.id}`);
    datasetIds.add(dataset.id);
    if (dataset.sql && !dataset.provenance?.ruleCheck) {
      warnings.push(`dataset ${dataset.id} has SQL without rule-check provenance`);
    }
  }

  const chartIds = new Set<string>();
  for (const chart of report.charts) {
    if (chartIds.has(chart.id)) errors.push(`duplicate chart id: ${chart.id}`);
    chartIds.add(chart.id);
    if (!datasetIds.has(chart.datasetId)) {
      errors.push(`chart ${chart.id} references missing dataset: ${chart.datasetId}`);
    }
  }

  for (const section of report.sections) {
    for (const datasetId of section.datasetIds ?? []) {
      if (!datasetIds.has(datasetId)) errors.push(`section ${section.id} references missing dataset: ${datasetId}`);
    }
    for (const chartId of section.chartIds ?? []) {
      if (!chartIds.has(chartId)) errors.push(`section ${section.id} references missing chart: ${chartId}`);
    }
  }

  if (options.artifactsRoot) {
    try {
      assertArtifactRefsWithinRoot(report, options.artifactsRoot);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
