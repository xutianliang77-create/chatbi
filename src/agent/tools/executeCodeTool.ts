import vm from "node:vm";
import type { ToolDefinition, ToolInvokeContext, ToolRegistry } from "./registry";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_TOOL_CALLS = 20;
const DEFAULT_MAX_OUTPUT_CHARS = 12_000;

const ALLOWED_TOOLS = new Set([
  "read",
  "glob",
  "read_artifact",
  "session_search",
  "knowledge_search",
  "rag_search",
  "graph_query",
]);

export function registerExecuteCodeTool(registry: ToolRegistry): void {
  if (registry.has("execute_code")) return;
  registry.register(buildExecuteCodeTool(registry));
}

function buildExecuteCodeTool(registry: ToolRegistry): ToolDefinition {
  return {
    name: "execute_code",
    description:
      "Run a small JavaScript async function that may call only read-only CodeClaw tools through tools.call(name,args). " +
      "Use it to batch repetitive read/search operations without flooding the main context. No imports, filesystem, shell, network, writes, MCP, or nested execute_code.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "JavaScript function body. You may use `await tools.call('glob', {pattern:'src/**/*.ts'})` and `return ...`.",
        },
        timeoutMs: {
          type: "number",
          description: "Optional timeout in ms, default 10000, max 30000.",
        },
        maxToolCalls: {
          type: "number",
          description: "Optional max read-only tool calls, default 20, max 50.",
        },
      },
      required: ["code"],
      additionalProperties: false,
    },
    async invoke(args, ctx) {
      const parsed = parseArgs(args);
      if (!parsed.code) {
        return { ok: false, content: "[execute_code] missing 'code'", isError: true, errorCode: "invalid_args" };
      }
      if (hasBlockedSyntax(parsed.code)) {
        return {
          ok: false,
          content:
            "[execute_code] blocked syntax. Imports, require, process, filesystem, eval/function constructors, and shell-like APIs are not available.",
          isError: true,
          errorCode: "blocked_syntax",
        };
      }

      const timeoutMs = Math.max(100, Math.min(30_000, parsed.timeoutMs ?? DEFAULT_TIMEOUT_MS));
      const maxToolCalls = Math.max(1, Math.min(50, parsed.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS));
      const calls: Array<{ name: string; ok: boolean }> = [];
      let toolCallCount = 0;
      const tools = {
        call: async (name: string, toolArgs: unknown) => {
          if (!ALLOWED_TOOLS.has(name)) {
            throw new Error(`tool not allowed in execute_code: ${name}`);
          }
          toolCallCount += 1;
          if (toolCallCount > maxToolCalls) {
            throw new Error(`execute_code exceeded maxToolCalls=${maxToolCalls}`);
          }
          const result = await registry.invoke(name, toolArgs, ctx);
          calls.push({ name, ok: result.ok });
          return {
            ok: result.ok,
            content: result.content,
            ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          };
        },
      };

      try {
        const fn = compileUserFunction(parsed.code);
        const value = await withTimeout(Promise.resolve(fn(tools)), timeoutMs);
        const output = stringifyResult(value);
        return {
          ok: true,
          content: [
            "[execute_code] completed",
            `toolCalls: ${toolCallCount}`,
            `called: ${calls.map((call) => `${call.name}:${call.ok ? "ok" : "error"}`).join(", ") || "none"}`,
            "result:",
            clip(output, DEFAULT_MAX_OUTPUT_CHARS),
          ].join("\n"),
        };
      } catch (err) {
        return {
          ok: false,
          content: `[execute_code] ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
          errorCode: "execution_failed",
        };
      }
    },
  };
}

function parseArgs(args: unknown): { code?: string; timeoutMs?: number; maxToolCalls?: number } {
  if (!args || typeof args !== "object") return {};
  const input = args as Record<string, unknown>;
  return {
    code: typeof input.code === "string" ? input.code.trim() : undefined,
    timeoutMs: typeof input.timeoutMs === "number" ? input.timeoutMs : undefined,
    maxToolCalls: typeof input.maxToolCalls === "number" ? input.maxToolCalls : undefined,
  };
}

function hasBlockedSyntax(code: string): boolean {
  return /\b(import|require|process|globalThis|global|Buffer|Function|eval|fetch|XMLHttpRequest)\b|node:|child_process|fs\./.test(code);
}

function compileUserFunction(code: string): (tools: { call(name: string, args: unknown): Promise<unknown> }) => Promise<unknown> {
  const script = new vm.Script(`(async (tools) => {\n"use strict";\n${code}\n})`, {
    filename: "codeclaw-execute-code.vm.js",
  });
  const context = vm.createContext(Object.freeze({}));
  return script.runInContext(context, { timeout: 100 }) as (tools: {
    call(name: string, args: unknown): Promise<unknown>;
  }) => Promise<unknown>;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stringifyResult(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "null";
}

function clip(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 3)}...`;
}
