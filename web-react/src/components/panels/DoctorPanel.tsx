import { useEffect, useMemo, useState } from "react";
import { getDoctorStatus, getSessionDoctorStatus, type DoctorStatus } from "@/api/endpoints";

interface Props {
  sessionId?: string | null;
  onError(msg: string | null): void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export default function DoctorPanel({ sessionId, onError }: Props) {
  const [processStatus, setProcessStatus] = useState<DoctorStatus | null>(null);
  const [sessionStatus, setSessionStatus] = useState<DoctorStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => {
    if (!processStatus) return "未读取";
    const runtime = sessionStatus ? ` · runtime ${sessionStatus.sections.length} sections` : "";
    return `${processStatus.sections.length} process sections${runtime} · ${formatTime(processStatus.generatedAt)}`;
  }, [processStatus, sessionStatus]);

  async function refresh() {
    setBusy(true);
    try {
      const [processResult, sessionResult] = await Promise.all([
        getDoctorStatus(),
        sessionId ? getSessionDoctorStatus(sessionId) : Promise.resolve(null),
      ]);
      setProcessStatus(processResult);
      setSessionStatus(sessionResult);
      onError(null);
    } catch (err) {
      onError(`doctor 读取失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="p-4 space-y-3 overflow-y-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={refresh} disabled={busy} className="btn-secondary">
          刷新
        </button>
        <span className="text-xs text-muted">{summary}</span>
      </div>

      <div className="border border-border rounded p-3 text-sm bg-bg/60">
        <div className="font-semibold mb-1">Doctor · 环境诊断</div>
        <p className="text-xs text-muted leading-5">
          上方是 Web 进程级环境检查；如果左侧选中了 session，下方会展示该 session
          的运行态诊断。更完整的 skill / ToolPool 上下文请在 Chat 中使用 <code>/context</code>。
        </p>
      </div>

      {processStatus && (
        <div className="flex flex-wrap gap-1">
          {processStatus.sections.map((section) => (
            <span key={section} className="text-xs border border-border rounded px-1.5 py-0.5">
              {section}
            </span>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-xs uppercase text-muted">Process doctor</h3>
        <pre className="bg-bg border border-border rounded p-3 text-xs font-mono max-h-[45vh] overflow-auto whitespace-pre-wrap">
          {processStatus?.output ?? ""}
        </pre>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs uppercase text-muted">Session runtime doctor</h3>
        {sessionId ? (
          <>
            {sessionStatus?.diagnostics && (
              <div className="grid gap-2 md:grid-cols-3">
                <div className="border border-border rounded p-2 text-xs">
                  <div className="text-muted">Slash registry</div>
                  <div className="font-semibold">
                    {sessionStatus.diagnostics.slashRegistry.commands} commands ·{" "}
                    {sessionStatus.diagnostics.slashRegistry.conflicts.length} conflicts
                  </div>
                </div>
                <div className="border border-border rounded p-2 text-xs">
                  <div className="text-muted">Active skill</div>
                  <div className="font-semibold">
                    {sessionStatus.diagnostics.activeSkill?.name ?? "none"}
                  </div>
                </div>
                <div className="border border-border rounded p-2 text-xs">
                  <div className="text-muted">ToolPool</div>
                  <div className="font-semibold">
                    {sessionStatus.diagnostics.toolPool.visible}/{sessionStatus.diagnostics.toolPool.total} visible
                  </div>
                </div>
              </div>
            )}
            <pre className="bg-bg border border-border rounded p-3 text-xs font-mono max-h-[28vh] overflow-auto whitespace-pre-wrap">
              {sessionStatus?.output ?? ""}
            </pre>
          </>
        ) : (
          <div className="text-sm text-muted border border-border rounded p-3">
            当前没有选中的 session。
          </div>
        )}
      </section>
    </div>
  );
}
