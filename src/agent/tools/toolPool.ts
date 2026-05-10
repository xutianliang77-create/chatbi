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
export type ToolsetProfile =
  | "all"
  | "safe"
  | "coding"
  | "bi"
  | "browser"
  | "computer"
  | "office"
  | "medical";

export interface ToolPoolEntry {
  tool: ToolDefinition;
  source: ToolPoolSource;
  risk: ToolPoolRisk;
  concurrency: ToolPoolConcurrency;
  approval: ToolPoolApproval;
  visible: boolean;
  hiddenReason?: "permission_mode_plan" | "toolset_profile" | "active_skill";
}

export interface AssembleToolPoolOptions {
  permissionMode: string;
  planModeAllowedTools?: ReadonlySet<string>;
  profile?: ToolsetProfile;
  activeSkillTools?: ReadonlySet<string>;
}

export function classifyToolSource(name: string): ToolPoolSource {
  if (name.startsWith("mcp__")) return "mcp";
  if (name.startsWith("ext__")) return "extension";
  return "builtin";
}

export function classifyToolRisk(name: string): ToolPoolRisk {
  if (READ_ONLY_TOOLS.has(name)) return "low";
  const computerRisk = classifyComputerUseToolRisk(name);
  if (computerRisk) return computerRisk;
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
  const modeVisibleNames = new Set(
    registry
      .listForMode(options.permissionMode, options.planModeAllowedTools)
      .map((tool) => tool.name)
  );
  const profile = options.profile ?? "all";

  return registry.list().map((tool) => {
    const modeVisible = modeVisibleNames.has(tool.name);
    const profileVisible = isToolVisibleForProfile(tool.name, profile);
    const skillVisible = !options.activeSkillTools || options.activeSkillTools.has(tool.name);
    const visible = modeVisible && profileVisible && skillVisible;
    const risk = classifyToolRisk(tool.name);
    return {
      tool,
      source: classifyToolSource(tool.name),
      risk,
      concurrency: classifyToolConcurrency(tool.name, risk),
      approval: classifyToolApproval(tool.name, risk),
      visible,
      hiddenReason: visible
        ? undefined
        : !modeVisible && options.permissionMode === "plan"
          ? "permission_mode_plan"
          : !profileVisible
            ? "toolset_profile"
            : !skillVisible
              ? "active_skill"
              : undefined,
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
  "session_search",
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

const BASE_READ_TOOLS = new Set([
  "read",
  "glob",
  "symbol",
  "definition",
  "references",
  "read_artifact",
  "session_search",
  "knowledge_search",
  "rag_search",
  "graph_query",
]);

const CODE_EDIT_TOOLS = new Set(["bash", "write", "append", "replace", "Task"]);
const PROGRAMMATIC_READ_TOOLS = new Set(["execute_code"]);

const REPORT_DASHBOARD_TOOLS = new Set([
  "ReadReport",
  "ListReports",
  "CreateReportArtifact",
  "UpdateReportArtifact",
  "RenderReportHtml",
  "ExportReportArtifact",
  "ReadDashboard",
  "ListDashboards",
  "UpgradeReportToDashboard",
  "CreateDashboardSpec",
  "ValidateDashboardSpec",
  "RenderDashboardHtml",
]);

const EMAIL_TOOLS = new Set(["CreateEmailDraft", "ReadEmailDraft", "ListEmailDrafts"]);

export function normalizeToolsetProfile(value: string | undefined): ToolsetProfile {
  const normalized = (value ?? "").trim().toLowerCase();
  if (
    normalized === "safe" ||
    normalized === "coding" ||
    normalized === "bi" ||
    normalized === "browser" ||
    normalized === "computer" ||
    normalized === "office" ||
    normalized === "medical"
  ) {
    return normalized;
  }
  return "all";
}

export function isToolVisibleForProfile(name: string, profile: ToolsetProfile): boolean {
  if (profile === "all") return true;
  if (name === "ExitPlanMode" || name === "memory_write" || name === "memory_remove") return true;

  if (profile === "safe") {
    return BASE_READ_TOOLS.has(name) || PROGRAMMATIC_READ_TOOLS.has(name) || name === "web_fetch";
  }

  if (profile === "coding") {
    return BASE_READ_TOOLS.has(name) || PROGRAMMATIC_READ_TOOLS.has(name) || CODE_EDIT_TOOLS.has(name) || name === "web_fetch";
  }

  if (profile === "bi") {
    return (
      BASE_READ_TOOLS.has(name) ||
      PROGRAMMATIC_READ_TOOLS.has(name) ||
      REPORT_DASHBOARD_TOOLS.has(name) ||
      EMAIL_TOOLS.has(name) ||
      /^mcp__(beelink|dremio)__/.test(name)
    );
  }

  if (profile === "browser") {
    return name === "web_fetch" || name.startsWith("browser_") || name === "read_artifact" || name === "session_search";
  }

  if (profile === "computer") {
    return BASE_READ_TOOLS.has(name) || PROGRAMMATIC_READ_TOOLS.has(name) || name === "web_fetch" || name.startsWith("browser_") || isComputerUseMcpTool(name);
  }

  if (profile === "office") {
    return BASE_READ_TOOLS.has(name) || PROGRAMMATIC_READ_TOOLS.has(name) || REPORT_DASHBOARD_TOOLS.has(name) || EMAIL_TOOLS.has(name);
  }

  if (profile === "medical") {
    return BASE_READ_TOOLS.has(name) || PROGRAMMATIC_READ_TOOLS.has(name) || /^mcp__dicom__/.test(name) || name === "bash";
  }

  return true;
}

const COMPUTER_USE_MCP_PREFIX = /^mcp__ghost[-_]os__/;

const COMPUTER_USE_LOW_RISK_TOOLS = new Set([
  "ghost_context",
  "ghost_state",
  "ghost_find",
  "ghost_read",
  "ghost_inspect",
  "ghost_element_at",
  "ghost_wait",
  "ghost_recipes",
  "ghost_recipe_show",
  "ghost_learn_status",
]);

const COMPUTER_USE_MEDIUM_RISK_TOOLS = new Set([
  "ghost_screenshot",
  "ghost_annotate",
  "ghost_ground",
  "ghost_parse_screen",
]);

const COMPUTER_USE_HIGH_RISK_TOOLS = new Set([
  "ghost_click",
  "ghost_type",
  "ghost_press",
  "ghost_hotkey",
  "ghost_scroll",
  "ghost_hover",
  "ghost_long_press",
  "ghost_drag",
  "ghost_focus",
  "ghost_window",
  "ghost_run",
  "ghost_recipe_save",
  "ghost_recipe_delete",
  "ghost_learn_start",
  "ghost_learn_stop",
]);

function isComputerUseMcpTool(name: string): boolean {
  return COMPUTER_USE_MCP_PREFIX.test(name);
}

function classifyComputerUseToolRisk(name: string): ToolPoolRisk | null {
  if (!isComputerUseMcpTool(name)) return null;
  const tool = name.split("__").pop() ?? "";
  if (COMPUTER_USE_LOW_RISK_TOOLS.has(tool)) return "low";
  if (COMPUTER_USE_MEDIUM_RISK_TOOLS.has(tool)) return "medium";
  if (COMPUTER_USE_HIGH_RISK_TOOLS.has(tool)) return "high";
  return "high";
}
