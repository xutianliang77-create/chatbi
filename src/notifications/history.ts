import { mkdir, readFile, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { NotificationHistoryEntry } from "./types";

export function defaultNotificationHistoryPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".codeclaw", "notifications", "history.jsonl");
}

export async function appendNotificationHistory(
  entry: NotificationHistoryEntry,
  historyPath: string = defaultNotificationHistoryPath()
): Promise<void> {
  await mkdir(path.dirname(historyPath), { recursive: true });
  await appendFile(historyPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function readNotificationHistory(
  historyPath: string = defaultNotificationHistoryPath(),
  limit = 50
): Promise<NotificationHistoryEntry[]> {
  let text: string;
  try {
    text = await readFile(historyPath, "utf8");
  } catch {
    return [];
  }
  const rows = text
    .split(/\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as NotificationHistoryEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is NotificationHistoryEntry => Boolean(entry));
  return rows.slice(Math.max(0, rows.length - limit));
}
