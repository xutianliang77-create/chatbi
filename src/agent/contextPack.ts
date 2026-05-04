import type { ToolEvidence } from "./evidence";

export interface ContextPackInput {
  prompt: string;
  evidence?: ToolEvidence[];
}

const MAX_PROMPT_CHARS = 220;
const MAX_EVIDENCE_ITEMS = 3;
const MAX_EVIDENCE_SUMMARY_CHARS = 180;

export function buildContextPack(input: ContextPackInput): string | null {
  const prompt = input.prompt.trim();
  const criteria = buildDoneCriteria(prompt);
  const recentEvidence = (input.evidence ?? []).slice(-MAX_EVIDENCE_ITEMS);

  if (criteria.length === 0 && !shouldIncludeEvidenceOnly(prompt, recentEvidence)) {
    return null;
  }

  const lines = ["[ContextPack]", `Task: ${clip(prompt, MAX_PROMPT_CHARS)}`];

  if (criteria.length > 0) {
    lines.push("Done criteria:");
    for (const item of criteria) {
      lines.push(`- ${item}`);
    }
  }

  if (recentEvidence.length > 0) {
    lines.push("Recent evidence:");
    for (const item of recentEvidence) {
      lines.push(
        `- ${item.toolName} ${item.status}: ${clip(item.resultSummary || item.argsPreview, MAX_EVIDENCE_SUMMARY_CHARS)}`
      );
    }
  }

  return lines.join("\n");
}

function buildDoneCriteria(prompt: string): string[] {
  const criteria: string[] = [];
  const lower = prompt.toLowerCase();

  if (/报告|report/.test(lower)) {
    criteria.push("Call CreateReportArtifact successfully before claiming the report is saved or visible.");
    criteria.push("If HTML/viewing is requested, call RenderReportHtml successfully before claiming HTML is ready.");
    criteria.push("Verify report visibility with ListReports or ReadReport when the user asks to see it in Reports.");
  }

  if (/dashboard|仪表盘|看板/.test(lower)) {
    criteria.push(
      "Call CreateDashboardSpec or UpgradeReportToDashboard successfully before claiming the dashboard exists."
    );
    criteria.push("Call ValidateDashboardSpec before relying on a generated dashboard spec.");
    criteria.push("If HTML/viewing is requested, call RenderDashboardHtml successfully before claiming HTML is ready.");
  }

  if (/artifact|export|导出|保存|文件|html|md|markdown/.test(lower)) {
    criteria.push("Do not claim an artifact, export, or file is saved until the matching tool evidence succeeded.");
  }

  return [...new Set(criteria)];
}

function shouldIncludeEvidenceOnly(prompt: string, evidence: ToolEvidence[]): boolean {
  if (evidence.length === 0) return false;
  return /继续|接着|刚才|上一步|重试|再来|continue|again|retry|resume/i.test(prompt);
}

function clip(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars - 3)}...` : value;
}
