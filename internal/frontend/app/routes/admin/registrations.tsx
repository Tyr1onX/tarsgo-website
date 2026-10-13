import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ApiError, buildApiUrl } from "~/lib/api-client";
import {
  getAdminRegistration,
  getAdminInterviewNotificationPreview,
  refreshAdminInterviewNotificationQRCode,
  listAdminInterviewSessions,
  listAdminRegistrations,
  sendAdminInterviewResultNotification,
  correctAdminRegistrationInterview,
  recordAdminRegistrationInterview,
  screenAdminRegistration,
  undoAdminRegistrationScreening,
  type InterviewAttendance,
  type InterviewSession,
  type InterviewNotificationPreview,
  type ListRegistrationsInput,
  type RecruitmentStatus,
  type RegistrationDetail,
  type RegistrationListItem,
  type RegistrationPagination,
  type RegistrationSummary,
} from "~/lib/registrations-client";
import { listAdminArchivedForms, type RegistrationFormField, type RegistrationFormListItem } from "~/lib/registration-forms-client";
import { listAdminUserGroupOptions, type AdminUserGroupOption } from "~/lib/admin-user-groups-client";
import { getShanghaiDate } from "~/lib/admin-workbench";

export function meta() {
  return [
    { title: "报名处理 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 招新候选人处理" },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const interviewWorkbench = searchParams.get("view") === "interviews";
  const initialInterviewQueue = searchParams.get("queue") === "processed" ? "processed" : "pending";
  const initialStatus = statusOptions.some((option) => option.value !== "" && option.value === searchParams.get("status"))
    ? searchParams.get("status") as RecruitmentStatus
    : "";
  const initialFormId = Number(searchParams.get("formId"));
  const [archivedForms, setArchivedForms] = useState<RegistrationFormListItem[]>([]);
  const [archivedView, setArchivedView] = useState(false);
  const [groups, setGroups] = useState<AdminUserGroupOption[]>([]);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [query, setQuery] = useState<ListRegistrationsInput>({
    page: 1,
    pageSize: interviewWorkbench ? 50 : 10,
    keyword: "",
    status: interviewWorkbench
      ? initialInterviewQueue === "processed" ? "" : "pending_interview"
      : initialStatus,
    preferredGroupId: "",
    interviewAttendance: interviewWorkbench ? "attending" : "",
    interviewDate: interviewWorkbench ? getShanghaiDate() : "",
    interviewSessionLabel: "",
    interviewResult: interviewWorkbench && initialInterviewQueue === "processed" ? "processed" : "",
    formId: Number.isSafeInteger(initialFormId) && initialFormId > 0 ? initialFormId : "",
  });
  const [draftKeyword, setDraftKeyword] = useState("");
  const [items, setItems] = useState<RegistrationListItem[]>([]);
  const [pendingQueueCount, setPendingQueueCount] = useState<number | null>(null);
  const [summary, setSummary] = useState(defaultSummary);
  const [currentFormAvailable, setCurrentFormAvailable] = useState<boolean | null>(null);
  const [pagination, setPagination] = useState(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RegistrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [quickActionId, setQuickActionId] = useState<number | null>(null);
  const [screeningRemark, setScreeningRemark] = useState("");
  const [interviewRemark, setInterviewRemark] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [notificationPreview, setNotificationPreview] = useState<InterviewNotificationPreview | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [confirmUncertainNotification, setConfirmUncertainNotification] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAdminUserGroupOptions(), listAdminInterviewSessions(), listAdminArchivedForms()])
      .then(([groupItems, sessionItems, archived]) => {
        if (cancelled) return;
        setGroups(groupItems.filter((item) => item.status === 1));
        setSessions(sessionItems);
        setArchivedForms(archived);
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
    setListError(false);
    listAdminRegistrations(query)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setSummary(result.summary);
        setPagination(result.pagination);
        if (interviewWorkbench && query.status === "pending_interview" && query.interviewResult !== "processed") {
          setPendingQueueCount(result.pagination.total);
        }
        setCurrentFormAvailable(result.currentFormAvailable);
        setArchivedView(result.archivedView);
      })
      .catch((error) => {
        if (!cancelled) {
          setListError(true);
          handleError(error);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, refreshToken]);

  useEffect(() => {
    if (!interviewWorkbench) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") setRefreshToken((current) => current + 1);
    };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [interviewWorkbench]);

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
        setCorrectionReason("");
        setNotificationPreview(null);
        setConfirmUncertainNotification(false);
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
      setCorrectionReason("");
      setNotificationPreview(null);
    } else if (selectedId != null) {
      setDetail(await getAdminRegistration(selectedId));
    }
    setRefreshToken((current) => current + 1);
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

  async function runQuickInterviewDecision(registrationId: number, decision: "admit" | "reject") {
    setQuickActionId(registrationId);
    setFlash(null);
    try {
      const updated = await recordAdminRegistrationInterview(registrationId, { decision });
      setItems((current) => current.filter((item) => item.id !== registrationId));
      setPagination((current) => {
        const total = Math.max(0, current.total - 1);
        return { ...current, total, totalPages: Math.ceil(total / current.pageSize) };
      });
      setPendingQueueCount((current) => current == null ? 0 : Math.max(0, current - 1));
      setSummary((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
        pendingInterview: Math.max(0, current.pendingInterview - 1),
        admitted: updated.status === "admitted" ? current.admitted + 1 : current.admitted,
        rejected: updated.status === "rejected" ? current.rejected + 1 : current.rejected,
      }));
      setFlash({
        type: "success",
        message: `${updated.contactName || "候选人"}的面试结果已保存为${updated.status === "admitted" ? "通过" : "拒绝"}，已从待处理名单移除。`,
      });

      setRefreshToken((current) => current + 1);
    } catch (error) {
      handleError(error);
    } finally {
      setQuickActionId(null);
    }
  }

  async function loadInterviewNotificationPreview(registrationId: number) {
    try {
      setNotificationLoading(true);
      setConfirmUncertainNotification(false);
      setNotificationPreview(await getAdminInterviewNotificationPreview(registrationId));
    } catch (error) {
      handleError(error);
    } finally {
      setNotificationLoading(false);
    }
  }

  async function runInterviewNotificationSend(registrationId: number) {
    try {
      setActionLoading(true);
      setFlash(null);
      const result = await sendAdminInterviewResultNotification(registrationId, confirmUncertainNotification);
      const [updated, preview] = await Promise.all([
        getAdminRegistration(registrationId),
        getAdminInterviewNotificationPreview(registrationId),
      ]);
      setDetail(updated);
      setNotificationPreview(preview);
      setConfirmUncertainNotification(false);
      setFlash({ type: result.status === "failed" ? "error" : "success", message: result.message });
    } catch (error) {
      handleError(error);
    } finally {
      setActionLoading(false);
    }
  }

  async function runRefreshInterviewNotificationQRCode(registrationId: number) {
    try {
      setActionLoading(true);
      setFlash(null);
      setNotificationPreview(await refreshAdminInterviewNotificationQRCode(registrationId));
      setFlash({ type: "success", message: "待发送通知已更新为该组当前二维码，请重新核对预览。" });
    } catch (error) {
      handleError(error);
    } finally {
      setActionLoading(false);
    }
  }

  function notificationStatusLabel(status: string) {
    switch (status) {
      case "pending": return "待发送";
      case "sending": return "发送中";
      case "provider_accepted": return "服务商已接受（不代表已送达）";
      case "failed": return "发送失败，可核对后重试";
      case "needs_review": return "状态待核对";
      case "legacy_unknown": return "历史发送状态未知";
      default: return status || "未建立通知记录";
    }
  }

  function selectRound(value: string) {
    const numericId = Number(value);
    const formId = value && Number.isSafeInteger(numericId) && archivedForms.some((form) => form.id === numericId)
      ? numericId
      : "";
    setSelectedId(null);
    setDetail(null);
    setCurrentFormAvailable(null);
    setArchivedView(false);
    setLoading(true);
    setQuery((current) => ({ ...current, formId, page: 1 }));
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("view");
      next.delete("queue");
      if (formId) next.set("formId", String(formId));
      else next.delete("formId");
      return next;
    }, { replace: true });
  }

  const isRoundVisible = currentFormAvailable !== null && (currentFormAvailable || archivedView);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery((current) => ({ ...current, page: 1, keyword: draftKeyword.trim() }));
  }

  function selectPipelineStatus(status: RecruitmentStatus | "") {
    setQuery((current) => ({ ...current, page: 1, status, interviewResult: "" }));
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("view");
      next.delete("queue");
      if (status) next.set("status", status);
      else next.delete("status");
      return next;
    }, { replace: true });
  }

  function selectInterviewQueue(queue: "pending" | "processed") {
    setQuery((current) => ({
      ...current,
      page: 1,
      status: queue === "pending" ? "pending_interview" : "",
      interviewResult: queue === "processed" ? "processed" : "",
      interviewAttendance: current.interviewAttendance || "attending",
      interviewDate: current.interviewDate || getShanghaiDate(),
    }));
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("view", "interviews");
      if (queue === "processed") next.set("queue", "processed");
      else next.delete("queue");
      return next;
    }, { replace: true });
  }

  function showFullRegistrationManagement() {
    setQuery((current) => ({
      ...current,
      page: 1,
      status: "",
      interviewAttendance: "",
      interviewDate: "",
      interviewSessionLabel: "",
      interviewResult: "",
    }));
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("view");
      next.delete("queue");
      next.delete("status");
      return next;
    }, { replace: true });
  }

  return (
    <div className="admin-design admin-registrations space-y-6">
      <header className="admin-page-header">
        <div className="admin-eyebrow">
          吉甲 · 招新处理
        </div>
        <h1 className="admin-page-title">
          {interviewWorkbench ? "今日面试工作台" : "招新候选人"}
        </h1>
        <p className="admin-page-description">
          {interviewWorkbench
            ? "优先处理今天已预约并确认参加的候选人；查看报名资料后可直接登记最终结果。"
            : "单意向组流程：待初筛 → 待面试 → 已录取 / 未通过。"}
        </p>
        {interviewWorkbench ? (
          <button type="button" onClick={showFullRegistrationManagement} className="admin-button admin-button--secondary mt-4">完整报名管理</button>
        ) : null}
      </header>

      {flash ? (
        <div
          className={`admin-notice ${flash.type === "success" ? "admin-notice--success" : "admin-notice--error"}`}
        >
          {flash.message}
        </div>
      ) : null}

      {interviewWorkbench ? (
        <nav aria-label="面试处理视图" className="admin-panel flex flex-wrap gap-2 p-3">
          <button
            type="button"
            aria-pressed={query.interviewResult !== "processed"}
            onClick={() => selectInterviewQueue("pending")}
            className="admin-button admin-button--secondary"
          >
            今日待处理{query.interviewResult !== "processed" ? <span className="admin-count ml-1">{pendingQueueCount ?? "…"}</span> : null}
          </button>
          <button
            type="button"
            aria-pressed={query.interviewResult === "processed"}
            onClick={() => selectInterviewQueue("processed")}
            className="admin-button admin-button--secondary"
          >
            已处理{query.interviewResult === "processed" ? <span className="admin-count ml-1">{pagination.total}</span> : null}
          </button>
        </nav>
      ) : null}

      <section className="admin-panel px-5 py-4 sm:px-6" aria-label="招新届次选择">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-fg-primary">查看招新届次</h2>
            <p className="mt-1 text-xs text-fg-dim">
              当前工作台只显示已发布的届次；结束后由超级管理员关闭并移入历史。历史记录只读。
            </p>
          </div>
          <select
            className="admin-field w-full sm:w-auto sm:min-w-64 sm:max-w-lg"
            aria-label="切换当前招新或历史届次"
            value={query.formId ?? ""}
            onChange={(event) => selectRound(event.target.value)}
          >
            <option value="">当前招新</option>
            {archivedForms.map((form) => (
              <option key={form.id} value={form.id}>{form.title} · 已关闭</option>
            ))}
          </select>
        </div>
        {archivedView ? (
          <p className="mt-3 text-sm text-fg-muted" role="status">正在查看历史届次，报名结果仅供查阅，不能继续初筛或修改面试结果。</p>
        ) : null}
      </section>

      {currentFormAvailable === null && loading ? (
        <div className="admin-panel flex min-h-32 items-center px-6" role="status" aria-label="正在加载招新届次">
          <div className="h-4 w-48 animate-pulse rounded bg-white/[0.08]" aria-hidden="true" />
        </div>
      ) : listError && currentFormAvailable === null ? (
        <div className="admin-panel px-5 py-8 text-center text-fg-muted" role="alert">招新数据加载失败，请重试页面。</div>
      ) : currentFormAvailable === false && !query.formId ? (
        <div className="admin-panel px-5 py-8 text-center text-fg-muted" role="status">
          当前暂无进行中的招新。可从上方切换历史届次查看往期报名。
        </div>
      ) : null}

      {isRoundVisible && !interviewWorkbench ? <section aria-label="报名阶段处理队列" className="admin-pipeline">
        <div>
          <h2 className="font-medium text-fg-primary">{archivedView ? "历史阶段统计" : "按阶段处理"}</h2>
          <p className="mt-1 text-sm text-fg-dim">
            {archivedView ? "仅查看已归档的历史结果，不能再进行审核操作。" : "选择一个阶段打开对应队列；其他筛选条件会继续保留。"}
          </p>
        </div>
        <div className="admin-stage-grid mt-3">
          <SummaryCard
            label="全部"
            value={summary.total}
            active={(query.status ?? "") === ""}
            onClick={() => selectPipelineStatus("")}
          />
          <SummaryCard
            label="待初筛"
            value={summary.pendingScreening}
            active={query.status === "pending_screening"}
            onClick={() => selectPipelineStatus("pending_screening")}
          />
          <SummaryCard
            label="待面试"
            value={summary.pendingInterview}
            active={query.status === "pending_interview"}
            onClick={() => selectPipelineStatus("pending_interview")}
          />
          <SummaryCard
            label="已录取"
            value={summary.admitted}
            active={query.status === "admitted"}
            onClick={() => selectPipelineStatus("admitted")}
          />
          <SummaryCard
            label="未通过"
            value={summary.rejected}
            active={query.status === "rejected"}
            onClick={() => selectPipelineStatus("rejected")}
          />
          <SummaryCard
            label="已撤回"
            value={summary.withdrawn}
            active={query.status === "withdrawn"}
            onClick={() => selectPipelineStatus("withdrawn")}
          />
        </div>
      </section> : null}

      {isRoundVisible ? <form
        aria-label="筛选报名记录"
        onSubmit={submitSearch}
        className="admin-filter-panel admin-filter-grid"
      >
        <input
          value={draftKeyword}
          onChange={(event) => setDraftKeyword(event.target.value)}
          placeholder="搜索姓名 / 手机号 / 邮箱"
          className="admin-field"
        />
        <select
          value={query.status ?? ""}
          onChange={(event) => {
            setQuery((current) => ({
              ...current,
              page: 1,
              status: event.target.value as RecruitmentStatus | "",
              interviewResult: "",
            }))
            setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.delete("view");
              next.delete("queue");
              return next;
            }, { replace: true });
          }}
          className="admin-field"
        >
          {statusOptions.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
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
          className="admin-field"
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
          className="admin-field"
        >
          {attendanceOptions.map((option) => (
            <option key={option.value || "all"} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={query.interviewDate ?? ""}
          onChange={(event) => setQuery((current) => ({ ...current, page: 1, interviewDate: event.target.value }))}
          className="admin-field"
          aria-label="面试日期"
        />
        <select
          value={query.interviewSessionLabel ?? ""}
          onChange={(event) => setQuery((current) => ({ ...current, page: 1, interviewSessionLabel: event.target.value }))}
          className="admin-field"
        >
          <option value="">全部面试时段</option>
          {Array.from(new Set(sessions.map((session) => session.label))).map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </select>
        <div className="admin-filter-actions admin-actions">
          <button type="submit" className="admin-button admin-button--primary">
            搜索
          </button>
        </div>
      </form> : null}

      {isRoundVisible ? <section className="admin-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="admin-table admin-table--registrations">
            <thead>
              <tr>
                <th>候选人</th>
                <th>意向组</th>
                <th>当前状态</th>
                <th>提交时间</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    <div role="status" aria-label={interviewWorkbench ? "正在加载今日面试名单" : "正在加载报名名单"} className="space-y-3 py-2 text-left">
                      <span className="sr-only">正在加载候选人…</span>
                      {[0, 1, 2].map((skeleton) => (
                        <div key={skeleton} aria-hidden="true" className="flex animate-pulse items-center justify-between gap-4 rounded-lg bg-white/[0.03] px-3 py-3">
                          <span className="h-4 w-32 rounded bg-white/[0.08]" />
                          <span className="h-4 w-20 rounded bg-white/[0.08]" />
                          <span className="h-8 w-36 rounded bg-white/[0.08]" />
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    当前筛选条件下没有报名记录。
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="admin-table-row">
                    <td>
                      <div className="font-medium text-fg-primary">
                        {item.contactName || "未填写姓名"}
                      </div>
                      <div className="mt-1 text-xs text-fg-dim">
                        {item.contactPhone || item.contactEmail || "—"}
                      </div>
                      <div className="admin-mobile-group">
                        {item.preferredGroup?.name ?? "未设置"}
                      </div>
                    </td>
                    <td className="text-fg-muted">
                      {item.preferredGroup?.name ?? "未设置"}
                    </td>
                    <td>
                      <StatusBadge status={item.status} rejectedStage={item.rejectedStage} />
                      {item.status === "pending_interview" ? (
                        <div className="mt-1.5 text-xs text-fg-dim">{formatInterviewAttendance(item.interviewAttendance, item.interviewSession)}</div>
                      ) : null}
                    </td>
                    <td className="text-fg-muted">{formatDateTime(item.submittedAt)}</td>
                    <td>
                      <div className="admin-operation-group justify-end">
                        {interviewWorkbench && query.status === "pending_interview" && item.canInterview && !archivedView ? (
                          <>
                            <button
                              type="button"
                              disabled={quickActionId !== null}
                              onClick={() => void runQuickInterviewDecision(item.id, "admit")}
                              aria-label={`将${item.contactName || "候选人"}的面试结果登记为通过`}
                              className="admin-button admin-button--positive admin-button--small"
                            >{quickActionId === item.id ? "保存中…" : "通过"}</button>
                            <button
                              type="button"
                              disabled={quickActionId !== null}
                              onClick={() => void runQuickInterviewDecision(item.id, "reject")}
                              aria-label={`将${item.contactName || "候选人"}的面试结果登记为拒绝`}
                              className="admin-button admin-button--danger admin-button--small"
                            >{quickActionId === item.id ? "保存中…" : "拒绝"}</button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className="admin-button admin-button--secondary admin-button--small"
                        >
                          {archivedView ? "查看详情" : interviewWorkbench ? "查看报名资料" : getRegistrationActionLabel(item.status)}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-border-subtle)] px-4 py-3 text-xs sm:px-5">
          <span className="text-[var(--admin-dim)]">
            共 {pagination.total} 条 · 第 {pagination.page}/{Math.max(pagination.totalPages, 1)} 页
          </span>
          <div className="admin-actions">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setQuery((current) => ({ ...current, page: Math.max(1, pagination.page - 1) }))}
              className="admin-button admin-button--secondary admin-button--small"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setQuery((current) => ({ ...current, page: pagination.page + 1 }))}
              className="admin-button admin-button--secondary admin-button--small"
            >
              下一页
            </button>
          </div>
        </div>
      </section> : null}

      {selectedId != null ? (
        <div
          className="admin-drawer-backdrop fixed inset-0 z-50 flex justify-end"
          onClick={() => setSelectedId(null)}
        >
          <aside
            className="admin-drawer h-full w-full max-w-2xl overflow-y-auto p-4 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="admin-eyebrow">Candidate</div>
                <h2 className="mt-2 text-xl font-semibold text-fg-primary">候选人详情</h2>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="admin-button admin-button--secondary">
                关闭
              </button>
            </div>

            {detailLoading || !detail ? (
              <div className="py-16 text-center text-sm text-fg-dim">正在加载详情...</div>
            ) : (
              <div className="mt-6 space-y-5">
                {detail.notificationWarning ? (
                  <div className="admin-notice admin-notice--warning">
                    {detail.notificationWarning}
                  </div>
                ) : null}

                <section className="admin-detail-section">
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

                <section className="admin-detail-section">
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
                        className="admin-field min-h-24"
                      />
                      <div className="admin-operation-group">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void runAction(
                              () => screenAdminRegistration(detail.id, { decision: "approve", remark: screeningRemark }),
                              "初筛已通过，候选人进入待面试。",
                            )
                          }
                          className="admin-button admin-button--positive"
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
                          className="admin-button admin-button--danger"
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
                      className="admin-button admin-button--secondary mt-4"
                    >
                      撤销初筛
                    </button>
                  ) : null}
                </section>

                <section className="admin-detail-section">
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
                        className="admin-field min-h-24"
                      />
                      <div className="admin-operation-group">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            void runAction(
                              () => recordAdminRegistrationInterview(detail.id, { decision: "admit", remark: interviewRemark }),
                              "面试通过，已录取到意向组。",
                            )
                          }
                          className="admin-button admin-button--positive"
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
                          className="admin-button admin-button--danger"
                        >
                          面试未通过
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {detail.interviewResultHistory.length > 0 ? (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-xl border border-white/[0.08] p-4">
                        <h4 className="font-medium text-fg-primary">结果修改记录与邮件状态</h4>
                        <ol className="mt-3 space-y-3">
                          {detail.interviewResultHistory.map((item) => (
                            <li key={item.revision} className="rounded-lg bg-white/[0.03] p-3 text-sm">
                              <div className="font-medium text-fg-primary">
                                第 {item.revision} 次登记：{getInterviewResultLabel(item.resultStatus)}
                                {item.previousStatus ? `（原状态：${getInterviewResultLabel(item.previousStatus)}）` : "（首次登记）"}
                              </div>
                              <div className="mt-1 text-fg-dim">
                                操作人：{item.actor?.name || item.actor?.email || "历史记录"} · {formatDateTime(item.createdAt)}
                              </div>
                              {item.reason ? <div className="mt-1 text-fg-muted">修改原因：{item.reason}</div> : null}
                              <div className="mt-1 text-fg-muted">
                                邮件状态：{item.notification ? notificationStatusLabel(item.notification.status) : "无通知记录"}
                                {item.notification?.recipient ? ` · ${item.notification.recipient}` : ""}
                                {item.notification?.providerMessageId ? ` · 服务商编号 ${item.notification.providerMessageId}` : ""}
                              </div>
                              {item.notification?.lastError ? <div className="admin-notice admin-notice--error mt-2">最近错误：{item.notification.lastError}</div> : null}
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="rounded-xl border border-white/[0.08] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h4 className="font-medium text-fg-primary">独立发送结果通知</h4>
                            <p className="mt-1 text-sm text-fg-dim">保存面试结果不会发邮件。发送前请检查收件地址、正文和二维码状态。</p>
                          </div>
                          <button
                            type="button"
                            disabled={notificationLoading || actionLoading}
                            onClick={() => void loadInterviewNotificationPreview(detail.id)}
                            className="admin-button admin-button--secondary"
                          >
                            {notificationLoading ? "正在核对..." : notificationPreview ? "重新核对邮件内容" : "核对邮件内容"}
                          </button>
                        </div>

                        {notificationPreview ? (
                          <div className="mt-4 space-y-3">
                            <div className="grid gap-3 text-sm sm:grid-cols-2">
                              <InfoItem label="通知版本" value={`第 ${notificationPreview.revision} 版 · ${notificationStatusLabel(notificationPreview.status)}`} />
                              <InfoItem
                                label="录取群二维码"
                                value={notificationPreview.qrCodeStatus === "ready" ? "已配置且可读取" : notificationPreview.qrCodeStatus === "not_required" ? "拒绝通知无需附图" : notificationPreview.qrCodeStatus === "missing" ? "未配置" : "读取失败"}
                              />
                              {notificationPreview.qrCodeStatus !== "not_required" ? (
                                <InfoItem label="对应组别" value={notificationPreview.qrCodeGroupName || "未设置"} />
                              ) : null}
                              <div className="sm:col-span-2"><InfoItem label="收件地址" value={notificationPreview.recipient || "未配置"} /></div>
                              <div className="sm:col-span-2"><InfoItem label="邮件主题" value={notificationPreview.subject || "未生成"} /></div>
                            </div>
                            {notificationPreview.qrCodeStatus !== "not_required" ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <QRCodePreviewCard
                                  title={notificationPreview.status === "legacy_unknown" ? "本次预览使用的当前组二维码" : "通知保存的二维码"}
                                  status={notificationPreview.qrCodeStatus}
                                  imageUrl={notificationPreview.qrCodeUrl}
                                />
                                {notificationPreview.status !== "legacy_unknown" ? (
                                  <QRCodePreviewCard
                                    title="该组当前配置的二维码"
                                    status={notificationPreview.currentQrCodeStatus ?? "missing"}
                                    imageUrl={notificationPreview.currentQrCodeUrl}
                                  />
                                ) : null}
                              </div>
                            ) : null}
                            <div className="rounded-lg bg-black/20 p-3">
                              <div className="text-xs text-fg-dim">邮件正文</div>
                              <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-fg-primary">{notificationPreview.body}</div>
                            </div>
                            {notificationPreview.warning ? <div className="admin-notice admin-notice--warning">{notificationPreview.warning}</div> : null}
                            {notificationPreview.canRefreshQrCode ? (
                              <button
                                type="button"
                                disabled={notificationLoading || actionLoading}
                                onClick={() => void runRefreshInterviewNotificationQRCode(detail.id)}
                                className="admin-button admin-button--secondary"
                              >
                                更新待发送通知的二维码
                              </button>
                            ) : null}
                            {notificationPreview.requiresConfirmation ? (
                              <label className="flex gap-2 text-sm leading-6 text-fg-muted">
                                <input
                                  type="checkbox"
                                  checked={confirmUncertainNotification}
                                  onChange={(event) => setConfirmUncertainNotification(event.target.checked)}
                                  className="mt-1"
                                />
                                我已核对邮件服务商记录，确认需要发送或重试。历史状态不明时，未核对前不要勾选。
                              </label>
                            ) : null}
                            <button
                              type="button"
                              disabled={!notificationPreview.canSend || actionLoading || (notificationPreview.requiresConfirmation && !confirmUncertainNotification)}
                              onClick={() => void runInterviewNotificationSend(detail.id)}
                              className="admin-button admin-button--positive"
                            >
                              {notificationPreview.status === "failed" ? "核对后重新发送" : "发送结果通知"}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {(detail.status === "admitted" || (detail.status === "rejected" && detail.rejectedStage === "interview")) ? (
                        <div className="rounded-xl border border-amber-300/20 p-4">
                          <h4 className="font-medium text-fg-primary">纠正面试结果</h4>
                          <p className="mt-1 text-sm text-fg-dim">纠正会新增一条历史记录和对应的新通知，已接受发送的旧通知记录会保留。</p>
                          <textarea
                            value={correctionReason}
                            onChange={(event) => setCorrectionReason(event.target.value)}
                            placeholder="请说明纠正原因（必填）"
                            className="admin-field mt-3 min-h-20"
                          />
                          <div className="admin-operation-group mt-3">
                            <button
                              type="button"
                              disabled={actionLoading || correctionReason.trim() === ""}
                              onClick={() => void runAction(
                                () => correctAdminRegistrationInterview(detail.id, { decision: "admit", remark: interviewRemark, correctionReason }),
                                "已保存面试结果纠正，原邮件状态记录已保留。",
                              )}
                              className="admin-button admin-button--positive"
                            >纠正为录取</button>
                            <button
                              type="button"
                              disabled={actionLoading || correctionReason.trim() === ""}
                              onClick={() => void runAction(
                                () => correctAdminRegistrationInterview(detail.id, { decision: "reject", remark: interviewRemark, correctionReason }),
                                "已保存面试结果纠正，原邮件状态记录已保留。",
                              )}
                              className="admin-button admin-button--danger"
                            >纠正为未通过</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="admin-detail-section">
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

function SummaryCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="admin-stage"
    >
      <div className="admin-stage-label">{label}</div>
      <div className="admin-count admin-count--compact mt-2">{value}</div>
    </button>
  );
}

function getRegistrationActionLabel(status: RecruitmentStatus) {
  if (status === "pending_screening") return "处理初筛";
  if (status === "pending_interview") return "处理面试";
  return "查看结果";
}

function getInterviewResultLabel(status: RecruitmentStatus) {
  if (status === "admitted") return "已录取";
  if (status === "rejected") return "未通过";
  if (status === "pending_interview") return "待面试";
  return status;
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
      className: "admin-status--screening",
    },
    pending_interview: {
      label: "待面试",
      className: "admin-status--interview",
    },
    admitted: {
      label: "已录取",
      className: "admin-status--admitted",
    },
    rejected: {
      label: rejectedStage === "screening" ? "初筛未通过" : rejectedStage === "interview" ? "面试未通过" : "未通过",
      className: "admin-status--rejected",
    },
    withdrawn: {
      label: "已撤回",
      className: "admin-status--withdrawn",
    },
  };
  const item = meta[status];
  return (
    <span className={`admin-status ${item.className}`}>
      {item.label}
    </span>
  );
}

function QRCodePreviewCard({ title, status, imageUrl }: { title: string; status: string; imageUrl?: string }) {
  const statusLabel = status === "ready" ? "可读取" : status === "missing" ? "未配置" : "读取失败";
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.08] bg-black/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-medium text-fg-primary">{title}</h5>
        <span className="text-xs text-fg-dim">{statusLabel}</span>
      </div>
      <div className="mt-2 flex min-h-36 items-center justify-center rounded-md bg-black/20 p-2">
        {status === "ready" && imageUrl ? (
          <img src={buildApiUrl(imageUrl)} alt={title} className="max-h-40 max-w-full object-contain" />
        ) : (
          <span className="px-2 text-center text-xs text-fg-dim">{status === "missing" ? "没有可用的二维码图片" : "无法预览二维码"}</span>
        )}
      </div>
    </div>
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
            className="admin-file-link"
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
  return `已确认 · ${monthDay} ${session.label} ${session.startTime}–${session.endTime}`;
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
