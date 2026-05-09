import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerBuiltinTools } from "../../../../src/agent/tools/builtins";
import { registerExecuteCodeTool } from "../../../../src/agent/tools/executeCodeTool";
import { createToolRegistry } from "../../../../src/agent/tools/registry";
import { PermissionManager } from "../../../../src/permissions/manager";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(path.join(os.tmpdir(), "codeclaw-execute-code-"));
  writeFileSync(path.join(workspace, "a.ts"), "export const a = 1;\n");
  writeFileSync(path.join(workspace, "b.md"), "# B\n");
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function registry() {
  const reg = createToolRegistry();
  registerBuiltinTools(reg);
  registerExecuteCodeTool(reg);
  return reg;
}

const ctx = () => ({
  workspace,
  permissionManager: new PermissionManager("default"),
});

describe("execute_code tool", () => {
  it("runs a bounded read-only tool batch and returns one compact result", async () => {
    const result = await registry().invoke(
      "execute_code",
      {
        code: [
          "const glob = await tools.call('glob', { pattern: '**/*' });",
          "const read = await tools.call('read', { file_path: 'a.ts' });",
          "return { glob: glob.content, read: read.content };",
        ].join("\n"),
      },
      ctx()
    );

    expect(result.ok).toBe(true);
    expect(result.content).toContain("[execute_code] completed");
    expect(result.content).toContain("toolCalls: 2");
    expect(result.content).toContain("a.ts");
    expect(result.content).toContain("export const a");
  });

  it("blocks write/bash/mcp style tools", async () => {
    const result = await registry().invoke(
      "execute_code",
      { code: "return await tools.call('bash', { command: 'pwd' });" },
      ctx()
    );

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("execution_failed");
    expect(result.content).toContain("tool not allowed");
  });

  it("blocks obvious escape syntax before running", async () => {
    const result = await registry().invoke(
      "execute_code",
      { code: "return process.env;" },
      ctx()
    );

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("blocked_syntax");
  });

  it("enforces maxToolCalls", async () => {
    const result = await registry().invoke(
      "execute_code",
      {
        maxToolCalls: 1,
        code: [
          "await tools.call('glob', { pattern: '**/*' });",
          "await tools.call('glob', { pattern: '**/*.ts' });",
          "return 'done';",
        ].join("\n"),
      },
      ctx()
    );

    expect(result.ok).toBe(false);
    expect(result.content).toContain("exceeded maxToolCalls=1");
  });
});
