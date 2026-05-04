import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { SessionStore } from "../../../../src/channels/web/sessionStore";
import type { QueryEngine } from "../../../../src/agent/types";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), "codeclaw-web-session-store-"));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("SessionStore", () => {
  it("falls back to active engine messages when no persisted web transcript exists", () => {
    const store = new SessionStore({
      engineDefaults: {
        currentProvider: null,
        fallbackProvider: null,
        permissionMode: "plan",
        workspace: "ws-1",
        sessionsDir: path.join(tmpRoot, "sessions"),
      },
      engineFactory: () =>
        ({
          getMessages: () => [
            {
              id: "ready",
              role: "assistant",
              text: "CodeClaw is ready. No provider is configured yet.",
              source: "local",
            },
            { id: "u-1", role: "user", text: "生成食品销量分析报表", source: "user" },
            { id: "a-1", role: "assistant", text: "报表已生成。", source: "model" },
          ],
        }) as unknown as QueryEngine,
    });

    const session = store.create("web-user");
    expect(store.readMessages(session.sessionId, "web-user")).toMatchObject([
      { id: "u-1", role: "user", text: "生成食品销量分析报表" },
      { id: "a-1", role: "assistant", text: "报表已生成。" },
    ]);
  });
});
