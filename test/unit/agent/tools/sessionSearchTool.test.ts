import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createToolRegistry } from "../../../../src/agent/tools/registry";
import { registerSessionSearchTool } from "../../../../src/agent/tools/sessionSearchTool";
import { saveMemoryDigest, type MemoryDigest } from "../../../../src/memory/sessionMemory/store";
import { openDataDb } from "../../../../src/storage/db";
import { PermissionManager } from "../../../../src/permissions/manager";

const tempDirs: string[] = [];
let db: Database.Database;

beforeEach(() => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "codeclaw-session-search-"));
  tempDirs.push(dir);
  db = openDataDb({ path: path.join(dir, "data.db"), singleton: false }).db;
  db.pragma("foreign_keys = OFF");
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function makeDigest(overrides: Partial<MemoryDigest> = {}): MemoryDigest {
  return {
    digestId: "d1",
    sessionId: "s1",
    channel: "http",
    userId: "alice",
    summary: "provider 空响应 fallback 修复",
    messageCount: 10,
    tokenEstimate: 100,
    createdAt: 1000,
    ...overrides,
  };
}

const ctx = {
  workspace: process.cwd(),
  permissionManager: new PermissionManager("default"),
};

describe("session_search tool", () => {
  it("返回匹配到的 compact session digest", async () => {
    saveMemoryDigest(db, makeDigest());
    saveMemoryDigest(db, makeDigest({ digestId: "d2", sessionId: "s2", summary: "Dremio 报表", createdAt: 2000 }));

    const registry = createToolRegistry();
    registerSessionSearchTool(registry, { db, channel: "http", userId: "alice" });

    const result = await registry.invoke("session_search", { query: "provider", limit: 5 }, ctx);

    expect(result.ok).toBe(true);
    expect(result.content).toContain("matches: 1");
    expect(result.content).toContain("session=s1");
    expect(result.content).toContain("provider 空响应");
    expect(result.content).not.toContain("Dremio 报表");
  });

  it("无匹配时给出下一步而不是注入旧上下文", async () => {
    const registry = createToolRegistry();
    registerSessionSearchTool(registry, { db, channel: "http", userId: "alice" });

    const result = await registry.invoke("session_search", { query: "missing" }, ctx);

    expect(result.ok).toBe(true);
    expect(result.content).toContain("matches: 0");
    expect(result.content).toContain("continue without prior-session context");
  });
});
