import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultArtifactsRoot } from "./artifact";
import type { ToolDefinition, ToolRegistry } from "./registry";

interface EmailAttachmentRef {
  path: string;
  label?: string;
}

interface EmailDraft {
  id: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyMarkdown: string;
  attachments: EmailAttachmentRef[];
  relatedReportId?: string;
  purpose?: string;
  createdAt: string;
  emlPath: string;
  jsonPath: string;
}

export const EMAIL_TOOL_NAMES = ["CreateEmailDraft", "ReadEmailDraft", "ListEmailDrafts"] as const;

export function registerEmailTools(registry: ToolRegistry): void {
  registry.register(createEmailDraftTool());
  registry.register(readEmailDraftTool());
  registry.register(listEmailDraftsTool());
}

function createEmailDraftTool(): ToolDefinition {
  return {
    name: "CreateEmailDraft",
    description:
      "Create a local email draft artifact (.eml + JSON) without sending it. Use this for email/report delivery drafts; never claims the email was sent.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        to: { type: "array", items: { type: "string" } },
        cc: { type: "array", items: { type: "string" } },
        bcc: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        bodyMarkdown: { type: "string" },
        attachments: { type: "array" },
        relatedReportId: { type: "string" },
        purpose: { type: "string" },
      },
      required: ["to", "subject", "bodyMarkdown"],
      additionalProperties: false,
    },
    async invoke(args, ctx) {
      const input = asRecord(args);
      const to = requiredEmailList(input.to, "to");
      const cc = optionalEmailList(input.cc, "cc");
      const bcc = optionalEmailList(input.bcc, "bcc");
      const subject = requiredString(input.subject, "subject");
      const bodyMarkdown = requiredString(input.bodyMarkdown, "bodyMarkdown");
      const id = safeDraftId(optionalString(input.id) ?? `email-${Date.now()}`);
      const attachments = attachmentRefs(input.attachments);
      const createdAt = new Date().toISOString();
      const dir = draftDir(ctx.artifactsRoot, id);
      await mkdir(dir, { recursive: true });
      const emlPath = path.join(dir, "draft.eml");
      const jsonPath = path.join(dir, "draft.json");
      const draft: EmailDraft = {
        id,
        to,
        cc,
        bcc,
        subject,
        bodyMarkdown,
        attachments,
        ...(optionalString(input.relatedReportId) ? { relatedReportId: optionalString(input.relatedReportId)! } : {}),
        ...(optionalString(input.purpose) ? { purpose: optionalString(input.purpose)! } : {}),
        createdAt,
        emlPath,
        jsonPath,
      };
      await writeFile(emlPath, renderEml(draft), "utf8");
      await writeFile(jsonPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
      return {
        ok: true,
        content: [
          `Email draft created: ${id}`,
          "status=draft_not_sent",
          `to=${to.join(", ")}`,
          `subject=${subject}`,
          `eml=${emlPath}`,
          `json=${jsonPath}`,
        ].join("\n"),
      };
    },
  };
}

function readEmailDraftTool(): ToolDefinition {
  return {
    name: "ReadEmailDraft",
    description: "Read a local email draft JSON artifact by draft id. This does not send email.",
    inputSchema: {
      type: "object",
      properties: {
        draftId: { type: "string" },
      },
      required: ["draftId"],
      additionalProperties: false,
    },
    async invoke(args, ctx) {
      const draftId = safeDraftId(requiredString(asRecord(args).draftId, "draftId"));
      const file = path.join(draftDir(ctx.artifactsRoot, draftId), "draft.json");
      return { ok: true, content: await readFile(file, "utf8") };
    },
  };
}

function listEmailDraftsTool(): ToolDefinition {
  return {
    name: "ListEmailDrafts",
    description: "List recent local email drafts. This does not send email.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
    async invoke(args, ctx) {
      const limit = clampLimit(asRecord(args).limit);
      const root = draftsRoot(ctx.artifactsRoot);
      let entries: Array<{ id: string; updatedAt: number; draft?: EmailDraft }> = [];
      try {
        const dirs = await readdir(root, { withFileTypes: true });
        entries = await Promise.all(
          dirs
            .filter((dirent) => dirent.isDirectory())
            .map(async (dirent) => {
              const file = path.join(root, dirent.name, "draft.json");
              const info = await stat(file);
              return {
                id: dirent.name,
                updatedAt: info.mtimeMs,
                draft: JSON.parse(await readFile(file, "utf8")) as EmailDraft,
              };
            })
        );
      } catch {
        entries = [];
      }
      entries.sort((a, b) => b.updatedAt - a.updatedAt);
      return {
        ok: true,
        content: JSON.stringify(
          {
            drafts: entries.slice(0, limit).map((entry) => ({
              id: entry.id,
              to: entry.draft?.to ?? [],
              subject: entry.draft?.subject ?? "",
              createdAt: entry.draft?.createdAt ?? "",
              status: "draft_not_sent",
              emlPath: entry.draft?.emlPath,
            })),
          },
          null,
          2
        ),
      };
    },
  };
}

function renderEml(draft: EmailDraft): string {
  const headers = [
    "MIME-Version: 1.0",
    "Content-Type: text/markdown; charset=UTF-8",
    `Date: ${new Date(draft.createdAt).toUTCString()}`,
    `To: ${draft.to.join(", ")}`,
    ...(draft.cc.length > 0 ? [`Cc: ${draft.cc.join(", ")}`] : []),
    ...(draft.bcc.length > 0 ? [`Bcc: ${draft.bcc.join(", ")}`] : []),
    `Subject: ${encodeHeader(draft.subject)}`,
    "X-CodeClaw-Status: draft_not_sent",
  ];
  const attachmentLines =
    draft.attachments.length > 0
      ? ["", "Attachments:", ...draft.attachments.map((item) => `- ${item.label ?? path.basename(item.path)}: ${item.path}`)]
      : [];
  return `${headers.join("\n")}\n\n${draft.bodyMarkdown.trim()}\n${attachmentLines.join("\n")}\n`;
}

function draftsRoot(artifactsRoot?: string): string {
  return path.join(artifactsRoot ?? defaultArtifactsRoot(), "email-drafts");
}

function draftDir(artifactsRoot: string | undefined, id: string): string {
  return path.join(draftsRoot(artifactsRoot), id);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEmailList(value: unknown, name: string): string[] {
  const list = optionalEmailList(value, name);
  if (list.length === 0) throw new Error(`${name} requires at least one valid email address`);
  return list;
}

function optionalEmailList(value: unknown, name: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array of email addresses`);
  const list = value.map((item) => requiredString(item, name));
  const invalid = list.find((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
  if (invalid) throw new Error(`${name} contains invalid email address: ${invalid}`);
  return [...new Set(list)];
}

function attachmentRefs(value: unknown): EmailAttachmentRef[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("attachments must be an array");
  return value.map((item) => {
    const record = asRecord(item);
    return {
      path: requiredString(record.path, "attachment.path"),
      ...(optionalString(record.label) ? { label: optionalString(record.label)! } : {}),
    };
  });
}

function safeDraftId(value: string): string {
  const id = value.trim();
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) throw new Error(`invalid email draft id: ${value}`);
  return id;
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function clampLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(100, Math.trunc(value)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
