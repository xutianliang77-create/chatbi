import os from "node:os";
import { spawn } from "node:child_process";
import { appendNotificationHistory } from "./history";
import { sanitizeNotificationEvent } from "./sanitize";
import type {
  NotificationAdapter,
  NotificationAdapterKind,
  NotificationEvent,
  NotificationHistoryEntry,
  NotificationSettings,
} from "./types";

export interface NotificationManagerOptions {
  settings?: NotificationSettings;
  historyPath?: string;
  adapter?: NotificationAdapter;
  now?: () => Date;
}

export class NotificationManager {
  private readonly settings: NotificationSettings;
  private readonly historyPath?: string;
  private readonly adapter?: NotificationAdapter;
  private readonly now: () => Date;

  constructor(options: NotificationManagerOptions = {}) {
    this.settings = options.settings ?? {};
    this.historyPath = options.historyPath;
    this.adapter = options.adapter;
    this.now = options.now ?? (() => new Date());
  }

  async notify(event: NotificationEvent): Promise<NotificationHistoryEntry> {
    const now = this.now();
    const entry = sanitizeNotificationEvent(
      event,
      `note-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      now.toISOString()
    );
    const decision = this.evaluate(entry, now);
    entry.suppressed = Boolean(decision.reason);
    entry.reason = decision.reason;
    entry.adapter = decision.adapterKind;

    if (!decision.reason) {
      try {
        await decision.adapter.send(entry);
        entry.delivered = true;
      } catch (err) {
        entry.suppressed = true;
        entry.reason = `adapter_failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    await appendNotificationHistory(entry, this.historyPath);
    return entry;
  }

  private evaluate(
    event: NotificationHistoryEntry,
    now: Date
  ): { reason?: string; adapter: NotificationAdapter; adapterKind: NotificationAdapterKind } {
    const adapter = this.adapter ?? createNotificationAdapter(this.settings.adapter ?? "auto");
    if (this.settings.enabled !== true) {
      return { reason: "disabled", adapter, adapterKind: adapter.kind };
    }
    if (this.settings.events?.[event.type] === false) {
      return { reason: `event_disabled:${event.type}`, adapter, adapterKind: adapter.kind };
    }
    if (this.settings.failuresOnly && !["error", "warning"].includes(event.severity)) {
      return { reason: "failures_only", adapter, adapterKind: adapter.kind };
    }
    if (isInQuietHours(this.settings.quietHours, now)) {
      return { reason: "quiet_hours", adapter, adapterKind: adapter.kind };
    }
    if (adapter.kind === "none") {
      return { reason: "adapter_none", adapter, adapterKind: adapter.kind };
    }
    return { adapter, adapterKind: adapter.kind };
  }
}

export function createNotificationManager(options: NotificationManagerOptions = {}): NotificationManager {
  return new NotificationManager(options);
}

export function createNotificationAdapter(kind: NotificationAdapterKind): NotificationAdapter {
  if (kind === "terminal") return terminalAdapter();
  if (kind === "macos") return macosAdapter();
  if (kind === "none") return noneAdapter();
  return process.platform === "darwin" ? macosAdapter() : terminalAdapter();
}

export function isInQuietHours(
  quietHours: NotificationSettings["quietHours"],
  now: Date
): boolean {
  if (!quietHours?.enabled) return false;
  const start = parseClock(quietHours.start);
  const end = parseClock(quietHours.end);
  if (start === null || end === null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function terminalAdapter(): NotificationAdapter {
  return {
    kind: "terminal",
    send(event) {
      process.stderr.write(`[CodeClaw notification] ${event.title}: ${event.message}${os.EOL}`);
    },
  };
}

function macosAdapter(): NotificationAdapter {
  return {
    kind: "macos",
    send(event) {
      const script = `display notification ${quoteAppleScript(event.message)} with title ${quoteAppleScript(event.title)}`;
      const child = spawn("osascript", ["-e", script], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    },
  };
}

function noneAdapter(): NotificationAdapter {
  return {
    kind: "none",
    send() {
      return undefined;
    },
  };
}

function quoteAppleScript(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
