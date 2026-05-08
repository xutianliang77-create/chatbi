-- Agent Team write proposal audit index.
-- The full replay snapshot still lives in team_runs.run_json; this table makes
-- proposal status/path/session queries cheap and durable.

CREATE TABLE IF NOT EXISTS team_write_proposals (
  proposal_id   TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  session_id    TEXT,
  task_id       TEXT NOT NULL,
  claim_id      TEXT NOT NULL,
  path          TEXT NOT NULL,
  status        TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  risk          TEXT NOT NULL,
  rollback_hint TEXT NOT NULL,
  preview_json  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  applied_at    INTEGER,
  rejected_at   INTEGER,
  FOREIGN KEY (run_id) REFERENCES team_runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_team_write_proposals_run
  ON team_write_proposals(run_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_team_write_proposals_session
  ON team_write_proposals(session_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_team_write_proposals_status
  ON team_write_proposals(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_team_write_proposals_path
  ON team_write_proposals(path, status);
