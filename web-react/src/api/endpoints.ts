/**
 * 后端 endpoint 类型化封装（B.2）
 *
 * 与 src/channels/web/handlers.ts 的契约一一对应。
 * 类型故意保留 `unknown` / 宽松，避免双仓库 schema 漂移。
 */

import { api } from "./client";

export interface SessionMeta {
  sessionId: string;
  userId: string;
  channel: "http";
  createdAt: number;
  lastSeenAt: number;
  title?: string;
  messageCount?: number;
  workspace?: string;
  estimatedTokens?: number;
  contextWindow?: number;
  contextExceeded?: boolean;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "error" | "tool";
  text: string;
  ts: number;
  tool?: { name: string; status: "running" | "completed" | "blocked" | "failed" | "pending"; detail?: string };
}

export interface SessionContextDiagnosticItem {
  id: string;
  index: number;
  role: "user" | "assistant" | "system" | "tool";
  source?: string;
  toolName?: string;
  chars: number;
  tokens: number;
  preview: string;
}

export interface SessionContextDiagnostics {
  sessionId: string;
  messages: number;
  estimatedTokens: number;
  contextWindow?: number;
  contextExceeded: boolean;
  largestContextItems: SessionContextDiagnosticItem[];
  largestToolResults: SessionContextDiagnosticItem[];
  suggestions: string[];
}

export interface RagStatus {
  chunkCount: number;
  embeddedCount: number;
  lastIndexedAt: number | null;
  workspaceMeta: string | null;
}

export interface RagHit {
  relPath: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  score?: number;
  rrfScore?: number;
  source?: string;
  hits?: string[];
}

export interface GraphStatus {
  symbols: number;
  imports: number;
  calls: number;
  lsp?: {
    backend: "fallback-regex-index" | "multilspy";
    degraded: boolean;
    reason: string;
    fallback: "fallback-regex-index";
    realCandidate: {
      name: "multilspy";
      status: "not_installed" | "not_enabled" | "ready";
      pythonCommand?: string;
    };
  };
}

export type GraphQueryType = "callers" | "callees" | "dependents" | "dependencies" | "symbol";

export interface McpServerSnapshot {
  name: string;
  status: string;
  toolCount: number;
  restartCount: number;
  lastError?: string;
}

export interface McpToolDescriptor {
  server: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface StatusLine {
  text: string;
  kind: "default" | "custom";
  lastUpdate: number;
}

export type NotificationEventType =
  | "task_completed"
  | "approval_required"
  | "context_budget_exceeded"
  | "provider_cooldown"
  | "report_ready"
  | "cron_failed";

export interface NotificationHistoryEntry {
  id: string;
  type: NotificationEventType;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "error";
  delivered: boolean;
  suppressed: boolean;
  adapter: "auto" | "macos" | "terminal" | "none";
  reason?: string;
  sessionId?: string;
  workspace?: string;
  resourceId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DoctorStatus {
  output: string;
  sections: string[];
  generatedAt: number;
  diagnostics?: {
    slashRegistry: NonNullable<DoctorStatus["slashRegistry"]>;
    activeSkill: {
      name: string;
      source: string;
      context?: string;
      model?: string;
      agent?: string;
      allowedTools: string[];
      mcpServers: string[];
      mcpTools: string[];
    } | null;
    toolPool: {
      total: number;
      visible: number;
      hidden: number;
      sourceCounts: Record<"builtin" | "mcp" | "extension", number>;
      riskCounts: Record<"low" | "medium" | "high", number>;
      concurrencyCounts: Record<"parallel" | "serial" | "exclusive", number>;
      approvalCounts: Record<"none" | "permission_manager", number>;
    };
  } | null;
  slashRegistry?: {
    commands: number;
    aliases: number;
    sourceCounts: Record<"builtin" | "skill" | "plugin", number>;
    conflicts: Array<{
      attemptedName: string;
      existingName: string;
      policy: string;
      attemptedSource: string;
      existingSource: string;
      attemptedOwner?: string;
      existingOwner?: string;
    }>;
  } | null;
}

export type AuditDecision = "allow" | "deny" | "approved" | "rejected" | "pending";

export interface AuditEvent {
  eventId: string;
  traceId: string;
  sessionId: string | null;
  actor: string;
  action: string;
  resource: string | null;
  decision: AuditDecision;
  mode: string | null;
  reason: string | null;
  details: Record<string, unknown> | null;
  prevHash: string;
  eventHash: string;
  timestamp: number;
}

export interface AuditVerification {
  ok: boolean;
  checkedCount: number;
  durationMs: number;
  brokenAt?: string;
  reason?: string;
}

export const listAuditEvents = (input: {
  limit?: number;
  sessionId?: string;
  decision?: AuditDecision | "";
  action?: string;
  actor?: string;
  traceId?: string;
  verify?: boolean;
} = {}) => {
  const q = new URLSearchParams();
  q.set("limit", String(input.limit ?? 100));
  if (input.sessionId) q.set("sessionId", input.sessionId);
  if (input.decision) q.set("decision", input.decision);
  if (input.action) q.set("action", input.action);
  if (input.actor) q.set("actor", input.actor);
  if (input.traceId) q.set("traceId", input.traceId);
  if (input.verify) q.set("verify", "1");
  return api<{ events: AuditEvent[]; count: number; verification?: AuditVerification }>(
    "GET",
    `/v1/web/audit/events?${q.toString()}`
  );
};

export interface TeamRunSnapshot {
  id: string;
  sessionId?: string;
  userGoal: string;
  status: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
  mergeGate?: {
    status: string;
    strategy: string;
    requiredRoles: string[];
    satisfiedRoles: string[];
    missingRoles: string[];
    summary: string;
  };
  claims?: Array<{
    id: string;
    taskId: string;
    path: string;
    mode: string;
    status: string;
    reason?: string;
  }>;
  writeProposals?: Array<{
    id: string;
    teamRunId: string;
    taskId: string;
    claimId: string;
    path: string;
    prompt: string;
    status: string;
    risk: string;
    rollbackHint: string;
    preview: {
      ok: boolean;
      summary: string;
      detail: string;
      beforeSnippet?: string;
      afterSnippet?: string;
    };
    createdAt: number;
    updatedAt: number;
    appliedAt?: number;
    rejectedAt?: number;
  }>;
  taskRuns: Array<{
    task: { id: string; role: string; objective: string; deps: string[]; writePolicy: string; model?: string };
    status: string;
    blockedReason?: string;
    result?: { summary: string; nextSteps: string[]; risks: string[] };
  }>;
  blackboard: Array<{ id: string; taskId: string; kind: string; summary: string; createdAt: number }>;
  mailbox: Array<{ id: string; fromTaskId: string; toTaskId?: string; kind: string; summary: string; text: string }>;
}

export interface TeamWritePreview {
  ok: boolean;
  toolName?: string;
  target?: string;
  claimId?: string;
  summary: string;
  detail: string;
  beforeSnippet?: string;
  afterSnippet?: string;
}

export interface ArtifactRef {
  path: string;
  kind: "json" | "markdown" | "html" | "png" | "pdf" | "pptx" | "text";
  bytes?: number;
  createdAt: string;
}

export interface SqlProvenance {
  sql: string;
  queryId?: string;
  mcpServer?: string;
  toolName?: string;
  generatedBy?: {
    provider?: string;
    model?: string;
  };
  preview?: {
    rows: number;
    rowCount?: number;
    truncated: boolean;
  };
  artifacts?: {
    preview?: ArtifactRef;
    result?: ArtifactRef;
  };
}

export interface ReportDataset {
  id: string;
  name: string;
  sql?: string;
  queryId?: string;
  previewRows: number;
  rowCount?: number;
  previewArtifact?: ArtifactRef;
  resultArtifact?: ArtifactRef;
  provenance?: SqlProvenance;
}

export interface ReportArtifact {
  id: string;
  title: string;
  question: string;
  owner: { type: string; id: string; displayName?: string };
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "reviewed" | "shared" | "archived";
  datasets: ReportDataset[];
  charts: Array<{ id: string; title: string; datasetId: string }>;
  sections: Array<{ id: string; title: string; markdown: string }>;
  insights: Array<{ id: string; title?: string; markdown: string }>;
  caveats: Array<{ code: string; message: string }>;
  exports: Array<{ id: string; format: string; artifact: ArtifactRef }>;
  provenance?: {
    source: string;
    question?: string;
    sessionId?: string;
    traceId?: string;
    model?: string;
    provider?: string;
  };
  upgrade?: { dashboardId?: string; upgradedAt?: string };
}

export interface DashboardDataset {
  id: string;
  name: string;
  kind: string;
  sql?: string;
  rows?: Array<Record<string, unknown>>;
  data?: Array<Record<string, unknown>>;
  preview?: Array<Record<string, unknown>>;
  sourceArtifact?: ArtifactRef;
  resultArtifact?: ArtifactRef;
  previewRows: number;
  rowCount?: number;
  refresh?: { mode?: string; queryId?: string };
  provenance?: SqlProvenance;
}

export interface DashboardSpec {
  id: string;
  title: string;
  description?: string;
  owner: { type: string; id: string; displayName?: string };
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "published" | "archived";
  sourceReportId?: string;
  datasets: DashboardDataset[];
  pages: Array<{
    id: string;
    title: string;
    widgets: Array<{
      id: string;
      type: string;
      title: string;
      datasetId?: string;
      chart?: Record<string, unknown>;
      text?: string;
    }>;
  }>;
  filters: unknown[];
  parameters: unknown[];
  interactions: unknown[];
  provenance?: {
    source: string;
    sourceReportId?: string;
    question?: string;
    sessionId?: string;
    traceId?: string;
    model?: string;
    provider?: string;
  };
  lifecycle: { version: number; publishedAt?: string };
}

// ===== sessions =====

export const listSessions = () => api<{ sessions: SessionMeta[] }>("GET", "/v1/web/sessions");
export const createSession = () => api<SessionMeta>("POST", "/v1/web/sessions");
export const deleteSession = (sessionId: string) =>
  api<{ ok: boolean }>("DELETE", `/v1/web/sessions/${encodeURIComponent(sessionId)}`);
export const getSessionMessages = (sessionId: string) =>
  api<{ messages: SessionMessage[] }>("GET", `/v1/web/sessions/${encodeURIComponent(sessionId)}/messages`);
export const getSessionContext = (sessionId: string) =>
  api<{ diagnostics: SessionContextDiagnostics }>(
    "GET",
    `/v1/web/sessions/${encodeURIComponent(sessionId)}/context`
  );
export const getSubagents = (sessionId: string) =>
  api<{ subagents: unknown[]; note?: string }>(
    "GET",
    `/v1/web/sessions/${encodeURIComponent(sessionId)}/subagents`
  );
export const getTeamRuns = (sessionId: string) =>
  api<{ runs: TeamRunSnapshot[]; note?: string }>(
    "GET",
    `/v1/web/sessions/${encodeURIComponent(sessionId)}/team-runs`
  );
export const cancelTeamRun = (sessionId: string, runId: string) =>
  api<{ ok: boolean; text: string; run?: TeamRunSnapshot }>(
    "POST",
    `/v1/web/sessions/${encodeURIComponent(sessionId)}/team-runs/${encodeURIComponent(runId)}/cancel`
  );
export const retryTeamRun = (sessionId: string, runId: string) =>
  api<{ ok: boolean; text: string; runs: TeamRunSnapshot[] }>(
    "POST",
    `/v1/web/sessions/${encodeURIComponent(sessionId)}/team-runs/${encodeURIComponent(runId)}/retry`
  );
export const previewTeamClaimWrite = (sessionId: string, runId: string, claimId: string, prompt: string) =>
  api<{ preview: TeamWritePreview }>(
    "POST",
    `/v1/web/sessions/${encodeURIComponent(sessionId)}/team-runs/${encodeURIComponent(runId)}/write-preview`,
    { claimId, prompt }
  );
export const writeTeamClaim = (sessionId: string, runId: string, claimId: string, prompt: string) =>
  api<{ ok: boolean; text: string; run?: TeamRunSnapshot }>(
    "POST",
    `/v1/web/sessions/${encodeURIComponent(sessionId)}/team-runs/${encodeURIComponent(runId)}/write`,
    { claimId, prompt, confirmed: true }
  );
export const applyTeamWriteProposal = (sessionId: string, runId: string, proposalId: string) =>
  api<{ ok: boolean; text: string; run?: TeamRunSnapshot }>(
    "POST",
    `/v1/web/sessions/${encodeURIComponent(sessionId)}/team-runs/${encodeURIComponent(runId)}/write-proposals/${encodeURIComponent(proposalId)}/apply`,
    { confirmed: true }
  );
export const rejectTeamWriteProposal = (sessionId: string, runId: string, proposalId: string) =>
  api<{ ok: boolean; text: string; run?: TeamRunSnapshot }>(
    "POST",
    `/v1/web/sessions/${encodeURIComponent(sessionId)}/team-runs/${encodeURIComponent(runId)}/write-proposals/${encodeURIComponent(proposalId)}/reject`
  );

// ===== messages =====

export interface MessageAttachment {
  kind: "image" | "dicom";
  dataUrl: string;
  fileName?: string;
  mimeType?: string;
}

export const sendMessage = (sessionId: string, input: string, attachments?: MessageAttachment[]) =>
  api<{ accepted: boolean }>("POST", "/v1/web/messages", {
    sessionId,
    input,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  });

// ===== providers / cost =====

export const getProviders = () =>
  api<{ current: unknown; fallback: unknown }>("GET", "/v1/web/providers");
export const getCost = (sessionId: string) =>
  api<{ enabled: boolean; session?: unknown; today?: unknown }>(
    "GET",
    `/v1/web/cost?sessionId=${encodeURIComponent(sessionId)}`
  );

// ===== MCP =====

export const listMcpServers = () =>
  api<{ servers: McpServerSnapshot[] }>("GET", "/v1/web/mcp/servers");
export const listMcpTools = (server?: string) =>
  api<{ tools: McpToolDescriptor[] }>(
    "GET",
    server ? `/v1/web/mcp/tools?server=${encodeURIComponent(server)}` : "/v1/web/mcp/tools"
  );
export const callMcpTool = (server: string, tool: string, args: unknown) =>
  api<{ ok: boolean; content?: unknown; isError?: boolean }>("POST", "/v1/web/mcp/call", {
    server,
    tool,
    args,
  });

// ===== Hooks =====

export const getHooks = () =>
  api<{ events: Record<string, unknown> }>("GET", "/v1/web/hooks");
export const reloadHooks = () =>
  api<{ ok: boolean; events: Record<string, unknown> }>("POST", "/v1/web/hooks/reload");

// ===== RAG =====

export const ragStatus = () => api<RagStatus>("GET", "/v1/web/rag/status");
export const ragIndex = () =>
  api<{ summary: string; progress: unknown }>("POST", "/v1/web/rag/index");
export const ragEmbed = (opts: { maxChunks?: number; batch?: number } = {}) =>
  api<{ embeddedNow: number; embeddedTotal: number; remaining: number; durationMs: number }>(
    "POST",
    "/v1/web/rag/embed",
    opts
  );
export const ragSearch = (query: string, topK = 8) =>
  api<{ mode: "hybrid" | "bm25"; hits: RagHit[] }>("POST", "/v1/web/rag/search", {
    query,
    topK,
  });

// ===== Graph =====

export const graphStatus = () => api<GraphStatus>("GET", "/v1/web/graph/status");
export const graphBuild = () =>
  api<{ summary: string; progress: unknown }>("POST", "/v1/web/graph/build");
export const graphQuery = (type: GraphQueryType, arg: string, arg2?: string) =>
  api<{ result: unknown }>("POST", "/v1/web/graph/query", {
    type,
    arg,
    ...(arg2 ? { arg2 } : {}),
  });

// ===== status line =====

export const getStatusLine = () => api<StatusLine>("GET", "/v1/web/status-line");

// ===== Notifications =====

export const listNotifications = (input: {
  limit?: number;
  sessionId?: string;
  type?: NotificationEventType | "";
} = {}) => {
  const q = new URLSearchParams();
  q.set("limit", String(input.limit ?? 50));
  if (input.sessionId) q.set("sessionId", input.sessionId);
  if (input.type) q.set("type", input.type);
  return api<{ entries: NotificationHistoryEntry[]; count: number; generatedAt: number }>(
    "GET",
    `/v1/web/notifications?${q.toString()}`
  );
};

// ===== Doctor =====

export const getDoctorStatus = () => api<DoctorStatus>("GET", "/v1/web/doctor");
export const getSessionDoctorStatus = (sessionId: string) =>
  api<DoctorStatus>("GET", `/v1/web/sessions/${encodeURIComponent(sessionId)}/doctor`);

// ===== Reports / Dashboards =====

export const listReports = () =>
  api<{ reports: ReportArtifact[] }>("GET", "/v1/web/reports");

export const readReport = (reportId: string) =>
  api<{ report: ReportArtifact }>("GET", `/v1/web/reports/${encodeURIComponent(reportId)}`);

export type ReportExportFormat = "html" | "markdown" | "docx" | "pptx";

export const exportReport = (reportId: string, format: ReportExportFormat = "html") =>
  api<{ artifact: ArtifactRef }>(
    "POST",
    `/v1/web/reports/${encodeURIComponent(reportId)}/export`,
    { format }
  );

export const upgradeReportToDashboard = (
  reportId: string,
  body: { dashboardId?: string; title?: string } = {}
) =>
  api<{ dashboard: DashboardSpec }>(
    "POST",
    `/v1/web/reports/${encodeURIComponent(reportId)}/upgrade-dashboard`,
    body
  );

export const listDashboards = () =>
  api<{ dashboards: DashboardSpec[] }>("GET", "/v1/web/dashboards");

export const readDashboard = (dashboardId: string) =>
  api<{ dashboard: DashboardSpec }>("GET", `/v1/web/dashboards/${encodeURIComponent(dashboardId)}`);

export const renderDashboard = (dashboardId: string) =>
  api<{ artifact: ArtifactRef }>(
    "POST",
    `/v1/web/dashboards/${encodeURIComponent(dashboardId)}/render`
  );

export const validateDashboard = (dashboardId: string) =>
  api<{ valid: boolean; errors: string[]; warnings: string[] }>(
    "POST",
    `/v1/web/dashboards/${encodeURIComponent(dashboardId)}/validate`
  );

// ===== Cron #116 =====

export type CronTaskKind = "slash" | "prompt" | "shell";
export type CronNotifyChannel = "cli" | "wechat" | "web";

export interface CronTask {
  id: string;
  name: string;
  schedule: string;
  kind: CronTaskKind;
  payload: string;
  enabled: boolean;
  notifyChannels?: CronNotifyChannel[];
  timeoutMs?: number;
  workspace?: string;
  createdAt: number;
  lastRunAt?: number;
  lastRunStatus?: "success" | "failure" | "timeout";
  lastRunError?: string;
}

export interface CronRun {
  taskId: string;
  startedAt: number;
  endedAt: number;
  status: "success" | "failure" | "timeout";
  output: string;
  error?: string;
}

export interface CronTaskTemplate {
  key: string;
  description: string;
  defaultName: string;
  schedule: string;
  kind: CronTaskKind;
  payload: string;
  notifyChannels: CronNotifyChannel[];
  timeoutMs?: number;
}

export const listCronTasks = () =>
  api<{ tasks: CronTask[] }>("GET", "/v1/web/cron/tasks");

export const addCronTask = (input: {
  name: string;
  schedule: string;
  kind: CronTaskKind;
  payload: string;
  notifyChannels?: CronNotifyChannel[];
  timeoutMs?: number;
  enabled?: boolean;
}) => api<CronTask>("POST", "/v1/web/cron/tasks", input);

export const removeCronTask = (idOrName: string) =>
  api<{ ok: boolean; task?: CronTask }>("DELETE", `/v1/web/cron/tasks/${encodeURIComponent(idOrName)}`);

export const setCronTaskEnabled = (idOrName: string, enabled: boolean) =>
  api<{ ok: boolean; task?: CronTask }>(
    "POST",
    `/v1/web/cron/tasks/${encodeURIComponent(idOrName)}/enable`,
    { enabled }
  );

export const runCronNow = (idOrName: string) =>
  api<{ run: CronRun }>("POST", `/v1/web/cron/tasks/${encodeURIComponent(idOrName)}/run-now`);

export const listCronRuns = (idOrName: string, limit = 20) =>
  api<{ task: CronTask; runs: CronRun[] }>(
    "GET",
    `/v1/web/cron/tasks/${encodeURIComponent(idOrName)}/runs?limit=${limit}`
  );

export const listCronTemplates = () =>
  api<{ templates: CronTaskTemplate[] }>("GET", "/v1/web/cron/templates");

export const installCronTemplate = (
  key: string,
  body: { name?: string; notifyChannels?: CronNotifyChannel[] } = {}
) =>
  api<CronTask>(
    "POST",
    `/v1/web/cron/templates/${encodeURIComponent(key)}/install`,
    body
  );
