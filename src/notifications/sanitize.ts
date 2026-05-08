import type { NotificationEvent, NotificationHistoryEntry, NotificationSeverity } from "./types";

const MAX_TITLE_CHARS = 96;
const MAX_MESSAGE_CHARS = 280;
const MAX_METADATA_VALUE_CHARS = 120;

const SECRET_PATTERNS = [
  /((?:api[_-]?key|token|secret|password)\s*[:=]\s*)["']?[^"',\s]+/gi,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/g,
];

export function sanitizeNotificationText(input: unknown, maxChars: number): string {
  let text = typeof input === "string" ? input : String(input ?? "");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (_match, prefix = "") => `${prefix}[redacted]`);
  }
  text = text.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function sanitizeNotificationEvent(
  event: NotificationEvent,
  fallbackId: string,
  nowIso: string
): NotificationHistoryEntry {
  return {
    id: event.id ?? fallbackId,
    type: event.type,
    title: sanitizeNotificationText(event.title, MAX_TITLE_CHARS),
    message: sanitizeNotificationText(event.message, MAX_MESSAGE_CHARS),
    severity: event.severity ?? inferSeverity(event.type),
    sessionId: event.sessionId,
    workspace: event.workspace,
    resourceId: sanitizeOptional(event.resourceId, MAX_METADATA_VALUE_CHARS),
    createdAt: event.createdAt ?? nowIso,
    delivered: false,
    suppressed: false,
    adapter: "none",
    ...(event.metadata ? { metadata: sanitizeMetadata(event.metadata) } : {}),
  };
}

function inferSeverity(type: NotificationEvent["type"]): NotificationSeverity {
  if (type === "cron_failed" || type === "context_budget_exceeded" || type === "provider_cooldown") {
    return "warning";
  }
  if (type === "task_completed" || type === "report_ready") return "success";
  return "info";
}

function sanitizeOptional(value: unknown, maxChars: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  return sanitizeNotificationText(value, maxChars);
}

function sanitizeMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, 20)) {
    if (typeof value === "string") {
      out[key] = sanitizeNotificationText(value, MAX_METADATA_VALUE_CHARS);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    } else {
      out[key] = sanitizeNotificationText(JSON.stringify(value), MAX_METADATA_VALUE_CHARS);
    }
  }
  return out;
}
