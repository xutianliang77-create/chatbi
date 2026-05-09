import { describe, expect, it } from "vitest";
import { PermissionManager } from "../../../../src/permissions/manager";
import { createToolRegistry } from "../../../../src/agent/tools/registry";
import { registerBrowserTools } from "../../../../src/agent/tools/browserTool";

const ctx = (fetchImpl: typeof fetch) => ({
  workspace: process.cwd(),
  permissionManager: new PermissionManager("default"),
  fetchImpl,
});

describe("registerBrowserTools", () => {
  it("lists local CDP pages with safe metadata only", async () => {
    const registry = createToolRegistry();
    registerBrowserTools(registry);
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe("http://127.0.0.1:9222/json/list");
      return Response.json([
        {
          id: "page-1",
          type: "page",
          title: "Docs",
          url: "https://example.com/docs",
          webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/page-1",
        },
      ]);
    };

    const result = await registry.invoke("browser_list_pages", {}, ctx(fetchImpl as typeof fetch));

    expect(result.ok).toBe(true);
    expect(result.content).toContain("page-1");
    expect(result.content).toContain("https://example.com/docs");
    expect(result.content).not.toContain("webSocketDebuggerUrl");
  });

  it("blocks non-local CDP endpoints before fetching", async () => {
    const registry = createToolRegistry();
    registerBrowserTools(registry);
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return Response.json([]);
    };

    const result = await registry.invoke(
      "browser_list_pages",
      { cdpUrl: "http://192.168.1.20:9222" },
      ctx(fetchImpl as typeof fetch)
    );

    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("browser_blocked");
    expect(result.content).toContain("CDP host must be local");
  });

  it("asks the user to list pages when snapshot target is missing", async () => {
    const registry = createToolRegistry();
    registerBrowserTools(registry);
    const fetchImpl = async () => Response.json([]);

    const result = await registry.invoke("browser_snapshot", {}, ctx(fetchImpl as typeof fetch));

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("page_not_found");
    expect(result.content).toContain("browser_list_pages");
  });
});
