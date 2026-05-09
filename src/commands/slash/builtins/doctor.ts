/**
 * `/doctor` · 诊断环境健康
 *
 * 实现沿用 `src/commands/doctor.ts:runDoctor`；这里只包装成 SlashCommand。
 */

import { defineCommand, reply } from "../registry";
import { runDoctor } from "../../doctor";
import type { SlashRegistry } from "../registry";

interface DoctorHolder {
  getSlashRegistry(): SlashRegistry;
}

function hasSlashRegistry(x: unknown): x is DoctorHolder {
  return !!x && typeof (x as DoctorHolder).getSlashRegistry === "function";
}

function formatSlashDiagnostics(registry: SlashRegistry): string {
  const diagnostics = registry.diagnostics();
  const lines = [
    "",
    "slash-registry:",
    `- commands: ${diagnostics.commands}`,
    `- aliases: ${diagnostics.aliases}`,
    `- sources: builtin=${diagnostics.sourceCounts.builtin} skill=${diagnostics.sourceCounts.skill} plugin=${diagnostics.sourceCounts.plugin}`,
    `- conflicts: ${diagnostics.conflicts.length}`,
  ];
  for (const conflict of diagnostics.conflicts.slice(-5)) {
    lines.push(
      `  - ${conflict.attemptedName} (${conflict.attemptedSource}${conflict.attemptedOwner ? `:${conflict.attemptedOwner}` : ""}) -> ${conflict.existingName} (${conflict.existingSource}${conflict.existingOwner ? `:${conflict.existingOwner}` : ""}) policy=${conflict.policy}`
    );
  }
  return lines.join("\n");
}

export default defineCommand({
  name: "/doctor",
  aliases: ["/diag"],
  category: "observability",
  risk: "low",
  summary: "Check storage / runtime / libs / tokenFile health.",
  summaryZh: "体检：存储 / 运行时 / 依赖 / token 文件",
  helpDetail:
    "Runs a read-only health check across SQLite databases, Node/OS runtime info, " +
    "critical library versions, and the WeChat token file. Safe to call anytime.",
  async handler(ctx) {
    const base = await runDoctor();
    const extra = hasSlashRegistry(ctx.queryEngine)
      ? formatSlashDiagnostics(ctx.queryEngine.getSlashRegistry())
      : "";
    return reply(`${base}${extra}`);
  },
});
