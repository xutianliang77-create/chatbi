import type { SkillDefinition } from "../skills/types";

export interface WorkflowSkillSuggestion {
  skill: SkillDefinition;
  reason: string;
  promptHint: string;
}

const BEELINK_PATTERNS = [
  /\bbeelink\b/i,
  /\bdremio\b/i,
  /\bRunSqlQuery\b/i,
  /\bBuildSqlGuidance\b/i,
  /\bCheckSqlAgainstRules\b/i,
  /@\w+(?:\.|\()/,
  /语义层|元数据|湖仓|数据湖|数据集|表结构|同步元数据/,
];

const RADIOLOGY_PATTERNS = [
  /\bdicom\b/i,
  /\.dcm\b/i,
  /\bct\b/i,
  /\bmri\b/i,
  /放射|影像|片子|胸片|骨片|X光|x光|核磁|磁共振|断层扫描/,
];

const COMPUTER_USE_PATTERNS = [
  /\bcomputer[-_\s]?use\b/i,
  /\bghost[-_\s]?os\b/i,
  /\bghost_context\b/i,
  /\bghost_click\b/i,
  /操作电脑|控制电脑|控制桌面|桌面自动化|点击屏幕|帮我点击|打开应用|操作浏览器|自动填表|拖拽|热键|截图并点击/,
];

export function suggestWorkflowSkill(
  prompt: string,
  skills: readonly SkillDefinition[],
  activeSkill: SkillDefinition | null
): WorkflowSkillSuggestion | null {
  if (activeSkill) return null;
  const text = prompt.trim();
  if (!text) return null;

  if (matchesAny(text, BEELINK_PATTERNS)) {
    return buildSuggestion(skills, "beelink_data", "prompt mentions Beelink/Dremio governed data or Dremio-style table references");
  }

  if (matchesAny(text, RADIOLOGY_PATTERNS)) {
    return buildSuggestion(skills, "radiology", "prompt mentions radiology or DICOM imaging workflow");
  }

  if (matchesAny(text, COMPUTER_USE_PATTERNS)) {
    return buildSuggestion(skills, "computer_use", "prompt mentions local desktop automation or Ghost OS computer-use workflow");
  }

  return null;
}

export function formatWorkflowSkillSuggestion(suggestion: WorkflowSkillSuggestion): string {
  const mcp = suggestion.skill.mcpServers?.length
    ? ` MCP servers: ${suggestion.skill.mcpServers.join(", ")}.`
    : "";
  return [
    "[Workflow skill suggestion]",
    `This request appears to match skill "${suggestion.skill.name}": ${suggestion.reason}.`,
    `Do not auto-activate it. If useful, briefly tell the user they can run /skills use ${suggestion.skill.name}.`,
    `Use this only as guidance; do not assume MCP availability unless tools are actually present.${mcp}`,
  ].join("\n");
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function buildSuggestion(
  skills: readonly SkillDefinition[],
  skillName: string,
  reason: string
): WorkflowSkillSuggestion | null {
  const skill = skills.find((candidate) => candidate.name === skillName);
  if (!skill) return null;
  return {
    skill,
    reason,
    promptHint: `/skills use ${skill.name}`,
  };
}
