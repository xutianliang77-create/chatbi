import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SkillUsageEntry {
  name: string;
  source: string;
  activations: number;
  lastActivatedAt: number;
}

export interface SkillUsageStore {
  version: 1;
  skills: Record<string, SkillUsageEntry>;
}

export function defaultSkillUsagePath(): string {
  return path.join(os.homedir(), ".codeclaw", "skills", "usage.json");
}

export function loadSkillUsage(usagePath: string = defaultSkillUsagePath()): SkillUsageStore {
  if (!existsSync(usagePath)) {
    return emptyStore();
  }
  try {
    const parsed = JSON.parse(readFileSync(usagePath, "utf8")) as Partial<SkillUsageStore>;
    if (parsed.version !== 1 || !parsed.skills || typeof parsed.skills !== "object") {
      return emptyStore();
    }
    return {
      version: 1,
      skills: Object.fromEntries(
        Object.entries(parsed.skills).filter(([, value]) => isUsageEntry(value))
      ),
    };
  } catch {
    return emptyStore();
  }
}

export function listSkillUsage(usagePath: string = defaultSkillUsagePath()): SkillUsageEntry[] {
  return Object.values(loadSkillUsage(usagePath).skills).sort((a, b) => {
    if (b.activations !== a.activations) return b.activations - a.activations;
    return b.lastActivatedAt - a.lastActivatedAt;
  });
}

export function recordSkillActivation(
  name: string,
  source: string,
  usagePath: string = defaultSkillUsagePath(),
  now: () => number = Date.now
): SkillUsageEntry {
  const normalizedName = name.trim().toLowerCase();
  const store = loadSkillUsage(usagePath);
  const current = store.skills[normalizedName];
  const entry: SkillUsageEntry = {
    name: normalizedName,
    source,
    activations: (current?.activations ?? 0) + 1,
    lastActivatedAt: now(),
  };
  store.skills[normalizedName] = entry;
  mkdirSync(path.dirname(usagePath), { recursive: true });
  writeFileSync(usagePath, `${JSON.stringify(store, null, 2)}\n`);
  return entry;
}

function emptyStore(): SkillUsageStore {
  return { version: 1, skills: {} };
}

function isUsageEntry(value: unknown): value is SkillUsageEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Partial<SkillUsageEntry>;
  return (
    typeof obj.name === "string" &&
    typeof obj.source === "string" &&
    Number.isFinite(obj.activations) &&
    Number.isFinite(obj.lastActivatedAt)
  );
}
