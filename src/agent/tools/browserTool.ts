import type { ToolDefinition, ToolRegistry } from "./registry";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_CHARS = 12_000;
const HARD_MAX_CHARS = 50_000;

interface BrowserPage {
  id: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface BrowserWebSocket {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

type BrowserWebSocketCtor = new (url: string) => BrowserWebSocket;

export function registerBrowserTools(registry: ToolRegistry): void {
  if (!registry.has("browser_list_pages")) registry.register(buildBrowserListPagesTool());
  if (!registry.has("browser_snapshot")) registry.register(buildBrowserSnapshotTool());
}

function buildBrowserListPagesTool(): ToolDefinition {
  return {
    name: "browser_list_pages",
    description:
      "List pages from a local Chrome/Chromium DevTools Protocol endpoint. Requires Chrome launched with --remote-debugging-port; reads local browser tab metadata only.",
    inputSchema: {
      type: "object",
      properties: {
        cdpUrl: {
          type: "string",
          description: `Local CDP base URL, default ${DEFAULT_CDP_URL}. Only localhost/127.0.0.1 are allowed.`,
        },
      },
      additionalProperties: false,
    },
    async invoke(args, ctx) {
      const base = resolveCdpBaseUrl(asRecord(args).cdpUrl);
      if (!base.ok) return blocked(base.reason);
      const pages = await listPages(base.url, ctx.fetchImpl ?? fetch, ctx.abortSignal);
      return {
        ok: true,
        content: JSON.stringify(
          pages.map((page) => ({
            id: page.id,
            type: page.type ?? "unknown",
            title: page.title ?? "",
            url: page.url ?? "",
          })),
          null,
          2
        ),
      };
    },
  };
}

function buildBrowserSnapshotTool(): ToolDefinition {
  return {
    name: "browser_snapshot",
    description:
      "Read visible text from one local Chrome/Chromium tab through DevTools Protocol. Does not click, type, execute user actions, or download files.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "Exact page id from browser_list_pages." },
        urlContains: { type: "string", description: "Fallback selector: first page whose URL contains this text." },
        cdpUrl: {
          type: "string",
          description: `Local CDP base URL, default ${DEFAULT_CDP_URL}. Only localhost/127.0.0.1 are allowed.`,
        },
        maxChars: {
          type: "number",
          description: `Maximum characters to return, default ${DEFAULT_MAX_CHARS}, hard cap ${HARD_MAX_CHARS}.`,
        },
      },
      additionalProperties: false,
    },
    async invoke(args, ctx) {
      const input = asRecord(args);
      const base = resolveCdpBaseUrl(input.cdpUrl);
      if (!base.ok) return blocked(base.reason);
      const pages = await listPages(base.url, ctx.fetchImpl ?? fetch, ctx.abortSignal);
      const page = selectPage(pages, input);
      if (!page) {
        return {
          ok: false,
          content: "[browser_snapshot blocked] no matching page found; call browser_list_pages first",
          isError: true,
          errorCode: "page_not_found",
        };
      }
      const wsUrl = validateLocalWsUrl(page.webSocketDebuggerUrl);
      if (!wsUrl.ok) return blocked(wsUrl.reason);
      const text = await snapshotPageText(wsUrl.url, ctx.abortSignal);
      const maxChars = clampMaxChars(input.maxChars);
      const clipped = text.length > maxChars
        ? `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`
        : text;
      return {
        ok: true,
        content: [
          `Page: ${page.title ?? ""}`,
          `URL: ${page.url ?? ""}`,
          "",
          clipped || "[empty page text]",
        ].join("\n"),
      };
    },
  };
}

async function listPages(baseUrl: string, fetchImpl: typeof fetch, abortSignal?: AbortSignal): Promise<BrowserPage[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), DEFAULT_TIMEOUT_MS);
  const abortListener = () => controller.abort(abortSignal?.reason ?? "aborted");
  abortSignal?.addEventListener("abort", abortListener, { once: true });
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/json/list`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`CDP list failed: ${response.status} ${response.statusText}`);
    const value = await response.json();
    if (!Array.isArray(value)) throw new Error("CDP /json/list did not return an array");
    return value.filter(isBrowserPage);
  } finally {
    clearTimeout(timeout);
    abortSignal?.removeEventListener("abort", abortListener);
  }
}

function selectPage(pages: BrowserPage[], input: Record<string, unknown>): BrowserPage | null {
  const pageId = typeof input.pageId === "string" ? input.pageId.trim() : "";
  if (pageId) return pages.find((page) => page.id === pageId) ?? null;
  const urlContains = typeof input.urlContains === "string" ? input.urlContains.trim() : "";
  if (urlContains) return pages.find((page) => page.url?.includes(urlContains)) ?? null;
  return pages.find((page) => (page.type ?? "page") === "page" && page.webSocketDebuggerUrl) ?? null;
}

async function snapshotPageText(wsUrl: string, abortSignal?: AbortSignal): Promise<string> {
  const WebSocketCtor = getWebSocketCtor();
  if (!WebSocketCtor) {
    throw new Error("global WebSocket is unavailable; use Node.js with WebSocket support or configure Chrome MCP");
  }
  const ws = new WebSocketCtor(wsUrl);
  const expression = [
    "(() => {",
    "const title = document.title ? `Title: ${document.title}\\n` : '';",
    "const body = document.body?.innerText || document.documentElement?.innerText || '';",
    "return `${title}${body}`;",
    "})()",
  ].join("");

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(reject, new Error("browser snapshot timeout")), DEFAULT_TIMEOUT_MS);
    const abortListener = () => finish(reject, new Error("browser snapshot aborted"));
    abortSignal?.addEventListener("abort", abortListener, { once: true });

    function cleanup() {
      clearTimeout(timeout);
      abortSignal?.removeEventListener("abort", abortListener);
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
    }
    function finish(fn: (value: never) => void, value: Error): void;
    function finish(fn: (value: string) => void, value: string): void;
    function finish(fn: ((value: string) => void) | ((value: never) => void), value: string | Error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (value instanceof Error) {
        (fn as (value: never) => void)(value as never);
      } else {
        (fn as (value: string) => void)(value);
      }
    }

    ws.onerror = () => finish(reject, new Error("browser websocket error"));
    ws.onclose = () => {
      if (!settled) finish(reject, new Error("browser websocket closed before result"));
    };
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true },
      }));
    };
    ws.onmessage = (event) => {
      const data = typeof event.data === "string" ? event.data : String(event.data);
      try {
        const msg = JSON.parse(data) as {
          id?: number;
          error?: { message?: string };
          result?: { result?: { value?: unknown } };
        };
        if (msg.id !== 1) return;
        if (msg.error) {
          finish(reject, new Error(msg.error.message ?? "browser runtime evaluation failed"));
          return;
        }
        const value = msg.result?.result?.value;
        finish(resolve, typeof value === "string" ? value : "");
      } catch (err) {
        finish(reject, err instanceof Error ? err : new Error(String(err)));
      }
    };
  });
}

function resolveCdpBaseUrl(value: unknown): { ok: true; url: string } | { ok: false; reason: string } {
  const raw = typeof value === "string" && value.trim()
    ? value.trim()
    : process.env.CODECLAW_BROWSER_CDP_URL || DEFAULT_CDP_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "CDP URL is invalid" };
  }
  if (parsed.protocol !== "http:") {
    return { ok: false, reason: "CDP URL must use http://localhost or http://127.0.0.1" };
  }
  if (!isLocalHost(parsed.hostname)) {
    return { ok: false, reason: `CDP host must be local: ${parsed.hostname}` };
  }
  return { ok: true, url: parsed.toString() };
}

function validateLocalWsUrl(value: unknown): { ok: true; url: string } | { ok: false; reason: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, reason: "page does not expose webSocketDebuggerUrl" };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "webSocketDebuggerUrl is invalid" };
  }
  if (parsed.protocol !== "ws:") return { ok: false, reason: "only local ws:// CDP endpoints are allowed" };
  if (!isLocalHost(parsed.hostname)) return { ok: false, reason: `CDP websocket host must be local: ${parsed.hostname}` };
  return { ok: true, url: parsed.toString() };
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isBrowserPage(value: unknown): value is BrowserPage {
  const record = asRecord(value);
  return typeof record.id === "string";
}

function clampMaxChars(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_CHARS;
  return Math.max(1_000, Math.min(HARD_MAX_CHARS, Math.floor(value)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function blocked(reason: string) {
  return {
    ok: false,
    content: `[browser blocked] ${reason}`,
    isError: true,
    errorCode: "browser_blocked",
  };
}

function getWebSocketCtor(): BrowserWebSocketCtor | null {
  const candidate = (globalThis as unknown as { WebSocket?: unknown }).WebSocket;
  return typeof candidate === "function" ? (candidate as BrowserWebSocketCtor) : null;
}
