import { describe, expect, it } from "vitest";

import {
  formatWorkflowSkillSuggestion,
  suggestWorkflowSkill,
} from "../../../src/agent/skillSuggestion";
import type { SkillDefinition } from "../../../src/skills/types";

const BEELINK: SkillDefinition = {
  name: "beelink_data",
  description: "Beelink workflow",
  prompt: "use beelink",
  allowedTools: [],
  source: "builtin",
  mcpServers: ["beelink"],
};

const RADIOLOGY: SkillDefinition = {
  name: "radiology",
  description: "Radiology workflow",
  prompt: "use dicom",
  allowedTools: [],
  source: "builtin",
  mcpServers: ["dicom"],
};

const SKILLS = [BEELINK, RADIOLOGY];

describe("suggestWorkflowSkill", () => {
  it("does not suggest a workflow skill for ordinary chat", () => {
    expect(suggestWorkflowSkill("hi，帮我看看今天做什么", SKILLS, null)).toBeNull();
  });

  it("suggests beelink_data for explicit Dremio/Beelink data workflow prompts", () => {
    const suggestion = suggestWorkflowSkill("请查询 Dremio 里 @xu.sample_sales_daily 的表结构", SKILLS, null);
    expect(suggestion?.skill.name).toBe("beelink_data");
    expect(formatWorkflowSkillSuggestion(suggestion!)).toContain("/skills use beelink_data");
    expect(formatWorkflowSkillSuggestion(suggestion!)).toContain("MCP servers: beelink");
  });

  it("suggests radiology for DICOM/radiology prompts", () => {
    const suggestion = suggestWorkflowSkill("读取这个 DICOM .dcm 放射片子并生成中文意见", SKILLS, null);
    expect(suggestion?.skill.name).toBe("radiology");
    expect(formatWorkflowSkillSuggestion(suggestion!)).toContain("/skills use radiology");
    expect(formatWorkflowSkillSuggestion(suggestion!)).toContain("MCP servers: dicom");
  });

  it("does not suggest another workflow when a skill is already active", () => {
    expect(suggestWorkflowSkill("Dremio 同步元数据", SKILLS, BEELINK)).toBeNull();
  });
});
