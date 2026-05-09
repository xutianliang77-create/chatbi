/**
 * AuditPanel · audit.db 最近事件查询
 *
 * 只读展示，不提供删除/修改；重点把 ToolPool metadata 从 details 中露出来。
 */

import { useEffect, useMemo, useState } from "react";
import {
  listAuditEvents,
  type AuditDecision,
  type AuditEvent,
  type AuditVerification,
} from "@/api/endpoints";

interface Props {
  onError(msg: string | null): void;
}

const DECISIONS: Array<AuditDecision | ""> = ["", "pending", "approved", "rejected", "allow", "deny"];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toolPoolFromDetails(details: Record<string, unknown> | null): Record<string, unknown> | null {
  const direct = asRecord(details?.toolPool);
  if (direct) return direct;
  const nested = asRecord(asRecord(details?.metadata)?.toolPool);
  return nested;
}

export default function AuditPanel({ onError }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [decision, setDecision] = useState<AuditDecision | "">("");
  const [sessionId, setSessionId] = useState("");
  const [action, setAction] = useState("");
  const [limit, setLimit] = useState(100);
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const summary = useMemo(() => {
    const withToolPool = events.filter((event) => toolPoolFromDetails(event.details)).length;
    return `${events.length} 条事件${withToolPool ? ` · ${withToolPool} 条含 ToolPool metadata` : ""}`;
  }, [events]);

  async function refresh(verify = false) {
    setBusy(true);
    try {
      const result = await listAuditEvents({
        limit,
        sessionId: sessionId.trim() || undefined,
        action: action.trim() || undefined,
        decision,
        verify,
      });
      setEvents(result.events);
      setVerification(result.verification ?? null);
      setUnavailable(false);
      onError(null);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("503") || msg.includes("audit-unavailable")) {
        setUnavailable(true);
      } else {
        onError(`audit 读取失败：${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (unavailable) {
    return (
      <div className="p-6 text-sm">
        <div className="text-warning font-medium mb-2">Audit 不可用</div>
        <div className="text-muted">
          当前 Web 进程没有打开 audit.db。若需要审计查询，请使用普通
          <code className="text-fg"> codeclaw web </code>
          启动，并确认没有把 <code>auditDbPath</code> 显式设为 null。
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-[280px] border-r border-border p-3 space-y-3 overflow-y-auto">
        <div>
          <h2 className="text-sm font-bold">Audit</h2>
          <p className="text-xs text-muted">{summary}</p>
        </div>
        <label className="block text-xs">
          <span className="text-muted">decision</span>
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value as AuditDecision | "")}
            className="mt-1 w-full border border-border rounded bg-bg px-2 py-1"
          >
            {DECISIONS.map((item) => (
              <option key={item || "all"} value={item}>
                {item || "全部"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-muted">sessionId</span>
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="可选"
            className="mt-1 w-full border border-border rounded bg-bg px-2 py-1"
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted">action</span>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="例如 tool.write"
            className="mt-1 w-full border border-border rounded bg-bg px-2 py-1"
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted">limit</span>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="mt-1 w-full border border-border rounded bg-bg px-2 py-1"
          />
        </label>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => refresh()} className="btn-primary">
            刷新
          </button>
          <button disabled={busy} onClick={() => refresh(true)} className="btn-secondary">
            校验链
          </button>
        </div>
        {verification && (
          <div
            className={
              "text-xs border rounded p-2 " +
              (verification.ok ? "border-ok text-ok" : "border-danger text-danger")
            }
          >
            {verification.ok
              ? `链完整 · checked=${verification.checkedCount} · ${verification.durationMs}ms`
              : `链断裂 · ${verification.reason ?? verification.brokenAt}`}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {events.length === 0 && <div className="text-sm text-muted">没有匹配的审计事件。</div>}
        {events.map((event) => {
          const toolPool = toolPoolFromDetails(event.details);
          return (
            <article key={event.eventId} className="border border-border rounded p-3 text-sm bg-bg/60">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{event.action}</span>
                <span className="text-xs border border-border rounded px-1.5 py-0.5">{event.decision}</span>
                {event.mode && (
                  <span className="text-xs border border-border rounded px-1.5 py-0.5">mode={event.mode}</span>
                )}
                <span className="text-xs text-muted">{formatTime(event.timestamp)}</span>
              </div>
              <div className="mt-1 text-xs text-muted break-all">
                actor={event.actor} · session={event.sessionId ?? "none"} · trace={event.traceId}
              </div>
              {event.resource && <div className="mt-1 text-xs break-all">resource={event.resource}</div>}
              {event.reason && <div className="mt-1 text-xs">reason={event.reason}</div>}
              {toolPool && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {["source", "risk", "concurrency", "approval"].map((key) =>
                    toolPool[key] ? (
                      <span key={key} className="text-xs border border-border rounded px-1.5 py-0.5">
                        {key}={String(toolPool[key])}
                      </span>
                    ) : null
                  )}
                </div>
              )}
              {event.details && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted">details</summary>
                  <pre className="mt-2 text-xs bg-bg border border-border rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                    {JSON.stringify(event.details, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
