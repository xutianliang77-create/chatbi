import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { defaultArtifactsRoot } from "../agent/tools/artifact";
import { createReportId } from "./ids";
import { normalizeChartKind, reportDatasetColumns, reportDatasetPreviewRows } from "./compat";
import { enrichReportDatasetsProvenance } from "./provenance";
import { renderReportHtml } from "./renderHtml";
import { renderReportMarkdown } from "./renderMarkdown";
import { validateReportArtifact } from "./validate";
import type {
  ArtifactRef,
  DataCaveat,
  PrincipalRef,
  ReportArtifact,
  ReportChart,
  ReportDataset,
  ReportInsight,
  ReportListQuery,
  ReportListResult,
  ReportProvenance,
  ReportSection,
  ReportStore,
} from "./types";

export interface CreateReportInput {
  id?: string;
  title?: string;
  question: string;
  owner: PrincipalRef;
  workspaceId: string;
  sessionId?: string;
  traceId?: string;
  datasets: ReportDataset[];
  charts?: ReportChart[];
  sections?: ReportSection[];
  insights?: ReportInsight[];
  caveats?: DataCaveat[];
  provenance: ReportProvenance;
}

export interface ReportServiceOptions {
  artifactsRoot?: string;
  now?: () => Date;
}

export class ReportService {
  private readonly artifactsRoot: string;
  private readonly now: () => Date;

  constructor(private readonly store: ReportStore, options: ReportServiceOptions = {}) {
    this.artifactsRoot = path.resolve(options.artifactsRoot ?? defaultArtifactsRoot());
    this.now = options.now ?? (() => new Date());
  }

  async create(input: CreateReportInput): Promise<ReportArtifact> {
    const now = this.nowIso();
    const datasets = normalizeReportDatasets(input.datasets, now);
    const report: ReportArtifact = {
      version: 1,
      id: input.id ?? createReportId(),
      title: input.title ?? input.question,
      question: input.question,
      owner: input.owner,
      workspaceId: input.workspaceId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.traceId ? { traceId: input.traceId } : {}),
      createdAt: now,
      updatedAt: now,
      status: "draft",
      datasets: enrichReportDatasetsProvenance(datasets, input.provenance, input.caveats ?? []),
      charts: normalizeReportCharts(input.charts ?? [], datasets),
      sections: normalizeReportSections(input.sections ?? []),
      insights: input.insights ?? [],
      caveats: input.caveats ?? [],
      exports: [],
      provenance: input.provenance,
    };
    this.assertValid(report);
    await this.store.create(report);
    await this.store.appendAudit(report.id, {
      id: `audit-${Date.now()}`,
      reportId: report.id,
      actor: report.owner,
      action: "create",
      at: now,
    });
    return report;
  }

  async renderMarkdown(id: string): Promise<ArtifactRef> {
    const report = await this.store.read(id);
    const content = renderReportMarkdown(report);
    const ref = await this.writeReportArtifact(id, "report.md", content, "markdown");
    await this.store.writeExport(id, ref);
    return ref;
  }

  async renderHtml(id: string): Promise<ArtifactRef> {
    const report = await this.store.read(id);
    const content = renderReportHtml(report);
    const ref = await this.writeReportArtifact(id, "report.html", content, "html");
    await this.store.writeExport(id, ref);
    await this.store.appendAudit(id, {
      id: `audit-${Date.now()}`,
      reportId: id,
      actor: report.owner,
      action: "render",
      at: this.nowIso(),
      details: { format: "html" },
    });
    return ref;
  }

  async exportReport(id: string, format: "html" | "markdown"): Promise<ArtifactRef> {
    return format === "markdown" ? this.renderMarkdown(id) : this.renderHtml(id);
  }

  async read(id: string): Promise<ReportArtifact> {
    return this.store.read(id);
  }

  async list(query: ReportListQuery = {}): Promise<ReportListResult> {
    return this.store.list(query);
  }

  private assertValid(report: ReportArtifact): void {
    const validation = validateReportArtifact(report, { artifactsRoot: this.artifactsRoot });
    if (!validation.valid) {
      throw new Error(`invalid report: ${validation.errors.join("; ")}`);
    }
  }

  private async writeReportArtifact(
    id: string,
    fileName: string,
    content: string,
    kind: ArtifactRef["kind"]
  ): Promise<ArtifactRef> {
    const file = path.join(this.artifactsRoot, "reports", id, fileName);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
    return {
      path: file,
      kind,
      bytes: Buffer.byteLength(content, "utf8"),
      createdAt: this.nowIso(),
    };
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

function normalizeReportDatasets(datasets: ReportDataset[], createdAt: string): ReportDataset[] {
  return datasets.map((dataset, index) => {
    const provenance = normalizeDatasetProvenance(dataset.provenance, createdAt);
    return {
      ...dataset,
      id: dataset.id || `dataset-${index + 1}`,
      name: dataset.name || dataset.id || `Dataset ${index + 1}`,
      previewRows: reportDatasetPreviewRows(dataset),
      columns: reportDatasetColumns(dataset),
      ...(normalizeArtifactRef(dataset.previewArtifact, createdAt) ? { previewArtifact: normalizeArtifactRef(dataset.previewArtifact, createdAt) } : {}),
      ...(normalizeArtifactRef(dataset.resultArtifact, createdAt) ? { resultArtifact: normalizeArtifactRef(dataset.resultArtifact, createdAt) } : {}),
      ...(provenance ? { provenance } : {}),
    };
  });
}

function normalizeReportSections(sections: ReportSection[]): ReportSection[] {
  return sections.map((section, index) => {
    const record = section as unknown as Record<string, unknown>;
    const markdown = typeof section.markdown === "string" ? section.markdown : stringOrEmpty(record.content);
    return {
      ...section,
      id: section.id || `section-${index + 1}`,
      title: section.title || `Section ${index + 1}`,
      markdown,
    };
  });
}

function normalizeReportCharts(charts: ReportChart[], datasets: ReportDataset[]): ReportChart[] {
  const fallbackDatasetId = datasets[0]?.id;
  return charts.map((chart, index) => {
    const record = chart as unknown as Record<string, unknown>;
    const nested = asRecord(record.chart);
    const inferredKind = normalizeChartKind(nested.kind ?? record.kind ?? record.type);
    return {
      ...chart,
      id: chart.id || `chart-${index + 1}`,
      title: chart.title || `Chart ${index + 1}`,
      datasetId: chart.datasetId || fallbackDatasetId || `dataset-${index + 1}`,
      chart: {
        ...pickChartShorthand(record),
        ...nested,
        kind: inferredKind,
      },
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeDatasetProvenance(
  provenance: ReportDataset["provenance"] | undefined,
  createdAt: string
): ReportDataset["provenance"] | undefined {
  if (!provenance) return undefined;
  const artifacts = provenance.artifacts
    ? {
        ...(normalizeArtifactRef(provenance.artifacts.preview, createdAt)
          ? { preview: normalizeArtifactRef(provenance.artifacts.preview, createdAt) }
          : {}),
        ...(normalizeArtifactRef(provenance.artifacts.result, createdAt)
          ? { result: normalizeArtifactRef(provenance.artifacts.result, createdAt) }
          : {}),
      }
    : undefined;
  return {
    ...provenance,
    ...(artifacts && Object.keys(artifacts).length > 0 ? { artifacts } : {}),
  };
}

function normalizeArtifactRef(value: unknown, createdAt: string): ArtifactRef | undefined {
  if (typeof value === "string" && value.trim()) {
    return {
      path: value.trim(),
      kind: artifactKindFromPath(value),
      createdAt,
    };
  }
  const record = asRecord(value);
  if (typeof record.path === "string" && record.path.trim()) {
    return {
      path: record.path.trim(),
      kind: artifactKind(record.kind, record.path),
      ...(typeof record.bytes === "number" ? { bytes: record.bytes } : {}),
      ...(typeof record.sha256 === "string" ? { sha256: record.sha256 } : {}),
      createdAt: typeof record.createdAt === "string" ? record.createdAt : createdAt,
    };
  }
  return undefined;
}

function artifactKind(value: unknown, filePath: string): ArtifactRef["kind"] {
  const allowed = new Set<ArtifactRef["kind"]>(["json", "markdown", "html", "png", "pdf", "pptx", "text"]);
  return typeof value === "string" && allowed.has(value as ArtifactRef["kind"])
    ? (value as ArtifactRef["kind"])
    : artifactKindFromPath(filePath);
}

function artifactKindFromPath(filePath: string): ArtifactRef["kind"] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".html" || ext === ".htm") return "html";
  if (ext === ".png") return "png";
  if (ext === ".pdf") return "pdf";
  if (ext === ".pptx") return "pptx";
  return "text";
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickChartShorthand(record: Record<string, unknown>): Record<string, unknown> {
  const keys = ["title", "x", "y", "series", "color", "sort", "limit", "aggregation", "options"];
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) picked[key] = record[key];
  }
  return picked;
}
