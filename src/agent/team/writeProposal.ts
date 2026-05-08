import { previewClaimedFileWrite } from "./writeExecutor";
import type {
  BlackboardEntry,
  TeamClaim,
  TeamRun,
  TeamTaskRun,
  TeamWriteProposal,
} from "./types";

interface CreateTeamWriteProposalInput {
  run: TeamRun;
  claimId: string;
  prompt: string;
  workspace: string;
  risk?: string;
  rollbackHint?: string;
  now?: number;
  random?: () => number;
}

export type CreateTeamWriteProposalResult =
  | {
      ok: true;
      claim: TeamClaim;
      taskRun: TeamTaskRun;
      proposal: TeamWriteProposal;
    }
  | {
      ok: false;
      message: string;
    };

export async function createTeamWriteProposalForClaim(
  input: CreateTeamWriteProposalInput
): Promise<CreateTeamWriteProposalResult> {
  const claim = input.run.claims.find((item) => item.id === input.claimId);
  if (!claim) {
    return { ok: false, message: `No Team claim found for ${input.claimId}.` };
  }
  if (claim.status !== "active") {
    return {
      ok: false,
      message: `Team claim ${input.claimId} must be active before creating a write proposal; current status is ${claim.status}.`,
    };
  }

  const taskRun = input.run.taskRuns.find((item) => item.task.id === claim.taskId);
  if (!taskRun) {
    return { ok: false, message: `No Team task found for claim ${input.claimId}.` };
  }

  const preview = await previewClaimedFileWrite({
    task: taskRun.task,
    claims: [claim],
    prompt: input.prompt,
    workspace: input.workspace,
  });
  const updatedAt = input.now ?? Date.now();
  const random = input.random ?? Math.random;
  input.run.writeProposals ??= [];
  const proposal: TeamWriteProposal = {
    id: `team-proposal-${input.run.writeProposals.length + 1}-${random().toString(36).slice(2, 8)}`,
    teamRunId: input.run.id,
    taskId: claim.taskId,
    claimId: claim.id,
    path: claim.path,
    prompt: input.prompt,
    status: preview.ok ? "preview_ready" : "blocked",
    risk: input.risk?.trim() || "claimed-file-only write; must be applied through executeClaimedFileWrite()",
    rollbackHint: input.rollbackHint?.trim() || `Review the generated diff/backup for ${claim.path}; do not apply outside the active claim.`,
    preview: {
      ok: preview.ok,
      summary: preview.summary,
      detail: preview.detail,
      ...(preview.beforeSnippet !== undefined ? { beforeSnippet: preview.beforeSnippet } : {}),
      ...(preview.afterSnippet !== undefined ? { afterSnippet: preview.afterSnippet } : {}),
    },
    createdAt: updatedAt,
    updatedAt,
  };

  input.run.writeProposals.push(proposal);
  input.run.updatedAt = updatedAt;
  input.run.summary = preview.ok
    ? `Team write proposal ${proposal.id} is ready for preview/confirm: ${claim.path}.`
    : `Team write proposal ${proposal.id} is blocked: ${preview.detail}`;
  input.run.blackboard.push(buildProposalBlackboardEntry(input.run, proposal, preview.ok, updatedAt));

  return { ok: true, claim, taskRun, proposal };
}

export type RejectTeamWriteProposalResult =
  | { ok: true; proposal: TeamWriteProposal }
  | { ok: false; message: string };

export function rejectTeamWriteProposalForRun(
  run: TeamRun,
  proposalId: string,
  now = Date.now()
): RejectTeamWriteProposalResult {
  const proposal = (run.writeProposals ?? []).find((item) => item.id === proposalId);
  if (!proposal) {
    return { ok: false, message: `Team write proposal ${proposalId} does not belong to run ${run.id}.` };
  }
  if (proposal.status === "applied") {
    return { ok: false, message: `Team write proposal ${proposalId} is already applied and cannot be rejected.` };
  }

  proposal.status = "rejected";
  proposal.updatedAt = now;
  proposal.rejectedAt = now;
  run.updatedAt = now;
  run.summary = `Team write proposal ${proposal.id} rejected: ${proposal.path}.`;
  run.blackboard.push({
    id: `bb-${run.blackboard.length + 1}`,
    taskId: proposal.taskId,
    kind: "decision",
    summary: `${proposal.id}: rejected for ${proposal.path}`,
    evidenceRefs: [{ type: "approval", id: proposal.claimId, status: "blocked" }],
    createdAt: now,
  });

  return { ok: true, proposal };
}

export class TeamWriteApplyQueue {
  private readonly activeByRun = new Map<string, string>();

  async run<T>(runId: string, proposalId: string, apply: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    const activeProposalId = this.activeByRun.get(runId);
    if (activeProposalId) {
      return {
        ok: false,
        message: `TeamRun ${runId} already has an applying write proposal: ${activeProposalId}.`,
      };
    }
    this.activeByRun.set(runId, proposalId);
    try {
      return { ok: true, value: await apply() };
    } finally {
      this.activeByRun.delete(runId);
    }
  }
}

function buildProposalBlackboardEntry(
  run: TeamRun,
  proposal: TeamWriteProposal,
  previewOk: boolean,
  createdAt: number
): BlackboardEntry {
  return {
    id: `bb-${run.blackboard.length + 1}`,
    taskId: proposal.taskId,
    kind: previewOk ? "decision" : "risk",
    summary: `${proposal.id}: ${proposal.preview.summary} for ${proposal.path}`,
    evidenceRefs: [{ type: "approval", id: proposal.claimId, status: previewOk ? "passed" : "blocked" }],
    createdAt,
  };
}
