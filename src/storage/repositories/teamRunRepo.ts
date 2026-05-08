import type Database from "better-sqlite3";

import { evaluateTeamMergeGate } from "../../agent/team/mergeGate";
import type { TeamRun, TeamWriteProposal } from "../../agent/team/types";

export interface TeamWriteProposalAuditRow {
  proposalId: string;
  runId: string;
  sessionId?: string;
  taskId: string;
  claimId: string;
  path: string;
  status: TeamWriteProposal["status"];
  prompt: string;
  risk: string;
  rollbackHint: string;
  preview: TeamWriteProposal["preview"];
  createdAt: number;
  updatedAt: number;
  appliedAt?: number;
  rejectedAt?: number;
}

export class TeamRunRepo {
  constructor(private readonly db: Database.Database) {}

  save(run: TeamRun): void {
    this.db
      .prepare(
        `INSERT INTO team_runs(run_id, session_id, user_goal, status, summary, run_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET
           session_id = excluded.session_id,
           user_goal = excluded.user_goal,
           status = excluded.status,
           summary = excluded.summary,
           run_json = excluded.run_json,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`
      )
      .run(
        run.id,
        run.sessionId ?? null,
        run.userGoal,
        run.status,
        run.summary,
        JSON.stringify(run),
        run.createdAt,
        run.updatedAt
      );
    this.saveClaims(run);
    this.saveWriteProposals(run);
  }

  get(id: string): TeamRun | undefined {
    const row = this.db
      .prepare<[string], { run_json: string }>("SELECT run_json FROM team_runs WHERE run_id = ?")
      .get(id);
    return row ? parseRun(row.run_json) : undefined;
  }

  list(sessionId?: string, limit = 20): TeamRun[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = sessionId
      ? this.db
          .prepare<[string, number], { run_json: string }>(
            `SELECT run_json FROM team_runs
             WHERE session_id = ?
             ORDER BY updated_at DESC
             LIMIT ?`
          )
          .all(sessionId, safeLimit)
      : this.db
          .prepare<[number], { run_json: string }>(
            `SELECT run_json FROM team_runs
             ORDER BY updated_at DESC
             LIMIT ?`
          )
          .all(safeLimit);
    return rows.map((row) => parseRun(row.run_json)).filter((run): run is TeamRun => Boolean(run));
  }

  listWriteProposals(options: {
    sessionId?: string;
    runId?: string;
    status?: TeamWriteProposal["status"];
    path?: string;
    limit?: number;
  } = {}): TeamWriteProposalAuditRow[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 20)));
    const where: string[] = [];
    const params: unknown[] = [];
    if (options.sessionId) {
      where.push("session_id = ?");
      params.push(options.sessionId);
    }
    if (options.runId) {
      where.push("run_id = ?");
      params.push(options.runId);
    }
    if (options.status) {
      where.push("status = ?");
      params.push(options.status);
    }
    if (options.path) {
      where.push("path = ?");
      params.push(options.path);
    }
    params.push(safeLimit);
    const rows = this.db
      .prepare(
        `SELECT proposal_id, run_id, session_id, task_id, claim_id, path, status, prompt,
                risk, rollback_hint, preview_json, created_at, updated_at, applied_at, rejected_at
         FROM team_write_proposals
         ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(...params) as TeamWriteProposalRow[];
    return rows.map(toWriteProposalAuditRow);
  }

  private saveClaims(run: TeamRun): void {
    const claims = run.claims ?? [];
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM team_claims WHERE run_id = ?").run(run.id);
      const insert = this.db.prepare(
        `INSERT INTO team_claims(
           claim_id, run_id, task_id, path, mode, status, reason, created_at, released_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const claim of claims) {
        insert.run(
          claim.id,
          claim.teamRunId,
          claim.taskId,
          claim.path,
          claim.mode,
          claim.status,
          claim.reason ?? null,
          claim.createdAt,
          claim.releasedAt ?? null
        );
      }
    });
    tx();
  }

  private saveWriteProposals(run: TeamRun): void {
    const proposals = run.writeProposals ?? [];
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM team_write_proposals WHERE run_id = ?").run(run.id);
      const insert = this.db.prepare(
        `INSERT INTO team_write_proposals(
           proposal_id, run_id, session_id, task_id, claim_id, path, status,
           prompt, risk, rollback_hint, preview_json, created_at, updated_at, applied_at, rejected_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const proposal of proposals) {
        insert.run(
          proposal.id,
          proposal.teamRunId,
          run.sessionId ?? null,
          proposal.taskId,
          proposal.claimId,
          proposal.path,
          proposal.status,
          proposal.prompt,
          proposal.risk,
          proposal.rollbackHint,
          JSON.stringify(proposal.preview),
          proposal.createdAt,
          proposal.updatedAt,
          proposal.appliedAt ?? null,
          proposal.rejectedAt ?? null
        );
      }
    });
    tx();
  }
}

interface TeamWriteProposalRow {
  proposal_id: string;
  run_id: string;
  session_id: string | null;
  task_id: string;
  claim_id: string;
  path: string;
  status: TeamWriteProposal["status"];
  prompt: string;
  risk: string;
  rollback_hint: string;
  preview_json: string;
  created_at: number;
  updated_at: number;
  applied_at: number | null;
  rejected_at: number | null;
}

function toWriteProposalAuditRow(row: TeamWriteProposalRow): TeamWriteProposalAuditRow {
  return {
    proposalId: row.proposal_id,
    runId: row.run_id,
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    taskId: row.task_id,
    claimId: row.claim_id,
    path: row.path,
    status: row.status,
    prompt: row.prompt,
    risk: row.risk,
    rollbackHint: row.rollback_hint,
    preview: parsePreview(row.preview_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.applied_at !== null ? { appliedAt: row.applied_at } : {}),
    ...(row.rejected_at !== null ? { rejectedAt: row.rejected_at } : {}),
  };
}

function parsePreview(json: string): TeamWriteProposal["preview"] {
  try {
    const value = JSON.parse(json) as TeamWriteProposal["preview"];
    if (value && typeof value.ok === "boolean" && typeof value.summary === "string" && typeof value.detail === "string") {
      return value;
    }
  } catch {
    // fall through to a safe placeholder
  }
  return {
    ok: false,
    summary: "Preview unavailable",
    detail: "Stored preview_json could not be parsed.",
  };
}

function parseRun(json: string): TeamRun | undefined {
  try {
    const value = JSON.parse(json) as TeamRun;
    if (!value || typeof value.id !== "string") return undefined;
    value.writeProposals ??= [];
    if (!value.mergeGate && value.plan && Array.isArray(value.taskRuns)) {
      value.mergeGate = evaluateTeamMergeGate(value.plan, value.taskRuns);
    }
    return value;
  } catch {
    return undefined;
  }
}
