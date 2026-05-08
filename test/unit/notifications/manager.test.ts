import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { NotificationManager, isInQuietHours } from "../../../src/notifications/manager";
import type { NotificationAdapter } from "../../../src/notifications/types";

async function tempHistory(): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codeclaw-notify-"));
  return { dir, file: path.join(dir, "history.jsonl") };
}

describe("NotificationManager", () => {
  it("writes suppressed history when notifications are disabled", async () => {
    const { dir, file } = await tempHistory();
    try {
      const sent: string[] = [];
      const adapter: NotificationAdapter = {
        kind: "terminal",
        send(event) {
          sent.push(event.title);
        },
      };
      const manager = new NotificationManager({
        settings: { enabled: false, adapter: "terminal" },
        historyPath: file,
        adapter,
      });
      const entry = await manager.notify({
        type: "approval_required",
        title: "Approval required",
        message: "Bash needs approval",
      });

      expect(sent).toEqual([]);
      expect(entry.delivered).toBe(false);
      expect(entry.suppressed).toBe(true);
      expect(entry.reason).toBe("disabled");
      expect(await readFile(file, "utf8")).toContain("approval_required");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("delivers through injected adapter when enabled", async () => {
    const { dir, file } = await tempHistory();
    try {
      const sent: string[] = [];
      const manager = new NotificationManager({
        settings: { enabled: true, adapter: "terminal" },
        historyPath: file,
        adapter: {
          kind: "terminal",
          send(event) {
            sent.push(`${event.type}:${event.title}`);
          },
        },
      });

      const entry = await manager.notify({
        type: "task_completed",
        title: "Task done",
        message: "The run completed",
      });

      expect(sent).toEqual(["task_completed:Task done"]);
      expect(entry.delivered).toBe(true);
      expect(entry.suppressed).toBe(false);
      expect(await readFile(file, "utf8")).toContain("\"delivered\":true");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("suppresses quiet hours while preserving history", async () => {
    const { dir, file } = await tempHistory();
    try {
      const manager = new NotificationManager({
        settings: {
          enabled: true,
          adapter: "terminal",
          quietHours: { enabled: true, start: "22:00", end: "08:00" },
        },
        historyPath: file,
        now: () => new Date("2026-05-08T23:30:00+08:00"),
        adapter: {
          kind: "terminal",
          send() {
            throw new Error("should not send");
          },
        },
      });

      const entry = await manager.notify({
        type: "cron_failed",
        title: "Cron failed",
        message: "task x failed",
      });

      expect(entry.reason).toBe("quiet_hours");
      expect(await readFile(file, "utf8")).toContain("quiet_hours");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports quiet hours crossing midnight", () => {
    const quietHours = { enabled: true, start: "22:00", end: "08:00" };
    expect(isInQuietHours(quietHours, new Date("2026-05-08T23:00:00"))).toBe(true);
    expect(isInQuietHours(quietHours, new Date("2026-05-08T07:59:00"))).toBe(true);
    expect(isInQuietHours(quietHours, new Date("2026-05-08T12:00:00"))).toBe(false);
  });

  it("redacts secrets and truncates long content", async () => {
    const { dir, file } = await tempHistory();
    try {
      const manager = new NotificationManager({
        settings: { enabled: false },
        historyPath: file,
      });
      const entry = await manager.notify({
        type: "provider_cooldown",
        title: "Provider cooldown",
        message: `token=abc123 ${"x".repeat(400)}`,
      });

      expect(entry.message).toContain("token=[redacted]");
      expect(entry.message.length).toBeLessThanOrEqual(280);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
