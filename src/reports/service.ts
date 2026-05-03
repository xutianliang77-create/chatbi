import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { defaultArtifactsRoot } from "../agent/tools/artifact";
import { createReportId } from "./ids";
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
      datasets: input.datasets,
      charts: input.charts ?? [],
      sections: input.sections ?? [],
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
