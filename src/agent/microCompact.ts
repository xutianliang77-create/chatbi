import type { EngineMessage } from "./types";

const DEFAULT_TOOL_RESULT_LIMIT_BYTES = 12 * 1024;
const PREVIEW_HEAD_CHARS = 1800;
const PREVIEW_TAIL_CHARS = 700;

export interface MicroCompactOptions {
  maxToolResultBytes?: number;
}

export interface MicroCompactResult {
  messages: EngineMessage[];
  compactedCount: number;
  originalBytes: number;
  compactedBytes: number;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function readLimit(options?: MicroCompactOptions): number {
  if (options?.maxToolResultBytes && options.maxToolResultBytes > 0) {
    return options.maxToolResultBytes;
  }
  const raw = process.env.CODECLAW_MICRO_COMPACT_TOOL_BYTES;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 1024 ? parsed : DEFAULT_TOOL_RESULT_LIMIT_BYTES;
}

function extractArtifactPaths(text: string): string[] {
  const matches = [
    ...text.matchAll(/\bartifact:\s*(\/[^\s)]+)/gi),
    ...text.matchAll(/\bArtifact:\s*(\/[^\s)]+)/g),
    ...text.matchAll(/\bsaved to\s+(\/[^;\]\s]+)/gi),
  ];
  return [...new Set(matches.map((match) => match[1]?.replace(/[),.;\]]+$/, "")).filter(Boolean) as string[])].slice(0, 8);
}

function extractUsefulSignals(text: string): string[] {
  const signals = [
    /\bQuery id:\s*([^\s]+)/i.exec(text)?.[0],
    /\bQuery preview rows:\s*(\d+)/i.exec(text)?.[0],
    /\bRow count:\s*([^\s]+)/i.exec(text)?.[0],
    /\bTruncated:\s*([^\s]+)/i.exec(text)?.[0],
    /\bProvider request failed[^\n。]*/i.exec(text)?.[0],
    /\b(context budget exceeded|task_needs_staging|out of memory|EADDRINUSE|FOREIGN KEY constraint failed)[^\n。]*/i.exec(text)?.[0],
  ].filter(Boolean) as string[];
  return [...new Set(signals)].slice(0, 8);
}

function compactToolText(message: EngineMessage, originalBytes: number): string {
  const text = message.text ?? "";
  const artifacts = extractArtifactPaths(text);
  const signals = extractUsefulSignals(text);
  const head = text.slice(0, PREVIEW_HEAD_CHARS).trim();
  const tail = text.length > PREVIEW_HEAD_CHARS + PREVIEW_TAIL_CHARS
    ? text.slice(-PREVIEW_TAIL_CHARS).trim()
    : "";
  return [
    `[micro-compact tool result]`,
    `tool: ${message.toolName ?? "unknown"}`,
    `original-bytes: ${originalBytes}`,
    artifacts.length ? `artifact: ${artifacts.join(", ")}` : "artifact: none",
    signals.length ? `signals: ${signals.join(" | ")}` : "signals: none",
    "",
    "preview:",
    head || "(empty)",
    tail ? "\n...\n" + tail : "",
  ].join("\n");
}

export function microCompactMessages(
  messages: EngineMessage[],
  options?: MicroCompactOptions
): MicroCompactResult {
  const limit = readLimit(options);
  let compactedCount = 0;
  let originalBytes = 0;
  let compactedBytes = 0;
  let changed = false;

  const next = messages.map((message) => {
    if (message.role !== "tool") return message;
    const size = byteLength(message.text ?? "");
    if (size <= limit) return message;

    const compactedText = compactToolText(message, size);
    compactedCount += 1;
    originalBytes += size;
    compactedBytes += byteLength(compactedText);
    changed = true;
    return {
      ...message,
      text: compactedText,
    };
  });

  return {
    messages: changed ? next : messages,
    compactedCount,
    originalBytes,
    compactedBytes,
  };
}
