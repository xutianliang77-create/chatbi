/**
 * ToolPool 单测
 *
 * 覆盖：
 *   - tool source 分类（builtin / mcp / extension）
 *   - default mode 保持全量可见
 *   - plan mode 只暴露 ToolRegistry 的 plan 白名单，并记录 hidden reason
 *   - listVisibleToolPoolTools 与 provider schema 入口使用同一可见性投影
 */

import { describe, expect, it } from "vitest";

import { registerBuiltinTools } from "../../../../src/agent/tools/builtins";
import { registerMemoryTools } from "../../../../src/agent/tools/memoryTools";
import { registerPlanModeTool } from "../../../../src/agent/tools/planMode";
import {
  ToolRegistry,
  type ToolDefinition,
} from "../../../../src/agent/tools/registry";
import {
  assembleToolPool,
  classifyToolApproval,
  classifyToolConcurrency,
  classifyToolRisk,
  classifyToolSource,
  listVisibleToolPoolTools,
} from "../../../../src/agent/tools/toolPool";

const schema = { type: "object" as const, properties: {} };

function dummyTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} desc`,
    inputSchema: schema,
    invoke: async () => ({ ok: true, content: name }),
  };
}

function seededRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  registerMemoryTools(registry);
  registerPlanModeTool(registry);
  registry.register(dummyTool("mcp__beelink__RunSqlQuery"));
  registry.register(dummyTool("ext__demo__lookup"));
  return registry;
}

describe("ToolPool", () => {
  it("classifyToolSource 按命名前缀分类", () => {
    expect(classifyToolSource("read")).toBe("builtin");
    expect(classifyToolSource("mcp__beelink__RunSqlQuery")).toBe("mcp");
    expect(classifyToolSource("ext__demo__lookup")).toBe("extension");
  });

  it("classifyToolRisk / concurrency / approval 给工具池提供解释性元数据", () => {
    expect(classifyToolRisk("read")).toBe("low");
    expect(classifyToolConcurrency("read")).toBe("parallel");
    expect(classifyToolApproval("read")).toBe("none");

    expect(classifyToolRisk("write")).toBe("medium");
    expect(classifyToolConcurrency("write")).toBe("serial");
    expect(classifyToolApproval("write")).toBe("permission_manager");

    expect(classifyToolRisk("mcp__beelink__RunSqlQuery")).toBe("medium");
    expect(classifyToolConcurrency("mcp__beelink__RunSqlQuery")).toBe("serial");
    expect(classifyToolApproval("mcp__beelink__RunSqlQuery")).toBe("permission_manager");

    expect(classifyToolConcurrency("Task")).toBe("exclusive");
  });

  it("default mode 保持全部工具可见，并标注来源", () => {
    const pool = assembleToolPool(seededRegistry(), { permissionMode: "default" });
    expect(pool.every((entry) => entry.visible)).toBe(true);

    const byName = new Map(pool.map((entry) => [entry.tool.name, entry]));
    expect(byName.get("read")?.source).toBe("builtin");
    expect(byName.get("read")?.risk).toBe("low");
    expect(byName.get("read")?.concurrency).toBe("parallel");
    expect(byName.get("read")?.approval).toBe("none");
    expect(byName.get("mcp__beelink__RunSqlQuery")?.source).toBe("mcp");
    expect(byName.get("mcp__beelink__RunSqlQuery")?.risk).toBe("medium");
    expect(byName.get("mcp__beelink__RunSqlQuery")?.approval).toBe("permission_manager");
    expect(byName.get("ext__demo__lookup")?.source).toBe("extension");
  });

  it("plan mode 复用 ToolRegistry 白名单隐藏写入、bash、MCP 与 extension", () => {
    const pool = assembleToolPool(seededRegistry(), { permissionMode: "plan" });
    const visibleNames = pool
      .filter((entry) => entry.visible)
      .map((entry) => entry.tool.name)
      .sort();

    expect(visibleNames).toEqual([
      "ExitPlanMode",
      "definition",
      "glob",
      "memory_write",
      "read",
      "read_artifact",
      "references",
      "symbol",
    ]);

    const hidden = new Map(
      pool.filter((entry) => !entry.visible).map((entry) => [entry.tool.name, entry])
    );
    expect(hidden.get("bash")?.hiddenReason).toBe("permission_mode_plan");
    expect(hidden.get("write")?.hiddenReason).toBe("permission_mode_plan");
    expect(hidden.get("mcp__beelink__RunSqlQuery")?.hiddenReason).toBe(
      "permission_mode_plan"
    );
    expect(hidden.get("ext__demo__lookup")?.hiddenReason).toBe("permission_mode_plan");
  });

  it("listVisibleToolPoolTools 只返回 provider 可见工具", () => {
    const registry = seededRegistry();
    const names = listVisibleToolPoolTools(registry, { permissionMode: "plan" }).map(
      (tool) => tool.name
    );

    expect(names).toContain("read");
    expect(names).not.toContain("bash");
    expect(names).not.toContain("mcp__beelink__RunSqlQuery");
  });
});
