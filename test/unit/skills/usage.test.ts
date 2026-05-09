import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { listSkillUsage, loadSkillUsage, recordSkillActivation } from "../../../src/skills/usage";

describe("skill usage", () => {
  it("records activation counts and last activation time", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "codeclaw-skill-usage-"));
    try {
      const usagePath = path.join(dir, "usage.json");
      recordSkillActivation("review", "builtin", usagePath, () => 1000);
      recordSkillActivation("review", "builtin", usagePath, () => 2000);
      recordSkillActivation("email", "builtin", usagePath, () => 1500);

      const store = loadSkillUsage(usagePath);
      expect(store.skills.review.activations).toBe(2);
      expect(store.skills.review.lastActivatedAt).toBe(2000);
      expect(store.skills.email.activations).toBe(1);
      expect(listSkillUsage(usagePath).map((entry) => entry.name)).toEqual(["review", "email"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats missing or malformed usage files as empty stores", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "codeclaw-skill-usage-"));
    try {
      const usagePath = path.join(dir, "missing.json");
      expect(loadSkillUsage(usagePath)).toEqual({ version: 1, skills: {} });
      expect(listSkillUsage(usagePath)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
