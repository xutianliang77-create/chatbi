import { useEffect, useState } from "react";
import {
  listNotifications,
  type NotificationEventType,
  type NotificationHistoryEntry,
} from "@/api/endpoints";

interface Props {
  sessionId?: string | null;
  onError(msg: string | null): void;
}

const TYPES: Array<NotificationEventType | ""> = [
  "",
  "task_completed",
  "approval_required",
  "context_budget_exceeded",
  "provider_cooldown",
  "report_ready",
  "cron_failed",
];

function formatTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : iso;
}

function badgeClass(entry: NotificationHistoryEntry): string {
  if (entry.delivered) return "border-ok text-ok";
  if (entry.severity === "error") return "border-danger text-danger";
  if (entry.severity === "warning") return "border-warning text-warning";
  return "border-border text-muted";
}

export default function NotificationsPanel({ sessionId, onError }: Props) {
  const [entries, setEntries] = useState<NotificationHistoryEntry[]>([]);
  const [type, setType] = useState<NotificationEventType | "">("");
  const [currentOnly, setCurrentOnly] = useState(false);
  const [limit, setLimit] = useState(50);
  const [busy, setBusy] = useState(false);

  const deliveredCount = entries.filter((entry) => entry.delivered).length;
  const suppressedCount = entries.filter((entry) => entry.suppressed).length;
  const summary = `${entries.length} 条 · delivered=${deliveredCount} · suppressed=${suppressedCount}`;

  async function refresh() {
    setBusy(true);
    try {
      const result = await listNotifications({
        limit,
        type,
        sessionId: currentOnly && sessionId ? sessionId : undefined,
      });
      setEntries(result.entries);
      onError(null);
    } catch (err) {
      onError(`notifications 读取失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full">
      <div className="w-[280px] border-r border-border p-3 space-y-3 overflow-y-auto">
        <div>
          <h2 className="text-sm font-bold">Notifications</h2>
          <p className="text-xs text-muted">{summary}</p>
        </div>
        <label className="block text-xs">
          <span className="text-muted">type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as NotificationEventType | "")}
            className="mt-1 w-full border border-border rounded bg-bg px-2 py-1"
          >
            {TYPES.map((item) => (
              <option key={item || "all"} value={item}>
                {item || "全部"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={currentOnly}
            disabled={!sessionId}
            onChange={(e) => setCurrentOnly(e.target.checked)}
          />
          <span>仅当前 session</span>
        </label>
        <label className="block text-xs">
          <span className="text-muted">limit</span>
          <input
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="mt-1 w-full border border-border rounded bg-bg px-2 py-1"
          />
        </label>
        <button disabled={busy} onClick={refresh} className="btn-primary">
          刷新
        </button>
        <p className="text-xs text-muted leading-5">
          History 会记录 delivered 与 suppressed 事件；quiet hours、disabled、adapter_none
          等原因会保留，方便移动端和 Web 后续补偿展示。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {entries.length === 0 && <div className="text-sm text-muted">没有通知记录。</div>}
        {entries.map((entry) => (
          <article key={entry.id} className="border border-border rounded p-3 text-sm bg-bg/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{entry.title}</span>
              <span className={`text-xs border rounded px-1.5 py-0.5 ${badgeClass(entry)}`}>
                {entry.delivered ? "delivered" : "suppressed"}
              </span>
              <span className="text-xs border border-border rounded px-1.5 py-0.5">{entry.type}</span>
              <span className="text-xs text-muted">{formatTime(entry.createdAt)}</span>
            </div>
            <div className="mt-1 text-sm">{entry.message}</div>
            <div className="mt-1 text-xs text-muted break-all">
              severity={entry.severity} · adapter={entry.adapter}
              {entry.reason ? ` · reason=${entry.reason}` : ""}
              {entry.sessionId ? ` · session=${entry.sessionId}` : ""}
              {entry.resourceId ? ` · resource=${entry.resourceId}` : ""}
            </div>
            {entry.metadata && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted">metadata</summary>
                <pre className="mt-2 text-xs bg-bg border border-border rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              </details>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
