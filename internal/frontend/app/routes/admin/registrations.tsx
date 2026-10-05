import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { ApiError, buildApiUrl } from "~/lib/api-client";
import {
  createAdminInterviewSession,
  deleteAdminRegistration,
  getAdminRegistration,
  listAdminInterviewSessions,
  listAdminRegistrations,
  recordAdminRegistrationInterview,
  screenAdminRegistration,
  undoAdminRegistrationScreening,
  updateAdminInterviewSession,
  type InterviewAttendance,
  type InterviewSession,
  type ListRegistrationsInput,
  type RecruitmentStatus,
  type RegistrationDetail,
  type RegistrationListItem,
  type RegistrationPagination,
  type RegistrationSummary,
} from "~/lib/registrations-client";
import {
  getAdminRegistrationFormExportUrl,
  listAdminRegistrationForms,
  type RegistrationFormField,
  type RegistrationFormListItem,
} from "~/lib/registration-forms-client";
import { listAdminUserGroupOptions, type AdminUserGroupOption } from "~/lib/admin-user-groups-client";

export function meta() {
  return [
    { title: "报名列表 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 招新候选人管理" },
  ];
}

type Flash = { type: "success" | "error"; message: string } | null;

const defaultSummary: RegistrationSummary = {
  total: 0,
  pendingScreening: 0,
  pendingInterview: 0,
  admitted: 0,
  rejected: 0,
  withdrawn: 0,
};

const defaultPagination: RegistrationPagination = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
};

const attendanceOptions: Array<{ value: InterviewAttendance | ""; label: string }> = [
  { value: "", label: "全部参加状态" },
  { value: "pending", label: "待确认" },
  { value: "attending", label: "确认参加" },
  { value: "not_attending", label: "不参加" },
];

const sessionPresets = [
  { label: "上午", startTime: "09:00", endTime: "11:30" },
  { label: "下午", startTime: "13:30", endTime: "17:00" },
  { label: "晚上", startTime: "18:30", endTime: "21:00" },
];

const statusOptions: Array<{ value: RecruitmentStatus | ""; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "pending_screening", label: "待初筛" },
  { value: "pending_interview", label: "待面试" },
  { value: "admitted", label: "已录取" },
  { value: "rejected", label: "未通过" },
  { value: "withdrawn", label: "已撤回" },
];

export default function Registrations() {
  const navigate = useNavigate();
  const [forms, setForms] = useState<RegistrationFormListItem[]>([]);
  const [groups, setGroups] = useState<AdminUserGroupOption[]>([]);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionDraft, setSessionDraft] = useState({
    date: "",
    label: "上午",
    startTime: "09:00",
    endTime: "11:30",
    location: "吉甲大师双创基地",
    enabled: true,
  });
  const [query, setQuery] = useState<ListRegistrationsInput>({
    page: 1,
    pageSize: 10,
    keyword: "",
    status: "",
    formId: "",
    preferredGroupId: "",
    interviewAttendance: "",
    interviewDate: "",
    interviewSessionLabel: "",
  });
  const [draftKeyword, setDraftKeyword] = useState("");
  const [items, setItems] = useState<RegistrationListItem[]>([]);
  const [summary, setSummary] = useState(defaultSummary);
  const [pagination, setPagination] = useState(defaultPagination);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RegistrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [screeningRemark, setScreeningRemark] = useState("");
  const [interviewRemark, setInterviewRemark] = useState("");

  useEffect(() => {
    let cancelled = false;
    listAdminRegistrationForms()
      .then((result) => {
        if (!cancelled) setForms(result.items);
      })
      .catch((error) => {
        if (!cancelled) handleError(error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAdminUserGroupOptions(), listAdminInterviewSessions()])
      .then(([groupItems, sessionItems]) => {
        if (cancelled) return;
        setGroups(groupItems.filter((item) => item.status === 1));
        setSessions(sessionItems);
      })
      .catch((error) => {
        if (!cancelled) handleError(error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAdminRegistrations(query)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setSummary(result.summary);
        setPagination(result.pagination);
      })
      .catch((error) => {
        if (!cancelled) handleError(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getAdminRegistration(selectedId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setScreeningRemark(result.screeningRemark ?? "");
        setInterviewRemark(result.interviewRemark ?? "");
      })
      .catch((error) => {
        if (!cancelled) handleError(error);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedForm = useMemo(
    () => forms.find((form) => form.id === Number(query.formId)),
    [forms, query.formId],
  );

  function handleError(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      navigate("/login", { replace: true });
      return;
    }
    setFlash({
      type: "error",
      message: error instanceof Error ? error.message : "请求失败，请稍后重试。",
    });
  }

  async function refreshAfterAction(updated?: RegistrationDetail) {
    if (updated) {
      setDetail(updated);
      setScreeningRemark(updated.screeningRemark ?? "");
      setInterviewRemark(updated.interviewRemark ?? "");
    } else if (selectedId != null) {
      setDetail(await getAdminRegistration(selectedId));
    }
    const result = await listAdminRegistrations(query);
    setItems(result.items);
    setSummary(result.summary);
    setPagination(result.pagination);
  }

  async function runAction(
    action: () => Promise<RegistrationDetail>,
    successMessage: string,
  ) {
    try {
      setActionLoading(true);
      setFlash(null);
      const updated = await action();
      await refreshAfterAction(updated);
      setFlash({
        type: updated.notificationWarning ? "error" : "success",
        message: updated.notificationWarning
          ? `${successMessage}；${updated.notificationWarning}`
          : successMessage,
      });
    } catch (error) {
      handleError(error);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(item: RegistrationListItem) {
    if (!window.confirm(`确认删除 ${item.contactName || item.contactEmail || "该候选人"} 的报名记录？此操作仅用于管理员数据清理。`)) {
      return;
    }
    try {
      await deleteAdminRegistration(item.id);
      if (selectedId === item.id) setSelectedId(null);
      await refreshAfterAction();
      setFlash({ type: "success", message: "报名记录已删除。" });
    } catch (error) {
      handleError(error);
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery((current) => ({ ...current, page: 1, keyword: draftKeyword.trim() }));
  }

  function applySessionPreset(label: string, startTime: string, endTime: string) {
    setSessionDraft((current) => ({ ...current, label, startTime, endTime }));
  }

  function editSession(session: InterviewSession) {
    setEditingSessionId(session.id);
    setSessionDraft({
      date: session.date,
      label: session.label,
      startTime: session.startTime,
      endTime: session.endTime,
      location: session.location,
      enabled: session.enabled,
    });
  }

  function resetSessionDraft() {
    setEditingSessionId(null);
    setSessionDraft({
      date: "",
      label: "上午",
      startTime: "09:00",
      endTime: "11:30",
      location: "吉甲大师双创基地",
      enabled: true,
    });
  }

  async function saveSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSessionSaving(true);
      if (editingSessionId == null) {
        await createAdminInterviewSession(sessionDraft);
      } else {
        await updateAdminInterviewSession(editingSessionId, sessionDraft);
      }
      setSessions(await listAdminInterviewSessions());
      resetSessionDraft();
      setFlash({ type: "success", message: editingSessionId == null ? "面试场次已创建。" : "面试场次已更新。" });
    } catch (error) {
      handleError(error);
    } finally {
      setSessionSaving(false);
    }
  }

  async function toggleSession(session: InterviewSession) {
    try {
      setSessionSaving(true);
      await updateAdminInterviewSession(session.id, {
        date: session.date,
        label: session.label,
        startTime: session.startTime,
        endTime: session.endTime,
        location: session.location,
        enabled: !session.enabled,
      });
      setSessions(await listAdminInterviewSessions());
    } catch (error) {
      handleError(error);
    } finally {
      setSessionSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="motion-fade-up">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary-300">
          Recruitment
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg-primary">
          招新候选人
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          单意向组流程：待初筛 → 待面试 → 已录取 / 未通过。
        </p>
      </header>

      {flash ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            flash.type === "success"
              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/20 bg-rose-500/10 text-rose-200"
          }`}
        >
          {flash.message}
        </div>
      ) : null}

      <section className="glass-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium text-fg-primary">面试场次</h2>
            <p className="mt-1 text-sm text-fg-dim">配置候选人可选的日期、时段和地点。</p>
          </div>
          {editingSessionId != null ? (
            <button type="button" onClick={resetSessionDraft} className="btn-glass rounded-lg px-3 py-2 text-xs">
              取消编辑
            </button>
          ) : null}
        </div>

        <form onSubmit={saveSession} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            type="date"
            required
            value={sessionDraft.date}
            onChange={(event) => setSessionDraft((current) => ({ ...current, date: event.target.value }))}
            className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
          />
          <input
            required
            value={sessionDraft.label}
            onChange={(event) => setSessionDraft((current) => ({ ...current, label: event.target.value }))}
            placeholder="时段名称"
            className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
          />
          <input
            type="time"
            required
            value={sessionDraft.startTime}
            onChange={(event) => setSessionDraft((current) => ({ ...current, startTime: event.target.value }))}
            className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
          />
          <input
            type="time"
            required
            value={sessionDraft.endTime}
            onChange={(event) => setSessionDraft((current) => ({ ...current, endTime: event.target.value }))}
            className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
          />
          <input
            required
            value={sessionDraft.location}
            onChange={(event) => setSessionDraft((current) => ({ ...current, location: event.target.value }))}
            placeholder="地点"
            className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
          />
          <button disabled={sessionSaving} type="submit" className="btn-gradient rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50">
            {editingSessionId == null ? "创建场次" : "保存修改"}
          </button>
          <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-6">
            {sessionPresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applySessionPreset(preset.label, preset.startTime, preset.endTime)}
                className="btn-glass rounded-lg px-3 py-2 text-xs"
              >
                {preset.label} {preset.startTime}–{preset.endTime}
              </button>
            ))}
          </div>
        </form>

        <div className="mt-4 divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
          {sessions.length === 0 ? (
            <div className="px-4 py-5 text-sm text-fg-dim">暂无面试场次。</div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-fg-primary">
                    {session.date} · {session.label} {session.startTime}–{session.endTime}
                  </div>
                  <div className="mt-1 text-xs text-fg-dim">
                    {session.location} · 已确认 {session.confirmedCount} 人 · {session.enabled ? "开放中" : "已停用"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`编辑 ${session.date} ${session.label}`}
                    onClick={() => editSession(session)}
                    className="btn-glass rounded-lg px-3 py-2 text-xs"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    aria-label={`${session.enabled ? "停用" : "启用"} ${session.date} ${session.label}`}
                    disabled={sessionSaving}
                    onClick={() => void toggleSession(session)}
                    className="btn-glass rounded-lg px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {session.enabled ? "停用" : "启用"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="全部" value={summary.total} />
        <SummaryCard label="待初筛" value={summary.pendingScreening} />
        <SummaryCard label="待面试" value={summary.pendingInterview} />
        <SummaryCard label="已录取" value={summary.admitted} />
        <SummaryCard label="未通过" value={summary.rejected} />
        <SummaryCard label="已撤回" value={summary.withdrawn} />
      </section>

      <form
        onSubmit={submitSearch}
        className="glass-panel grid gap-3 rounded-2xl p-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <input
          value={draftKeyword}
          onChange={(event) => setDraftKeyword(event.target.value)}
          placeholder="搜索姓名 / 手机号 / 邮箱"
          className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-2.5 text-sm text-fg-primary outline-none placeholder:text-fg-dim focus:border-primary-400/40"
        />
        <select
          value={query.status ?? ""}
          onChange={(event) =>
            setQuery((current) => ({
              ...current,
              page: 1,
              status: event.target.value as RecruitmentStatus | "",
            }))
          }
          className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
        >
          {statusOptions.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={query.formId ?? ""}
          onChange={(event) =>
            setQuery((current) => ({
              ...current,
              page: 1,
              formId: event.target.value ? Number(event.target.value) : "",
            }))
          }
          className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
        >
          <option value="">全部报名表</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.title}
            </option>
          ))}
        </select>
        <select
          value={query.preferredGroupId ?? ""}
          onChange={(event) =>
            setQuery((current) => ({
              ...current,
              page: 1,
              preferredGroupId: event.target.value ? Number(event.target.value) : "",
            }))
          }
          className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
        >
          <option value="">全部意向组</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
        <select
          value={query.interviewAttendance ?? ""}
          onChange={(event) =>
            setQuery((current) => ({
              ...current,
              page: 1,
              interviewAttendance: event.target.value as InterviewAttendance | "",
            }))
          }
          className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
        >
          {attendanceOptions.map((option) => (
            <option key={option.value || "all"} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={query.interviewDate ?? ""}
          onChange={(event) => setQuery((current) => ({ ...current, page: 1, interviewDate: event.target.value }))}
          className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
          aria-label="面试日期"
        />
        <select
          value={query.interviewSessionLabel ?? ""}
          onChange={(event) => setQuery((current) => ({ ...current, page: 1, interviewSessionLabel: event.target.value }))}
          className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-fg-primary"
        >
          <option value="">全部面试时段</option>
          {Array.from(new Set(sessions.map((session) => session.label))).map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </select>
        <button type="submit" className="btn-gradient rounded-xl px-4 py-2.5 text-sm font-medium">
          搜索
        </button>
        <a
          href={selectedForm ? getAdminRegistrationFormExportUrl(selectedForm.id) : undefined}
          onClick={(event) => {
            if (!selectedForm) event.preventDefault();
          }}
          className={`btn-glass rounded-xl px-4 py-2.5 text-center text-sm ${
            selectedForm ? "" : "pointer-events-none opacity-40"
          }`}
        >
          导出当前报名表
        </a>
      </form>

      <section className="glass-panel overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/[0.06] bg-white/[0.03] text-xs text-fg-dim">
              <tr>
                <th className="px-5 py-4 font-medium">候选人</th>
                <th className="px-5 py-4 font-medium">意向组</th>
                <th className="px-5 py-4 font-medium">当前状态</th>
                <th className="px-5 py-4 font-medium">提交时间</th>
                <th className="px-5 py-4 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-fg-dim">
                    正在加载候选人...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-fg-dim">
                    当前筛选条件下没有报名记录。
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-white/[0.025]">
                    <td className="px-5 py-4">
                      <div className="font-medium text-fg-primary">
                        {item.contactName || "未填写姓名"}
                      </div>
                      <div className="mt-1 text-xs text-fg-dim">
                        {item.contactPhone || item.contactEmail || "—"}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-fg-muted">
                      {item.preferredGroup?.name ?? "未设置"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} rejectedStage={item.rejectedStage} />
                      {item.status === "pending_interview" ? (
                        <div className="mt-1.5 text-xs text-fg-dim">{formatInterviewAttendance(item.interviewAttendance, item.interviewSession)}</div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-fg-muted">{formatDateTime(item.submittedAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className="btn-glass rounded-lg px-3 py-2 text-xs"
                        >
                          查看
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4 text-sm">
          <span className="text-fg-dim">
            共 {pagination.total} 条 · 第 {pagination.page}/{Math.max(pagination.totalPages, 1)} 页
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setQuery((current) => ({ ...current, page: Math.max(1, pagination.page - 1) }))}
              className="btn-glass rounded-lg px-3 py-2 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setQuery((current) => ({ ...current, page: pagination.page + 1 }))}
              className="btn-glass rounded-lg px-3 py-2 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      {selectedId != null ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedId(null)}
        >
          <aside
            className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/[0.08] bg-[#0b1019] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-primary-300">Candidate</div>
                <h2 className="mt-2 text-xl font-semibold text-fg-primary">候选人详情</h2>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="btn-glass rounded-lg px-3 py-2 text-sm">
                关闭
              </button>
            </div>

            {detailLoading || !detail ? (
              <div className="py-16 text-center text-sm text-fg-dim">正在加载详情...</div>
            ) : (
              <div className="mt-6 space-y-5">
                {detail.notificationWarning ? (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    {detail.notificationWarning}
                  </div>
                ) : null}

                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-fg-primary">
                        {detail.contactName || "未填写姓名"}
                      </div>
                      <div className="mt-1 text-sm text-fg-muted">
                        {[detail.contactPhone, detail.contactEmail].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <StatusBadge status={detail.status} rejectedStage={detail.rejectedStage} />
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <InfoItem label="意向组" value={detail.preferredGroup?.name ?? "未设置"} />
                    <InfoItem label="报名表" value={detail.formTitle} />
                    <InfoItem label="提交时间" value={formatDateTime(detail.submittedAt)} />
                    <InfoItem label="最近更新" value={formatDateTime(detail.updatedAt)} />
                  </dl>
                </section>

                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5">
                  <h3 className="font-medium text-fg-primary">初筛</h3>
                  {detail.screenedAt ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <InfoItem label="初筛人" value={detail.screener?.name || detail.screener?.email || "—"} />
                      <InfoItem label="初筛时间" value={formatDateTime(detail.screenedAt)} />
                      <div className="sm:col-span-2">
                        <InfoItem label="初筛备注" value={detail.screeningRemark || "无"} />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-fg-dim">尚未完成初筛。</p>
                  )}

                  {detail.canScreen ? (
                    <div className="mt-4 space-y-3">
                      <textarea
                        value={screeningRemark}
                        onChange={(event) => setScreeningRemark(event.target.value)}
                        placeholder="初筛备注（可选）"
                        className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-fg-primary outline-none"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void runAction(
                              () => screenAdminRegistration(detail.id, { decision: "approve", remark: screeningRemark }),
                              "初筛已通过，候选人进入待面试。",
                            )
                          }
                          className="rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/20"
                        >
                          初筛通过
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void runAction(
                              () => screenAdminRegistration(detail.id, { decision: "reject", remark: screeningRemark }),
                              "初筛未通过，招新流程已结束。",
                            )
                          }
                          className="rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm font-medium text-rose-200 ring-1 ring-rose-400/20"
                        >
                          初筛未通过
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {detail.canUndoScreening ? (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() =>
                        void runAction(
                          () => undoAdminRegistrationScreening(detail.id),
                          "已撤销初筛，候选人恢复为待初筛。",
                        )
                      }
                      className="btn-glass mt-4 rounded-xl px-4 py-2.5 text-sm"
                    >
                      撤销初筛
                    </button>
                  ) : null}
                </section>

                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5">
                  <h3 className="font-medium text-fg-primary">线下面试</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <InfoItem label="面试参加" value={formatInterviewAttendanceLabel(detail.interviewAttendance)} />
                    <InfoItem label="预约日期" value={detail.interviewSession?.date ?? "—"} />
                    <InfoItem label="预约时段" value={detail.interviewSession ? `${detail.interviewSession.label} ${detail.interviewSession.startTime}–${detail.interviewSession.endTime}` : "—"} />
                    <InfoItem label="地点" value={detail.interviewSession?.location ?? "—"} />
                  </div>
                  {detail.interviewedAt ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <InfoItem label="面试人" value={detail.interviewer?.name || detail.interviewer?.email || "—"} />
                      <InfoItem label="面试时间" value={formatDateTime(detail.interviewedAt)} />
                      <div className="sm:col-span-2">
                        <InfoItem label="面试备注" value={detail.interviewRemark || "无"} />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-fg-dim">
                      {detail.status === "pending_interview" ? "等待录入线下面试结果。" : "当前没有面试结果。"}
                    </p>
                  )}

                  {detail.canInterview ? (
                    <div className="mt-4 space-y-3">
                      <textarea
                        value={interviewRemark}
                        onChange={(event) => setInterviewRemark(event.target.value)}
                        placeholder="面试备注（可选）"
                        className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-fg-primary outline-none"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void runAction(
                              () => recordAdminRegistrationInterview(detail.id, { decision: "admit", remark: interviewRemark }),
                              "面试通过，已录取到意向组。",
                            )
                          }
                          className="rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/20"
                        >
                          面试通过并录取
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void runAction(
                              () => recordAdminRegistrationInterview(detail.id, { decision: "reject", remark: interviewRemark }),
                              "面试未通过，招新流程已结束。",
                            )
                          }
                          className="rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm font-medium text-rose-200 ring-1 ring-rose-400/20"
                        >
                          面试未通过
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5">
                  <h3 className="font-medium text-fg-primary">报名资料</h3>
                  <div className="mt-4 grid gap-4">
                    {detail.fieldsSchema.map((field) => (
                      <div key={field.key} className="border-b border-white/[0.05] pb-4 last:border-b-0 last:pb-0">
                        <div className="text-xs text-fg-dim">{field.label}</div>
                        <div className="mt-1 text-sm leading-6 text-fg-primary">
                          <FieldValue
                            registrationId={detail.id}
                            field={field}
                            value={
                              field.key === "preferred_group"
                                ? detail.preferredGroup?.name
                                : detail.formData[field.key]
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-4">
      <div className="text-xs text-fg-dim">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-fg-primary">{value}</div>
    </div>
  );
}

function StatusBadge({
  status,
  rejectedStage,
}: {
  status: RecruitmentStatus;
  rejectedStage?: string | null;
}) {
  const meta: Record<RecruitmentStatus, { label: string; className: string }> = {
    pending_screening: {
      label: "待初筛",
      className: "border-amber-400/20 bg-amber-500/10 text-amber-200",
    },
    pending_interview: {
      label: "待面试",
      className: "border-sky-400/20 bg-sky-500/10 text-sky-200",
    },
    admitted: {
      label: "已录取",
      className: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    },
    rejected: {
      label: rejectedStage === "screening" ? "初筛未通过" : rejectedStage === "interview" ? "面试未通过" : "未通过",
      className: "border-rose-400/20 bg-rose-500/10 text-rose-200",
    },
    withdrawn: {
      label: "已撤回",
      className: "border-slate-400/20 bg-slate-500/10 text-slate-300",
    },
  };
  const item = meta[status];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${item.className}`}>
      {item.label}
    </span>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-dim">{label}</dt>
      <dd className="mt-1 text-sm text-fg-primary">{value || "—"}</dd>
    </div>
  );
}

function FieldValue({
  registrationId,
  field,
  value,
}: {
  registrationId: number;
  field: RegistrationFormField;
  value: unknown;
}) {
  if (field.type === "file" || field.type === "image") {
    const files = normalizeFiles(value);
    if (files.length === 0) return <>—</>;
    return (
      <div className="flex flex-wrap gap-2">
        {files.map((file, index) => (
          <a
            key={`${field.key}-${index}`}
            href={buildApiUrl(
              `/api/admin/registrations/${registrationId}/files/${encodeURIComponent(field.key)}/${index}`,
            )}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-primary-200 hover:bg-white/[0.07]"
          >
            {file || `文件 ${index + 1}`}
          </a>
        ))}
      </div>
    );
  }

  if (Array.isArray(value)) {
    return <>{value.map(String).join("、") || "—"}</>;
  }
  if (typeof value === "boolean") return <>{value ? "是" : "否"}</>;
  if (value == null || String(value).trim() === "") return <>—</>;
  return <>{String(value)}</>;
}

function normalizeFiles(value: unknown): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => {
    if (item && typeof item === "object") {
      const data = item as Record<string, unknown>;
      return String(data.file_name ?? data.name ?? "");
    }
    return String(item);
  });
}

function formatInterviewAttendanceLabel(attendance: InterviewAttendance) {
  if (attendance === "attending") return "确认参加";
  if (attendance === "not_attending") return "不参加";
  return "待确认";
}

function formatInterviewAttendance(attendance: InterviewAttendance, session?: InterviewSession | null) {
  if (attendance === "not_attending") return "不参加";
  if (attendance !== "attending" || !session) return "待确认";
  const monthDay = session.date.slice(5).replace("-", "/");
  return `已确认 · ${monthDay} ${session.label}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
