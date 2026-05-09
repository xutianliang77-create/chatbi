import type Database from "better-sqlite3";
import { searchMemoryDigests } from "../../memory/sessionMemory/store";
import type { ChannelType } from "../../channels/channelAdapter";
import type { ToolDefinition, ToolRegistry } from "./registry";

export interface RegisterSessionSearchToolDeps {
  db: Database.Database;
  channel: ChannelType;
  userId: string;
}

export function registerSessionSearchTool(
  registry: ToolRegistry,
  deps: RegisterSessionSearchToolDeps
): void {
  if (registry.has("session_search")) return;
  registry.register(buildSessionSearchTool(deps));
}

function buildSessionSearchTool(deps: RegisterSessionSearchToolDeps): ToolDefinition {
  return {
    name: "session_search",
    description:
      "Search recent cross-session memory digests for this user. Returns compact summaries only; use when the user asks to continue or recall prior work.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords to search in saved session digests. Empty query returns recent digests.",
        },
        limit: {
          type: "number",
          description: "Max digests to return, default 5, max 10.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async invoke(args) {
      const input = (args ?? {}) as Record<string, unknown>;
      const query = typeof input.query === "string" ? input.query : "";
      const requestedLimit = typeof input.limit === "number" ? input.limit : 5;
      const limit = Math.max(1, Math.min(10, Math.floor(requestedLimit)));
      const digests = searchMemoryDigests(deps.db, deps.channel, deps.userId, query, limit);
      if (digests.length === 0) {
        return {
          ok: true,
          content: [
            "[session_search]",
            `query: ${query || "(recent)"}`,
            "matches: 0",
            "next: ask the user for more detail or continue without prior-session context.",
          ].join("\n"),
        };
      }

      return {
        ok: true,
        content: [
          "[session_search]",
          `query: ${query || "(recent)"}`,
          `matches: ${digests.length}`,
          ...digests.map((digest, index) => {
            const createdAt = new Date(digest.createdAt).toISOString();
            return [
              `${index + 1}. session=${digest.sessionId} digest=${digest.digestId} created=${createdAt}`,
              `summary: ${clip(digest.summary, 700)}`,
            ].join("\n");
          }),
          "next: use only the relevant summary; do not assume unseen transcript details.",
        ].join("\n"),
      };
    },
  };
}

function clip(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 3)}...`;
}
