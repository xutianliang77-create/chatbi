/**
 * Skill SDK · registry · #71
 *
 * 合并 builtin skills + user skills（来自 ~/.codeclaw/skills/）：
 *   - get(name) 优先 builtin（防 user manifest 覆盖；loader 也已拒重名）
 *   - list() 返合并集合：builtin 先，user 后
 *   - createSkillRegistryFromDisk() 同步从默认 skills dir 加载
 *
 * 不变量：
 *   - SkillDefinition.source 反映来源（builtin / user / signed）
 *   - 加载错误不阻塞启动；调用方可读 loadErrors 决定 doctor / log 显示
 */

import type { SkillDefinition } from "./types";
import { defaultUserSkillsDir, loadUserSkillsFromDir, type LoadResult } from "./loader";

// 旧调用方仍从 registry 拿 SkillDefinition；保持向后兼容
export type { SkillDefinition, SkillManifest, SkillSource, SkillSignature } from "./types";

const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    name: "review",
    description: "Bug-focused code review with read-only investigation.",
    whenToUse: "Use when the user asks for review, bug finding, regressions, risks, or missing tests without requesting edits.",
    prompt:
      "Act in review mode. Focus on bugs, regressions, risks, and missing validation. Prefer concrete evidence from files, symbols, references, and safe verification commands before concluding.",
    allowedTools: ["read", "glob", "symbol", "definition", "references", "bash"],
    context: "inline",
    source: "builtin",
  },
  {
    name: "explain",
    description: "Codebase explanation and architecture walkthrough mode.",
    whenToUse: "Use when the user asks to understand architecture, files, symbols, flows, or design tradeoffs.",
    prompt:
      "Act in explanation mode. Prioritize clarity, file references, symbol navigation, and concise mental models over editing. Only inspect and explain unless the user later changes the skill.",
    allowedTools: ["read", "glob", "symbol", "definition", "references"],
    context: "inline",
    source: "builtin",
  },
  {
    name: "patch",
    description: "Guided patching mode with edit-capable tools.",
    whenToUse: "Use when the user asks to implement, fix, refactor, or otherwise change repository files.",
    prompt:
      "Act in patch mode. Inspect first, then propose or execute the smallest targeted code edits needed to satisfy the request. Keep changes surgical and validate with safe commands when available.",
    allowedTools: ["read", "glob", "symbol", "definition", "references", "bash", "write", "append", "replace"],
    context: "inline",
    source: "builtin",
  },
  // #82 data_insight：用 bash + sqlite3 跑只读 SQL 查询，输出 markdown 表
  {
    name: "data_insight",
    description: "Read-only SQLite analysis: run SELECT queries via sqlite3 CLI and summarize results.",
    whenToUse: "Use for local read-only SQLite data analysis, schema inspection, aggregation, and markdown result summaries.",
    prompt:
      "Act as a data analyst on a SQLite database. " +
      "Use bash with `sqlite3 <db-path>` to inspect schema (.schema, .tables) and run SELECT queries. " +
      "Always use `-readonly` flag (`sqlite3 -readonly <db>`) to avoid accidental writes. " +
      "Format query results as markdown tables in your reply (codeclaw provides formatMarkdownTable for skills). " +
      "Never run INSERT/UPDATE/DELETE/CREATE; refuse if the user asks to mutate data. " +
      "For complex analysis, suggest python via the runPython skill helper (user must opt-in to install matplotlib etc).",
    allowedTools: ["read", "glob", "bash"],
    context: "inline",
    source: "builtin",
  },
  {
    name: "beelink_data",
    description: "Dremio/Beelink governed data analysis workflow using semantic metadata and SQL safety checks.",
    whenToUse: "Use when the user asks BI/data questions over Dremio/Beelink governed datasets, metadata sync, schema discovery, SQL generation, or SQL repair.",
    prompt:
      "Act as a governed data analyst using Beelink MCP. " +
      "Do not route ordinary chat to Beelink. For data questions, first use local semantic/metadata evidence when available, then call Beelink MCP only as needed. " +
      "Preferred workflow: RunSemanticSearch or ExploreForQuestion -> GetDescriptionOfTableOrSchema when table/schema detail is needed -> BuildSqlGuidance -> CheckSqlAgainstRules -> RunSqlQuery with previewRows default 5. " +
      "If SQL fails, call RepairSqlAttempt before trying another query. " +
      "Never invent table names, columns, row values, query ids, artifacts, or permissions. Explain uncertainty and preview truncation. " +
      "For report/dashboard requests, preserve provenance: SQL, query id, artifacts, preview rows, row count, truncated state, provider/model when known.",
    allowedTools: ["read", "glob", "bash"],
    context: "inline",
    agent: "data-analyst",
    mcpServers: ["beelink"],
    mcpTools: [
      "mcp__beelink__RunSemanticSearch",
      "mcp__beelink__ExploreForQuestion",
      "mcp__beelink__GetDescriptionOfTableOrSchema",
      "mcp__beelink__BuildSqlGuidance",
      "mcp__beelink__CheckSqlAgainstRules",
      "mcp__beelink__RunSqlQuery",
      "mcp__beelink__RepairSqlAttempt",
      "mcp__beelink__ExportSqlArtifact",
    ],
    source: "builtin",
  },
  {
    name: "email",
    description: "Safe email drafting mode that creates local .eml/json drafts without sending.",
    whenToUse:
      "Use when the user asks to draft, polish, summarize, or prepare an email, especially for report delivery.",
    prompt:
      "Act as an email drafting assistant. Always distinguish draft creation from sending. " +
      "Use CreateEmailDraft when the user asks to prepare an email artifact. Never claim an email was sent; CodeClaw email tools only create local .eml/json drafts. " +
      "Before creating a draft, ensure recipients, subject, body, and attachments/report references are explicit or safely inferred. " +
      "For report delivery, mention attached artifact paths and preserve provenance/caveats in the email body.",
    allowedTools: ["read", "glob", "CreateEmailDraft", "ReadEmailDraft", "ListEmailDrafts"],
    context: "inline",
    agent: "writer",
    source: "builtin",
  },
  {
    name: "radiology",
    description: "Chinese radiology assistant mode for image review with medical safety boundaries.",
    whenToUse: "Use only when the user explicitly wants radiology or DICOM image interpretation assistance.",
    prompt:
      "Act as 小医, a radiology-focused clinical decision support assistant. " +
      "Always answer in Chinese. If a DICOM MCP server is available, inspect and render .dcm files through the DICOM tools before asking the vision model to interpret them; never send raw DICOM bytes to the model. " +
      "Use only deidentified metadata in prompts and avoid persisting PHI into memory. " +
      "For image interpretation, provide structured findings, impression, uncertainty, and urgent-review warnings. " +
      "State that the output is auxiliary and must be confirmed by a licensed radiologist or clinician.",
    allowedTools: ["read", "glob", "bash"],
    context: "inline",
    agent: "radiology",
    mcpServers: ["dicom"],
    mcpTools: [
      "mcp__dicom__InspectDicomFile",
      "mcp__dicom__RenderDicomPreview",
      "mcp__dicom__PrepareDicomForVision",
    ],
    source: "builtin",
  },
  {
    name: "computer_use",
    description: "Ghost OS MCP desktop automation workflow for macOS computer use.",
    whenToUse:
      "Use only when the user explicitly asks CodeClaw to operate a local desktop app, browser window, or macOS UI through Ghost OS / computer use.",
    prompt:
      "Act as a cautious desktop automation operator using Ghost OS MCP. " +
      "Never use computer-use tools for ordinary chat, code reading, or data analysis. " +
      "Always start by orienting with ghost_context or ghost_state. Prefer recipes first: ghost_recipes -> ghost_recipe_show -> ghost_run when a matching recipe exists. " +
      "Before any action, find and inspect the target element with ghost_find, ghost_read, ghost_inspect, ghost_element_at, ghost_screenshot, or ghost_annotate. " +
      "For click/type/hotkey/drag/window/focus/recipe-save/learning tools, explain the intended action and rely on CodeClaw permission gates; do not bypass approvals. " +
      "After actions, call ghost_wait or re-read state to verify the UI changed as expected. " +
      "Do not click irreversible controls such as send, purchase, delete, submit, approve, or payment unless the user explicitly requested that exact action in the current turn. " +
      "Keep screenshots and accessibility-tree output brief; summarize sensitive screen content instead of repeating it verbatim.",
    allowedTools: ["read", "glob"],
    context: "inline",
    agent: "computer-operator",
    mcpServers: ["ghost-os"],
    mcpTools: [
      "mcp__ghost-os__ghost_context",
      "mcp__ghost-os__ghost_state",
      "mcp__ghost-os__ghost_find",
      "mcp__ghost-os__ghost_read",
      "mcp__ghost-os__ghost_inspect",
      "mcp__ghost-os__ghost_element_at",
      "mcp__ghost-os__ghost_screenshot",
      "mcp__ghost-os__ghost_annotate",
      "mcp__ghost-os__ghost_click",
      "mcp__ghost-os__ghost_type",
      "mcp__ghost-os__ghost_press",
      "mcp__ghost-os__ghost_hotkey",
      "mcp__ghost-os__ghost_scroll",
      "mcp__ghost-os__ghost_hover",
      "mcp__ghost-os__ghost_long_press",
      "mcp__ghost-os__ghost_drag",
      "mcp__ghost-os__ghost_focus",
      "mcp__ghost-os__ghost_window",
      "mcp__ghost-os__ghost_wait",
      "mcp__ghost-os__ghost_recipes",
      "mcp__ghost-os__ghost_run",
      "mcp__ghost-os__ghost_recipe_show",
      "mcp__ghost-os__ghost_recipe_save",
      "mcp__ghost-os__ghost_recipe_delete",
      "mcp__ghost-os__ghost_ground",
      "mcp__ghost-os__ghost_parse_screen",
      "mcp__ghost-os__ghost_learn_start",
      "mcp__ghost-os__ghost_learn_stop",
      "mcp__ghost-os__ghost_learn_status",
    ],
    source: "builtin",
  },
];

const BUILTIN_NAMES = new Set(BUILTIN_SKILLS.map((s) => s.name));

export class SkillRegistry {
  private readonly userSkills: SkillDefinition[];
  private readonly loadErrors: LoadResult["errors"];

  constructor(opts: { userSkills?: SkillDefinition[]; loadErrors?: LoadResult["errors"] } = {}) {
    this.userSkills = opts.userSkills ?? [];
    this.loadErrors = opts.loadErrors ?? [];
  }

  list(): SkillDefinition[] {
    return [...BUILTIN_SKILLS, ...this.userSkills];
  }

  /** name 不区分大小写；builtin 优先 */
  get(name: string): SkillDefinition | null {
    const normalizedName = name.trim().toLowerCase();
    const builtin = BUILTIN_SKILLS.find((s) => s.name === normalizedName);
    if (builtin) return builtin;
    return this.userSkills.find((s) => s.name === normalizedName) ?? null;
  }

  getLoadErrors(): LoadResult["errors"] {
    return this.loadErrors;
  }
}

/** 同步构造：仅 builtin（向后兼容） */
export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry();
}

/** 同步构造：扫盘 ~/.codeclaw/skills 加载 user skills */
export function createSkillRegistryFromDisk(opts: { skillsDir?: string } = {}): SkillRegistry {
  const dir = opts.skillsDir ?? defaultUserSkillsDir();
  const result = loadUserSkillsFromDir(dir, BUILTIN_NAMES);
  return new SkillRegistry({
    userSkills: result.skills,
    loadErrors: result.errors,
  });
}
