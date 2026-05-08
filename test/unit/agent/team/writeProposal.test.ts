import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildTeamPlan,
  createTeamWriteProposalForClaim,
  evaluateTeamMergeGate,
  rejectTeamWriteProposalForRun,
  TeamWriteApplyQueue,
  type TeamClaim,
  type TeamRun,
} from "../../../../src/agent/team";

async function setupRun() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "codeclaw-team-proposal-"));
  const target = "src/example.ts";
  const absoluteTarget = path.join(workspace, target);
  await mkdir(path.dirname(absoluteTarget), { recursive: true });
  await writeFile(absoluteTarget, "const value = 'old';\n", "utf8");

  const plan = buildTeamPlan("修复 src/example.ts");
  const taskRuns = plan.tasks.map((task) => ({ task, status: "pending" as const }));
  const task = taskRuns.find((item) => item.task.role === "implementer")?.task;
  expect(task).toBeDefined();
  const claim: TeamClaim = {
    id: "claim-1",
    teamRunId: "run-1",
    taskId: task!.id,
    path: target,
    mode: "write",
    status: "active",
    createdAt: 1,
  };
  const run: TeamRun = {
    id: "run-1",
    userGoal: plan.userGoal,
    status: "running",
    plan,
    taskRuns,
    claims: [claim],
    writeProposals: [],
    mergeGate: evaluateTeamMergeGate(plan, taskRuns),
    blackboard: [],
    mailbox: [],
    summary: "",
    createdAt: 1,
    updatedAt: 1,
  };
  return { workspace, target, run, claim };
}

describe("Agent Team write proposals", () => {
  it("creates dry-run proposals without modifying the claimed file", async () => {
    const { workspace, target, run, claim } = await setupRun();

    const result = await createTeamWriteProposalForClaim({
      run,
      claimId: claim.id,
      prompt: `/replace ${target} :: old :: new`,
      workspace,
      now: 10,
      random: () => 0.123456,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected proposal");
    expect(result.proposal.status).toBe("preview_ready");
    expect(result.proposal.preview.ok).toBe(true);
    expect(run.writeProposals).toHaveLength(1);
    expect(run.blackboard[0]?.kind).toBe("decision");
    await expect(readFile(path.join(workspace, target), "utf8")).resolves.toContain("'old'");
  });

  it("rejects unapplied proposals and records the decision", async () => {
    const { workspace, target, run, claim } = await setupRun();
    const result = await createTeamWriteProposalForClaim({
      run,
      claimId: claim.id,
      prompt: `/replace ${target} :: old :: new`,
      workspace,
      now: 10,
    });
    if (!result.ok) throw new Error(result.message);

    const rejected = rejectTeamWriteProposalForRun(run, result.proposal.id, 20);

    expect(rejected.ok).toBe(true);
    expect(result.proposal.status).toBe("rejected");
    expect(result.proposal.rejectedAt).toBe(20);
    expect(run.blackboard.at(-1)?.summary).toContain("rejected");
  });

  it("serializes apply execution per TeamRun", async () => {
    const queue = new TeamWriteApplyQueue();
    let releaseFirst!: () => void;
    const first = queue.run(
      "run-1",
      "proposal-1",
      () => new Promise<string>((resolve) => {
        releaseFirst = () => resolve("applied");
      })
    );

    const second = await queue.run("run-1", "proposal-2", async () => "should-not-run");
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("expected queue rejection");
    expect(second.message).toContain("already has an applying write proposal");

    releaseFirst();
    await expect(first).resolves.toEqual({ ok: true, value: "applied" });
  });
});
