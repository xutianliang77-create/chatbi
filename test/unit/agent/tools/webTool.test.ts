import { describe, expect, it } from "vitest";
import { PermissionManager } from "../../../../src/permissions/manager";
import { createToolRegistry } from "../../../../src/agent/tools/registry";
import { registerWebFetchTool } from "../../../../src/agent/tools/webTool";

const ctx = (fetchImpl: typeof fetch) => ({
  workspace: process.cwd(),
  permissionManager: new PermissionManager("default"),
  fetchImpl,
});

describe("registerWebFetchTool", () => {
  it("registers web_fetch and returns cleaned text", async () => {
    const registry = createToolRegistry();
    registerWebFetchTool(registry);
    const fetchImpl = async () =>
      new Response("<html><head><title>Docs</title><script>bad()</script></head><body><h1>Hello</h1><p>World &amp; tools</p></body></html>", {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "text/html; charset=utf-8" },
      });

    const result = await registry.invoke("web_fetch", { url: "https://example.com/docs" }, ctx(fetchImpl as typeof fetch));

    expect(result.ok).toBe(true);
    expect(result.content).toContain("Title: Docs");
    expect(result.content).toContain("Hello World & tools");
    expect(result.content).not.toContain("bad()");
  });

  it("blocks localhost URLs before calling fetch", async () => {
    const registry = createToolRegistry();
    registerWebFetchTool(registry);
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return new Response("should not run");
    };

    const result = await registry.invoke("web_fetch", { url: "http://127.0.0.1:7180" }, ctx(fetchImpl as typeof fetch));

    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("invalid_url");
    expect(result.content).toContain("private or local host");
  });

  it("rejects binary content-types", async () => {
    const registry = createToolRegistry();
    registerWebFetchTool(registry);
    const fetchImpl = async () =>
      new Response("png", {
        status: 200,
        headers: { "content-type": "image/png" },
      });

    const result = await registry.invoke("web_fetch", { url: "https://example.com/image.png" }, ctx(fetchImpl as typeof fetch));

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("unsupported_content_type");
  });
});
