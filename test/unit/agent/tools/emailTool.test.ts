import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ToolRegistry } from "../../../../src/agent/tools/registry";
import { registerEmailTools } from "../../../../src/agent/tools/emailTool";
import type { PermissionManager } from "../../../../src/permissions/manager";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), "codeclaw-email-tool-"));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("email draft tools", () => {
  it("creates local JSON and EML draft artifacts without sending", async () => {
    const registry = new ToolRegistry();
    registerEmailTools(registry);

    const result = await registry.invoke(
      "CreateEmailDraft",
      {
        id: "draft-1",
        to: ["alice@example.com"],
        cc: ["bob@example.com"],
        subject: "周报",
        bodyMarkdown: "你好，附件是本周报表。",
        attachments: [{ path: "/tmp/report.docx", label: "report.docx" }],
        relatedReportId: "report-1",
      },
      ctx()
    );

    const dir = path.join(tmpRoot, "email-drafts", "draft-1");
    expect(result).toMatchObject({ ok: true });
    expect(result.content).toContain("status=draft_not_sent");
    expect(existsSync(path.join(dir, "draft.json"))).toBe(true);
    expect(existsSync(path.join(dir, "draft.eml"))).toBe(true);
    expect(readFileSync(path.join(dir, "draft.json"), "utf8")).toContain('"relatedReportId": "report-1"');
    expect(readFileSync(path.join(dir, "draft.eml"), "utf8")).toContain("X-CodeClaw-Status: draft_not_sent");
  });

  it("rejects invalid recipients before writing a draft", async () => {
    const registry = new ToolRegistry();
    registerEmailTools(registry);

    const result = await registry.invoke(
      "CreateEmailDraft",
      {
        id: "bad",
        to: ["not-an-email"],
        subject: "Bad",
        bodyMarkdown: "Body",
      },
      ctx()
    );

    expect(result.ok).toBe(false);
    expect(result.content).toContain("invalid email address");
    expect(existsSync(path.join(tmpRoot, "email-drafts", "bad"))).toBe(false);
  });

  it("lists and reads draft artifacts", async () => {
    const registry = new ToolRegistry();
    registerEmailTools(registry);

    await registry.invoke(
      "CreateEmailDraft",
      {
        id: "draft-list",
        to: ["alice@example.com"],
        subject: "Hello",
        bodyMarkdown: "Draft body",
      },
      ctx()
    );

    const list = await registry.invoke("ListEmailDrafts", { limit: 10 }, ctx());
    const read = await registry.invoke("ReadEmailDraft", { draftId: "draft-list" }, ctx());

    expect(list.content).toContain("draft-list");
    expect(read.content).toContain('"subject": "Hello"');
  });
});

function ctx() {
  return {
    workspace: tmpRoot,
    userId: "tool-user",
    channel: "http",
    artifactsRoot: tmpRoot,
    permissionManager: {} as PermissionManager,
  };
}
