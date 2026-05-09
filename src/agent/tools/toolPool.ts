/**
 * Unified tool pool projection.
 *
 * ToolRegistry owns registration and invocation. ToolPool owns the view that is
 * exposed to the model for the current runtime mode, including why a tool is
 * visible or hidden. This mirrors the "assemble tool pool first, call provider
 * second" boundary without changing existing registration behavior.
 */

import type { ToolDefinition, ToolRegistry } from "./registry";

export type ToolPoolSource = "builtin" | "mcp" | "extension";
export type ToolPoolRisk = "low" | "medium" | "high";
export type ToolPoolConcurrency = "parallel" | "serial" | "exclusive";
export type ToolPoolApproval = "none" | "permission_manager";

export interface ToolPoolEntry {
  tool: ToolDefinition;
  source: ToolPoolSource;
  risk: ToolPoolRisk;
  concurrency: ToolPoolConcurrency;
  approval: ToolPoolApproval;
  visible: boolean;
  hiddenReason?: "permission_mode_plan";
}

export interface AssembleToolPoolOptions {
  permissionMode: string;
  planModeAllowedTools?: ReadonlySet<string>;
}

export function classifyToolSource(name: string): ToolPoolSource {
  if (name.startsWith("mcp__")) return "mcp";
  if (name.startsWith("ext__")) return "extension";
  return "builtin";
}

export function classifyToolRisk(name: string): ToolPoolRisk {
  if (READ_ONLY_TOOLS.has(name)) return "low";
  if (WRITE_TOOLS.has(name)) return "medium";
  if (name === "bash" || name === "Task") return "medium";
  if (name.startsWith("mcp__") || name.startsWith("ext__")) return "medium";
  if (REPORT_DASHBOARD_WRITE_TOOLS.has(name)) return "medium";
  if (name === "memory_write" || name === "memory_remove") return "medium";
  return "medium";
}

export function classifyToolConcurrency(name: string, risk = classifyToolRisk(name)): ToolPoolConcurrency {
  if (name === "Task") return "exclusive";
  if (risk === "low" && READ_ONLY_TOOLS.has(name)) return "parallel";
  return "serial";
}

export function classifyToolApproval(name: string, risk = classifyToolRisk(name)): ToolPoolApproval {
  if (risk === "low" && !name.startsWith("mcp__") && !name.startsWith("ext__")) return "none";
  return "permission_manager";
}

export function assembleToolPool(
  registry: ToolRegistry,
  options: AssembleToolPoolOptions
): ToolPoolEntry[] {
  const visibleNames = new Set(
    registry
      .listForMode(options.permissionMode, options.planModeAllowedTools)
      .map((tool) => tool.name)
  );

  return registry.list().map((tool) => {
    const visible = visibleNames.has(tool.name);
    const risk = classifyToolRisk(tool.name);
    return {
      tool,
      source: classifyToolSource(tool.name),
      risk,
      concurrency: classifyToolConcurrency(tool.name, risk),
      approval: classifyToolApproval(tool.name, risk),
      visible,
      hiddenReason:
        visible || options.permissionMode !== "plan" ? undefined : "permission_mode_plan",
    };
  });
}

export function listVisibleToolPoolTools(
  registry: ToolRegistry,
  options: AssembleToolPoolOptions
): ToolDefinition[] {
  return assembleToolPool(registry, options)
    .filter((entry) => entry.visible)
    .map((entry) => entry.tool);
}

const READ_ONLY_TOOLS = new Set([
  "read",
  "glob",
  "symbol",
  "definition",
  "references",
  "read_artifact",
  "web_fetch",
  "knowledge_search",
  "rag_search",
  "graph_query",
  "ReadReport",
  "ListReports",
  "ReadDashboard",
  "ListDashboards",
]);

const WRITE_TOOLS = new Set(["write", "append", "replace"]);

const REPORT_DASHBOARD_WRITE_TOOLS = new Set([
  "CreateReportArtifact",
  "UpdateReportArtifact",
  "RenderReportHtml",
  "ExportReportArtifact",
  "UpgradeReportToDashboard",
  "CreateDashboardSpec",
  "ValidateDashboardSpec",
  "RenderDashboardHtml",
  "CreateEmailDraft",
  "ReadEmailDraft",
  "ListEmailDrafts",
]);
