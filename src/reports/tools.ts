import type { ToolDefinition, ToolRegistry } from "../agent/tools/registry";
import { FileReportStore } from "./store";
import { ReportService, type CreateReportInput } from "./service";
import type { PrincipalRef, ReportListQuery } from "./types";

export interface RegisterReportToolsOptions {
  artifactsRoot?: string;
}

export const REPORT_TOOL_NAMES = [
  "CreateReportArtifact",
  "RenderReportHtml",
  "ReadReport",
  "ListReports",
] as const;

export function createReportToolDefinitions(options: RegisterReportToolsOptions = {}): ToolDefinition[] {
  const service = createService(options);
  return [
    {
      name: "CreateReportArtifact",
      description:
        "Create a CodeClaw ReportArtifact from real query datasets, chart specs, insights, caveats, and provenance. Use for one-time analysis reports.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          question: { type: "string" },
          owner: { type: "object" },
          workspaceId: { type: "string" },
          sessionId: { type: "string" },
          traceId: { type: "string" },
          datasets: { type: "array" },
          charts: { type: "array" },
          sections: { type: "array" },
          insights: { type: "array" },
          caveats: { type: "array" },
          provenance: { type: "object" },
        },
        required: ["question", "datasets", "provenance"],
        additionalProperties: false,
      },
      async invoke(args, ctx) {
        const input = asRecord(args);
        const question = requiredString(input.question, "question");
        const report = await service.create({
          ...(typeof input.id === "string" ? { id: input.id } : {}),
          ...(typeof input.title === "string" ? { title: input.title } : {}),
          question,
          owner: asOwner(input.owner) ?? { type: "user", id: "local" },
          workspaceId: typeof input.workspaceId === "string" ? input.workspaceId : ctx.workspace,
          ...(typeof input.sessionId === "string" ? { sessionId: input.sessionId } : {}),
          ...(typeof input.traceId === "string" ? { traceId: input.traceId } : {}),
          datasets: arrayOrEmpty(input.datasets) as CreateReportInput["datasets"],
          charts: arrayOrEmpty(input.charts) as CreateReportInput["charts"],
          sections: arrayOrEmpty(input.sections) as CreateReportInput["sections"],
          insights: arrayOrEmpty(input.insights) as CreateReportInput["insights"],
          caveats: arrayOrEmpty(input.caveats) as CreateReportInput["caveats"],
          provenance: input.provenance as CreateReportInput["provenance"],
        });
        return { ok: true, content: `Report created: ${report.id}` };
      },
    },
    {
      name: "RenderReportHtml",
      description: "Render an existing ReportArtifact to a local HTML artifact and return its path.",
      inputSchema: {
        type: "object",
        properties: {
          reportId: { type: "string" },
        },
        required: ["reportId"],
        additionalProperties: false,
      },
      async invoke(args) {
        const id = requiredString(asRecord(args).reportId, "reportId");
        const artifact = await service.renderHtml(id);
        return { ok: true, content: `Report HTML: ${artifact.path}` };
      },
    },
    {
      name: "ReadReport",
      description: "Read a saved CodeClaw ReportArtifact JSON by id.",
      inputSchema: {
        type: "object",
        properties: {
          reportId: { type: "string" },
        },
        required: ["reportId"],
        additionalProperties: false,
      },
      async invoke(args) {
        const id = requiredString(asRecord(args).reportId, "reportId");
        const report = await service.read(id);
        return { ok: true, content: JSON.stringify(report, null, 2) };
      },
    },
    {
      name: "ListReports",
      description: "List saved CodeClaw reports, optionally filtered by owner, workspace, status, or limit.",
      inputSchema: {
        type: "object",
        properties: {
          ownerId: { type: "string" },
          workspaceId: { type: "string" },
          status: { type: "string" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
      async invoke(args) {
        const input = asRecord(args);
        const result = await service.list({
          ...(typeof input.ownerId === "string" ? { ownerId: input.ownerId } : {}),
          ...(typeof input.workspaceId === "string" ? { workspaceId: input.workspaceId } : {}),
          ...(typeof input.status === "string" ? { status: input.status as ReportListQuery["status"] } : {}),
          ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
        });
        return { ok: true, content: JSON.stringify(result, null, 2) };
      },
    },
  ];
}

export function registerReportTools(registry: ToolRegistry, options: RegisterReportToolsOptions = {}): void {
  for (const tool of createReportToolDefinitions(options)) registry.register(tool);
}

function createService(options: RegisterReportToolsOptions): ReportService {
  return new ReportService(new FileReportStore({ artifactsRoot: options.artifactsRoot }), {
    artifactsRoot: options.artifactsRoot,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asOwner(value: unknown): PrincipalRef | undefined {
  const record = asRecord(value);
  if (
    (record.type === "user" || record.type === "service" || record.type === "team") &&
    typeof record.id === "string"
  ) {
    return {
      type: record.type,
      id: record.id,
      ...(typeof record.displayName === "string" ? { displayName: record.displayName } : {}),
    };
  }
  return undefined;
}
