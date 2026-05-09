import type { ToolDefinition, ToolRegistry } from "./registry";

const DEFAULT_MAX_CHARS = 12_000;
const HARD_MAX_CHARS = 50_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const TEXT_CONTENT_TYPES = [
  "text/",
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "application/rss+xml",
  "application/atom+xml",
  "application/javascript",
  "application/x-javascript",
  "application/csv",
];

export function registerWebFetchTool(registry: ToolRegistry): void {
  if (registry.has("web_fetch")) return;
  registry.register(buildWebFetchTool());
}

function buildWebFetchTool(): ToolDefinition {
  return {
    name: "web_fetch",
    description:
      "Fetch a public http(s) URL and return cleaned text plus basic metadata. Read-only; blocks localhost/private hosts and binary responses.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public http(s) URL to fetch." },
        maxChars: {
          type: "number",
          description: `Maximum characters to return, default ${DEFAULT_MAX_CHARS}, hard cap ${HARD_MAX_CHARS}.`,
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    async invoke(args, ctx) {
      const input = asRecord(args);
      const url = requiredString(input.url, "url");
      const maxChars = clampMaxChars(input.maxChars);
      const validation = validatePublicHttpUrl(url);
      if (!validation.ok) {
        return { ok: false, content: `[web_fetch blocked] ${validation.reason}`, isError: true, errorCode: "invalid_url" };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("timeout"), DEFAULT_TIMEOUT_MS);
      const abortListener = () => controller.abort(ctx.abortSignal?.reason ?? "aborted");
      ctx.abortSignal?.addEventListener("abort", abortListener, { once: true });
      try {
        const fetchImpl = ctx.fetchImpl ?? fetch;
        const response = await fetchImpl(validation.url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent": "CodeClaw/web_fetch (+https://github.com/xutianliang77-create/chatbi)",
            accept: "text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1",
          },
        });
        const finalValidation = validatePublicHttpUrl(response.url || validation.url);
        if (!finalValidation.ok) {
          return {
            ok: false,
            content: `[web_fetch blocked] redirected to unsafe URL: ${finalValidation.reason}`,
            isError: true,
            errorCode: "unsafe_redirect",
          };
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!isTextContentType(contentType)) {
          return {
            ok: false,
            content: `[web_fetch blocked] unsupported content-type: ${contentType || "unknown"}`,
            isError: true,
            errorCode: "unsupported_content_type",
          };
        }

        const raw = await response.text();
        const cleaned = cleanFetchedText(raw, contentType);
        const clipped = cleaned.length > maxChars
          ? `${cleaned.slice(0, maxChars)}\n...[truncated ${cleaned.length - maxChars} chars]`
          : cleaned;
        const title = extractTitle(raw);
        return {
          ok: response.ok,
          content: [
            `URL: ${response.url || validation.url}`,
            `Status: ${response.status} ${response.statusText}`,
            `Content-Type: ${contentType || "unknown"}`,
            ...(title ? [`Title: ${title}`] : []),
            "",
            clipped || "[empty response]",
          ].join("\n"),
          ...(response.ok ? {} : { isError: true, errorCode: "http_error" }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `[web_fetch failed] ${msg}`, isError: true, errorCode: "fetch_failed" };
      } finally {
        clearTimeout(timeout);
        ctx.abortSignal?.removeEventListener("abort", abortListener);
      }
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function clampMaxChars(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_CHARS;
  return Math.max(1_000, Math.min(HARD_MAX_CHARS, Math.floor(value)));
}

function validatePublicHttpUrl(value: string): { ok: true; url: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "URL is not valid" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "only http(s) URLs are allowed" };
  }
  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, reason: `private or local host is not allowed: ${parsed.hostname}` };
  }
  return { ok: true, url: parsed.toString() };
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return false;
}

function isTextContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return !lower || TEXT_CONTENT_TYPES.some((prefix) => lower.startsWith(prefix));
}

function cleanFetchedText(raw: string, contentType: string): string {
  if (!/html|xml/i.test(contentType) && !/<html[\s>]/i.test(raw)) {
    return raw.replace(/\r\n/g, "\n").trim();
  }
  return decodeBasicEntities(
    raw
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function extractTitle(raw: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  return title ? decodeBasicEntities(title).slice(0, 200) : null;
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
