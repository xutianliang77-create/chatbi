import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildTeamPlan, createTeamWriteProposalForClaim, runReadOnlyTeamPlan } from "../../../../src/agent/team";
import { TeamRunRepo } from "../../../../src/storage/repositories/teamRunRepo";
import { migrateIfNeeded } from "../../../../src/storage/migrate";

let tmpRoot: string;
let db: Database.Database;

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), "codeclaw-team-repo-"));
  db = new Database(path.join(tmpRoot, "data.db"));
  migrateIfNeeded(db, "data");
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // noop
  }
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("TeamRunRepo", () => {
  it("saves and lists TeamRun snapshots by session", () => {
    const repo = new TeamRunRepo(db);
    const run = runReadOnlyTeamPlan(buildTeamPlan("审查 src/agent/queryEngine.ts"), {
      now: () => 1234,
      sessionId: "session-a",
    });
    repo.save(run);

    expect(repo.get(run.id)?.summary).toBe(run.summary);
    expect(repo.list("session-a")).toHaveLength(1);
    expect(repo.list("session-b")).toHaveLength(0);
  });

  it("persists claimed-file gate rows for blocked write workers", () => {
    const repo = new TeamRunRepo(db);
    const run = runReadOnlyTeamPlan(buildTeamPlan("修复 src/agent/queryEngine.ts 并补测试"), {
      now: () => 5678,
      sessionId: "session-write",
    });
    repo.save(run);

    const rows = db.prepare("SELECT path, status FROM team_claims WHERE run_id = ?").all(run.id) as Array<{
      path: string;
      status: string;
    }>;
    expect(rows).toContainEqual({
      path: "src/agent/queryEngine.ts",
      status: "pending_approval",
    });
  });

  it("persists write proposal audit rows for cross-session replay", async () => {
    const repo = new TeamRunRepo(db);
    mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
    writeFileSync(path.join(tmpRoot, "src/example.ts"), "const value = 'old';\n", "utf8");

    const run = runReadOnlyTeamPlan(buildTeamPlan("修复 src/example.ts"), {
      now: () => 9000,
      sessionId: "session-proposal",
    });
    const claim = run.claims[0];
    expect(claim).toBeDefined();
    claim!.status = "active";
    const created = await createTeamWriteProposalForClaim({
      run,
      claimId: claim!.id,
      prompt: "/replace src/example.ts :: old :: new",
      workspace: tmpRoot,
      now: 9010,
      random: () => 0.123456,
    });
    expect(created.ok).toBe(true);
    repo.save(run);

    const rows = db.prepare("SELECT proposal_id, path, status FROM team_write_proposals WHERE run_id = ?").all(run.id) as Array<{
      proposal_id: string;
      path: string;
      status: string;
    }>;
    expect(rows).toEqual([
      {
        proposal_id: run.writeProposals[0]!.id,
        path: "src/example.ts",
        status: "preview_ready",
      },
    ]);
    expect(repo.listWriteProposals({ sessionId: "session-proposal" })[0]).toMatchObject({
      proposalId: run.writeProposals[0]!.id,
      runId: run.id,
      sessionId: "session-proposal",
      path: "src/example.ts",
      status: "preview_ready",
      preview: {
        ok: true,
      },
    });
  });
});
