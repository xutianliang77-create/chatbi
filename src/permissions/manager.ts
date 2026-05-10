import type { PermissionMode } from "../lib/config";

export type ToolRiskLevel = "low" | "medium" | "high";

export type ToolPermissionInput =
  | {
      tool: "read";
      target: string;
    }
  | {
      tool: "glob";
      target: string;
    }
  | {
      tool: "symbol" | "definition" | "references";
      target: string;
    }
  | {
      tool: "write" | "append";
      target: string;
    }
  | {
      tool: "replace";
      target: string;
    }
  | {
      tool: "bash";
      command: string;
    }
  | {
      tool: "web-fetch";
      url: string;
    }
  | {
      tool: "browser-read";
      action: string;
    }
  | {
      tool: "email-draft";
      action: string;
    }
  | {
      tool: "mcp-read";
      server: string;
      resource: string;
    }
  | {
      tool: "mcp-call";
      server: string;
      toolName: string;
    };

export interface PermissionDecision {
  behavior: "allow" | "ask" | "deny";
  risk: ToolRiskLevel;
  reason: string;
}

const SAFE_BASH_PREFIXES = [
  "pwd",
  "ls",
  "cat",
  "head",
  "tail",
  "find",
  "rg",
  "grep",
  "git status",
  "git diff"
] as const;

const DANGEROUS_BASH_PATTERNS = [
  /\brm\b/,
  /\bsudo\b/,
  /\bmv\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bgit reset\b/,
  /\bgit checkout --\b/,
  />>?/,
  /\btee\b/,
  /\bdd\b/,
  /\bmkfs\b/,
  /\breboot\b/,
  /\bshutdown\b/,
  // 命令替换：safe prefix 嵌套时让 shell 先跑内部命令，绕过 risk 分类
  // negative lookahead 把 $((...)) 算术展开放行（不跑命令）
  /\$\((?!\()/,
  /`/,
];
const BASH_CHAIN_PATTERN = /(\|\||&&|;|\|)/;

// 测试用导出（生产代码内部用法保持为隐式调用）
export { classifyBashCommand as classifyBashCommandForTest };
function classifyBashCommand(command: string): ToolRiskLevel {
  const normalized = command.trim();

  if (!normalized) {
    return "high";
  }

  if (DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "high";
  }

  if (BASH_CHAIN_PATTERN.test(normalized)) {
    const segments = normalized
      .split(BASH_CHAIN_PATTERN)
      .map((segment) => segment.trim())
      .filter((segment) => segment && !BASH_CHAIN_PATTERN.test(segment));
    if (segments.some((segment) => DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(segment)))) {
      return "high";
    }
    return segments.every(isSafeBashPrefix) ? "low" : "medium";
  }

  if (isSafeBashPrefix(normalized)) {
    return "low";
  }

  return "medium";
}

const COMPUTER_USE_SERVER_PATTERN = /^ghost[-_]os$/i;
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

export { classifyMcpCallRisk as classifyMcpCallRiskForTest };
function classifyMcpCallRisk(server: string, toolName: string): ToolRiskLevel {
  const nativeMatch = /^mcp__([^_]+(?:[-_][^_]+)?)__(.+)$/.exec(toolName);
  const resolvedServer = nativeMatch?.[1] ?? server;
  const resolvedTool = nativeMatch?.[2] ?? toolName;
  if (!COMPUTER_USE_SERVER_PATTERN.test(resolvedServer)) return "medium";
  if (COMPUTER_USE_LOW_RISK_TOOLS.has(resolvedTool)) return "low";
  if (COMPUTER_USE_MEDIUM_RISK_TOOLS.has(resolvedTool)) return "medium";
  if (COMPUTER_USE_HIGH_RISK_TOOLS.has(resolvedTool)) return "high";
  return "high";
}

function isSafeBashPrefix(command: string): boolean {
  return SAFE_BASH_PREFIXES.some((prefix) => command === prefix || command.startsWith(`${prefix} `));
}

export class PermissionManager {
  constructor(private mode: PermissionMode) {}

  getMode(): PermissionMode {
    return this.mode;
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  evaluate(input: ToolPermissionInput): PermissionDecision {
    const risk =
      input.tool === "read" ||
      input.tool === "glob" ||
      input.tool === "symbol" ||
      input.tool === "definition" ||
      input.tool === "references" ||
      input.tool === "web-fetch" ||
      input.tool === "mcp-read"
        ? "low"
        : input.tool === "bash"
          ? classifyBashCommand(input.command)
          : input.tool === "mcp-call"
            ? classifyMcpCallRisk(input.server, input.toolName)
          : "medium";

    if (this.mode === "bypassPermissions" || this.mode === "dontAsk") {
      return {
        behavior: "allow",
        risk,
        reason: `permission mode ${this.mode} allows ${input.tool}`
      };
    }

    if (this.mode === "auto" || this.mode === "acceptEdits") {
      if (risk === "high") {
        return {
          behavior: "deny",
          risk,
          reason: `permission mode ${this.mode} blocks high-risk ${input.tool}`
        };
      }

      return {
        behavior: "allow",
        risk,
        reason: `permission mode ${this.mode} allows ${risk}-risk ${input.tool}`
      };
    }

    if (risk === "low") {
      return {
        behavior: "allow",
        risk,
        reason: `permission mode ${this.mode} allows low-risk ${input.tool}`
      };
    }

    return {
      behavior: "ask",
      risk,
      reason: `permission mode ${this.mode} requires approval for ${risk}-risk ${input.tool}`
    };
  }
}
