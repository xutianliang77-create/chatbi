import type { ToolEvidence } from "./evidence";

export interface CompletionGateResult {
  text: string;
  blocked: boolean;
  warnings: string[];
}

interface ClaimRule {
  name: string;
  claimPattern: RegExp;
  requiredTools: string[];
  warning: string;
}

const CLAIM_RULES: ClaimRule[] = [
  {
    name: "report-created",
    claimPattern: /(报告|report)[\s\S]{0,40}(已|已经|成功|created|saved|generated|可在|visible|see)/i,
    requiredTools: ["CreateReportArtifact", "mcp__beelink__CreateReportArtifact"],
    warning: "报告完成声明缺少 CreateReportArtifact 成功证据。",
  },
  {
    name: "report-rendered",
    claimPattern: /(报告|report)[\s\S]{0,40}(HTML|渲染|rendered|打开|view)/i,
    requiredTools: ["RenderReportHtml", "mcp__beelink__RenderReportHtml"],
    warning: "报告 HTML/渲染完成声明缺少 RenderReportHtml 成功证据。",
  },
  {
    name: "dashboard-created",
    claimPattern: /(dashboard|仪表盘|看板)[\s\S]{0,40}(已|已经|成功|created|saved|generated|升级|upgraded|可在|visible|see)/i,
    requiredTools: ["CreateDashboardSpec", "UpgradeReportToDashboard", "mcp__beelink__CreateDashboardSpec"],
    warning: "Dashboard 完成声明缺少 CreateDashboardSpec 或 UpgradeReportToDashboard 成功证据。",
  },
  {
    name: "dashboard-rendered",
    claimPattern: /(dashboard|仪表盘|看板)[\s\S]{0,40}(HTML|渲染|rendered|打开|view)/i,
    requiredTools: ["RenderDashboardHtml", "mcp__beelink__RenderDashboardHtml"],
    warning: "Dashboard HTML/渲染完成声明缺少 RenderDashboardHtml 成功证据。",
  },
  {
    name: "artifact-created",
    claimPattern: /(artifact|文件|HTML|JSON|导出|export)[\s\S]{0,40}(已|已经|成功|created|saved|generated|写入|保存|导出)/i,
    requiredTools: [
      "ExportSqlArtifact",
      "RenderReportHtml",
      "RenderDashboardHtml",
      "write",
      "mcp__beelink__ExportSqlArtifact",
    ],
    warning: "artifact/文件完成声明缺少导出、渲染或写入成功证据。",
  },
];

export function applyCompletionGate(text: string, evidence: ToolEvidence[]): CompletionGateResult {
  const warnings = missingEvidenceWarnings(text, evidence);
  if (warnings.length === 0) {
    return { text, blocked: false, warnings };
  }
  return {
    text: appendGateWarning(text, warnings),
    blocked: true,
    warnings,
  };
}

function missingEvidenceWarnings(text: string, evidence: ToolEvidence[]): string[] {
  const successfulTools = new Set(
    evidence.filter((item) => item.status === "succeeded").map((item) => item.toolName)
  );
  const warnings: string[] = [];
  for (const rule of CLAIM_RULES) {
    if (!rule.claimPattern.test(text)) continue;
    if (rule.requiredTools.some((tool) => successfulTools.has(tool))) continue;
    warnings.push(rule.warning);
  }
  return Array.from(new Set(warnings));
}

function appendGateWarning(text: string, warnings: string[]): string {
  return [
    text.trimEnd(),
    "",
    "[CompletionGate]",
    "上面的完成声明缺少对应工具成功证据，因此请把它视为未验证完成。",
    ...warnings.map((warning) => `- ${warning}`),
    "建议继续执行必要工具并验证后，再宣称完成。",
  ].join("\n");
}
