import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { ApiError } from "~/lib/api-client";
import {
  createAdminInterviewSession,
  listAdminInterviewSessions,
  updateAdminInterviewSession,
  type InterviewSession,
  type UpsertInterviewSessionInput,
} from "~/lib/registrations-client";

export function meta() {
  return [{ title: "面试场次 | TARS-GO" }, { name: "description", content: "配置当前招新的面试日期、时段和地点" }];
}

const presets = [
  { label: "上午", startTime: "09:00", endTime: "11:30" },
  { label: "下午", startTime: "13:30", endTime: "17:00" },
  { label: "晚上", startTime: "18:30", endTime: "21:00" },
];

const emptyDraft: UpsertInterviewSessionInput = {
  date: "",
  label: "上午",
  startTime: "09:00",
  endTime: "11:30",
  location: "吉甲大师双创基地",
  enabled: true,
};

export default function InterviewSessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setSessions(await listAdminInterviewSessions());
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      setError(cause instanceof Error ? cause.message : "面试场次加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function resetDraft() {
    setDraft(emptyDraft);
    setEditingId(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editingId == null) await createAdminInterviewSession(draft);
      else await updateAdminInterviewSession(editingId, draft);
      setNotice(editingId == null ? "面试场次已创建。" : "面试场次已更新。");
      resetDraft();
      setSessions(await listAdminInterviewSessions());
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      setError(cause instanceof Error ? cause.message : "保存面试场次失败");
    } finally {
      setSaving(false);
    }
  }

  function edit(session: InterviewSession) {
    setEditingId(session.id);
    setDraft({
      date: session.date,
      label: session.label,
      startTime: session.startTime,
      endTime: session.endTime,
      location: session.location,
      enabled: session.enabled,
    });
  }

  async function toggle(session: InterviewSession) {
    setSaving(true);
    setError("");
    try {
      await updateAdminInterviewSession(session.id, { ...session, enabled: !session.enabled });
      setSessions(await listAdminInterviewSessions());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新面试场次失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-design admin-recruitment-settings space-y-6">
      <header className="admin-page-header">
        <div className="admin-eyebrow">吉甲 · 招新设置</div>
        <h1 className="admin-page-title">面试场次</h1>
        <p className="admin-page-description">配置候选人可选择的面试日期、时段和地点。</p>
      </header>

      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {notice ? <div role="status" className="admin-notice admin-notice--success">{notice}</div> : null}

      <section className="admin-panel p-4 sm:p-5" aria-label="面试场次编辑">
        <div className="admin-section-heading">
          <div>
            <h2>{editingId == null ? "添加场次" : "编辑场次"}</h2>
            <p>保存后会显示在候选人的面试确认选项中。</p>
          </div>
          {editingId != null ? <button type="button" onClick={resetDraft} className="admin-button admin-button--secondary admin-button--small">取消编辑</button> : null}
        </div>
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs text-[var(--admin-muted)]">日期<input aria-label="日期" type="date" required value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} className="admin-field mt-1" /></label>
          <label className="text-xs text-[var(--admin-muted)]">时段名称<input aria-label="时段名称" required value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} className="admin-field mt-1" /></label>
          <label className="text-xs text-[var(--admin-muted)]">开始时间<input aria-label="开始时间" type="time" required value={draft.startTime} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))} className="admin-field mt-1" /></label>
          <label className="text-xs text-[var(--admin-muted)]">结束时间<input aria-label="结束时间" type="time" required value={draft.endTime} onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))} className="admin-field mt-1" /></label>
          <label className="text-xs text-[var(--admin-muted)]">地点<input aria-label="地点" required value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} className="admin-field mt-1" /></label>
          <button disabled={saving} type="submit" className="admin-button admin-button--primary self-end">{saving ? "保存中…" : editingId == null ? "创建场次" : "保存修改"}</button>
          <div className="admin-operation-group sm:col-span-2 xl:col-span-6">
            {presets.map((preset) => <button key={preset.label} type="button" onClick={() => setDraft((current) => ({ ...current, ...preset }))} className="admin-button admin-button--secondary admin-button--small">{preset.label} {preset.startTime}–{preset.endTime}</button>)}
          </div>
        </form>
      </section>

      <section className="admin-panel p-4 sm:p-5" aria-label="已配置面试场次">
        <div className="admin-section-heading"><div><h2>已配置场次</h2><p>停用的场次不会出现在候选人选项中。</p></div><span className="admin-count admin-count--compact">{sessions.length}</span></div>
        {loading ? <div role="status" className="admin-table-empty">正在读取面试场次…</div> : sessions.length === 0 ? <div className="admin-table-empty">暂无面试场次。</div> : (
          <div className="admin-list">
            {sessions.map((session) => (
              <div key={session.id} className="admin-list-row flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--admin-text)]">{session.date} · {session.label} {session.startTime}–{session.endTime}</div>
                  <div className="mt-1 text-xs text-[var(--admin-muted)]">{session.location} · 已确认 {session.confirmedCount} 人 · {session.enabled ? "开放中" : "已停用"}</div>
                </div>
                <div className="admin-operation-group">
                  <button type="button" aria-label={`编辑 ${session.date} ${session.label}`} onClick={() => edit(session)} className="admin-button admin-button--secondary admin-button--small">编辑</button>
                  <button type="button" aria-label={`${session.enabled ? "停用" : "启用"} ${session.date} ${session.label}`} disabled={saving} onClick={() => void toggle(session)} className="admin-button admin-button--quiet admin-button--small">{session.enabled ? "停用" : "启用"}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
