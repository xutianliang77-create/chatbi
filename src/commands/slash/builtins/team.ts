import { defineCommand, reply } from "../registry";

interface TeamHolder {
  runTeamCommand(prompt: string): string | Promise<string>;
}

function isHolder(value: unknown): value is TeamHolder {
  return !!value && typeof (value as TeamHolder).runTeamCommand === "function";
}

export default defineCommand({
  name: "/team",
  category: "workflow",
  risk: "medium",
  summary: "Plan or inspect a bounded multi-agent team run.",
  summaryZh: "规划或查看有边界的多 Agent 团队任务",
  helpDetail:
    "Usage:\n" +
    "  /team plan <goal>     create a local plan-only Agent Team plan\n" +
    "  /team run <goal>      run bounded read-only explorer/reviewer workers\n" +
    "  /team status [runId]  show the latest or selected TeamRun\n" +
    "  /team approve <claimId> approve a claimed-file gate without executing writes\n" +
    "  /team deny <claimId>  deny a claimed-file gate\n" +
    "  /team cancel <runId> cancel a blocked or waiting TeamRun\n" +
    "  /team retry <runId>  retry a read-only TeamRun\n" +
    "\n" +
    "Read-only workers may use controlled subagents. Write workers remain blocked until claimed-file execution lands.",
  async handler(ctx) {
    if (!isHolder(ctx.queryEngine)) {
      return reply("team command unavailable: runtime missing runTeamCommand");
    }
    return reply(await ctx.queryEngine.runTeamCommand(ctx.rawPrompt));
  },
});
