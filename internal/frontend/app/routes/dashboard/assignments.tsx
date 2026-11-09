import { BrandLoader } from "~/components/brand-loader";
import { CommunityMarkdown } from "~/components/community-markdown";
import "~/components/community-markdown-editor.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useOutletContext, useSearchParams } from "react-router";

import { FileUploadField, type FileUploadStatus } from "~/components/file-upload-field";
import { ApiError } from "~/lib/api-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  assignmentClient,
  assignmentDecisionLabel,
  assignmentPublicationStatusLabel,
  assignmentStatusLabel,
  formatAssignmentDate,
  type Assignment,
  type MyAssignmentDetail,
} from "~/lib/assignment-client";

export function meta() {
  return [{ title: "我的作业 | TARSGO" }];
}

const maxSubmissionFiles = 10;
type AssignmentFilter = "all" | "todo" | "submitted" | "passed";

function assignmentPriority(item: Assignment) {
  if (item.publicationStatus === "withdrawn") return 5;
  switch (item.status) {
    case "overdue": return 0;
    case "needs_redo": return 1;
    case "pending": return 2;
    case "submitted": return 3;
    case "passed": return 4;
    default: return 5;
  }
}

function matchesFilter(item: Assignment, filter: AssignmentFilter) {
  if (filter === "all") return true;
  if (filter === "todo") return assignmentPriority(item) <= 2;
  return item.status === filter && item.publicationStatus !== "withdrawn";
}

export default function MyAssignmentsRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAssignmentID = Number(searchParams.get("assignmentId")) || null;
  const [items, setItems] = useState<Assignment[]>([]);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [detail, setDetail] = useState<MyAssignmentDetail | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [filter, setFilter] = useState<AssignmentFilter>("all");
  const [submissionError, setSubmissionError] = useState("");
  const [submittedAssignmentID, setSubmittedAssignmentID] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileUploadStatus, setFileUploadStatus] = useState<FileUploadStatus>("pending");
  const [error, setError] = useState("");
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const selectedIDRef = useRef<number | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const scrollToDetailIDRef = useRef<number | null>(null);
  const currentUserId = useRef(currentUser.id);
  currentUserId.current = currentUser.id;

  async function loadDetail(id: number) {
    const activeRequest = ++detailRequestId.current;
    const accountId = currentUser.id;
    selectedIDRef.current = id;
    setSelectedID(id);
    setDetail(null);
    setDetailLoading(true);
    setSubmissionError("");
    setSubmittedAssignmentID(null);
    setError("");
    try {
      const nextDetail = await assignmentClient.getMine(id);
      if (detailRequestId.current === activeRequest && currentUserId.current === accountId) setDetail(nextDetail);
    } catch (cause) {
      if (detailRequestId.current === activeRequest && currentUserId.current === accountId) {
        scrollToDetailIDRef.current = null;
        setError(cause instanceof Error ? cause.message : "作业详情加载失败");
      }
    } finally {
      if (detailRequestId.current === activeRequest && currentUserId.current === accountId) setDetailLoading(false);
    }
  }

  async function loadAssignments(selectID?: number | null, reloadDetail = true) {
    const activeRequest = ++listRequestId.current;
    const accountId = currentUser.id;
    setLoading(true);
    setError("");
    try {
      const result = await assignmentClient.listMine();
      if (listRequestId.current !== activeRequest || currentUserId.current !== accountId) return;
      const sorted = [...result].sort((a, b) => assignmentPriority(a) - assignmentPriority(b) || a.dueAt.localeCompare(b.dueAt));
      setItems(sorted);
      const preferredID = selectedIDRef.current ?? selectID;
      const id = sorted.find((item) => item.id === preferredID)?.id ?? sorted[0]?.id ?? null;
      if (id === null) {
        detailRequestId.current += 1;
        selectedIDRef.current = null;
        setSelectedID(null);
        setDetail(null);
        setDetailLoading(false);
      } else if (reloadDetail || selectedIDRef.current !== id) {
        void loadDetail(id);
      }
    } catch (cause) {
      if (listRequestId.current === activeRequest && currentUserId.current === accountId) {
        setError(cause instanceof Error ? cause.message : "作业加载失败");
      }
    } finally {
      if (listRequestId.current === activeRequest && currentUserId.current === accountId) setLoading(false);
    }
  }

  useEffect(() => {
    listRequestId.current += 1;
    detailRequestId.current += 1;
    selectedIDRef.current = null;
    scrollToDetailIDRef.current = null;
    setSubmittedAssignmentID(null);
    setFilter("all");
    setItems([]);
    setSelectedID(null);
    setDetail(null);
    void loadAssignments(requestedAssignmentID);
    return () => { listRequestId.current += 1; detailRequestId.current += 1; };
  }, [currentUser.id]);

  useEffect(() => {
    if (requestedAssignmentID && items.some((item) => item.id === requestedAssignmentID)
      && selectedIDRef.current !== requestedAssignmentID) void loadDetail(requestedAssignmentID);
  }, [requestedAssignmentID]);

  useEffect(() => {
    if (!detail || scrollToDetailIDRef.current !== detail.assignment.id) return;
    scrollToDetailIDRef.current = null;
    detailPanelRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [detail]);

  async function selectAssignment(item: Assignment, scrollOnMobile = false) {
    scrollToDetailIDRef.current = scrollOnMobile && window.matchMedia("(max-width: 1279px)").matches ? item.id : null;
    setFiles([]);
    setFileUploadStatus("pending");
    setSubmissionError("");
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("assignmentId", String(item.id));
      return next;
    }, { replace: true });
    await loadDetail(item.id);
  }

  function changeFilter(next: AssignmentFilter) {
    setFilter(next);
    const shown = items.filter((item) => matchesFilter(item, next));
    if (shown.length && !shown.some((item) => item.id === selectedIDRef.current)) {
      void selectAssignment(shown[0]);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || files.length === 0) return;
    const accountId = currentUser.id;
    const activeRequest = ++detailRequestId.current;
    setSaving(true);
    setFileUploadStatus("uploading");
    setSubmissionError("");
    setSubmittedAssignmentID(null);
    try {
      const updated = await assignmentClient.submit(detail.assignment.id, files);
      if (currentUserId.current !== accountId || detailRequestId.current !== activeRequest) return;
      setDetail(updated);
      setFilter((current) => matchesFilter(updated.assignment, current) ? current : "all");
      setSubmittedAssignmentID(updated.assignment.id);
      setFiles([]);
      setFileUploadStatus("pending");
      await loadAssignments(updated.assignment.id, false);
    } catch (cause) {
      if (currentUserId.current === accountId && detailRequestId.current === activeRequest) {
        setFileUploadStatus("failed");
        const message = cause instanceof Error ? cause.message : "提交失败，请稍后重试";
        setSubmissionError(cause instanceof ApiError && cause.status === 413
          ? "附件过大，上传失败。请减小文件大小后重试。"
          : cause instanceof TypeError
            ? "网络连接中断，附件未完成上传，请重新提交。"
            : message);
      }
    } finally {
      if (currentUserId.current === accountId) setSaving(false);
    }
  }

  const visibleItems = items.filter((item) => matchesFilter(item, filter));
  const assignment = detail?.assignment;
  const latestFeedback = detail?.submissions.at(-1)?.reviews.at(-1)?.comment;
  const canSubmit = Boolean(assignment
    && assignment.publicationStatus !== "withdrawn"
    && assignment.status !== "passed"
    && (!detail?.submissions.length || Date.now() <= new Date(assignment.dueAt).getTime()));
  const submissionForm = canSubmit ? (
    <form onSubmit={submit} className="space-y-3 border-t border-[var(--admin-border-subtle)] pt-4">
            <div className="admin-field-label">提交附件<FileUploadField
              label="作业提交附件"
              files={files}
              onFilesChange={(next) => { setFiles(next); setFileUploadStatus("pending"); setSubmissionError(""); }}
              multiple
              hint="最多 10 个附件"
              status={fileUploadStatus}
              disabled={saving}
              validateSelection={(next) => {
                if (next.length > maxSubmissionFiles) return "最多提交 10 个文件。";
                if (next.some((file) => file.size <= 0)) return "不能提交空文件。";
                return null;
              }}
            /></div>
            {submissionError ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{submissionError}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-3"><button type="submit" className="admin-button admin-button--primary" disabled={saving || files.length === 0}>{saving ? "提交中…" : assignment?.status === "needs_redo" ? "重新提交" : assignment?.status === "submitted" ? "更新提交" : "提交作业"}</button></div>
    </form>
  ) : null;

  return (
    <section className="admin-design space-y-5" aria-labelledby="my-assignments-title">
      <header className="admin-page-header"><h1 id="my-assignments-title" className="admin-page-title">我的作业</h1></header>
      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {loading && items.length === 0 ? <BrandLoader label="正在加载作业" /> : null}
      {!loading && !error && items.length === 0 ? <section className="admin-panel p-5 text-sm text-[var(--admin-muted)]">目前还没有分配给你的作业；作业发布后会显示在这里。</section> : null}
      {items.length > 0 ? <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.6fr)]">
        <section className="admin-panel p-3" aria-label="作业列表">
          <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="筛选作业">
            {([
              { value: "all", label: "全部" },
              { value: "todo", label: "待处理" },
              { value: "submitted", label: "待批改" },
              { value: "passed", label: "已通过" },
            ] as const).map(({ value, label }) => <button key={value} type="button" aria-pressed={filter === value} disabled={saving}
              onClick={() => changeFilter(value)}
              className={`admin-button admin-button--small ${filter === value ? "admin-button--secondary" : "admin-button--quiet"}`}>{label}</button>)}
          </div>
          {visibleItems.length === 0 ? <p className="px-3 py-4 text-sm text-[var(--admin-muted)]">当前筛选下没有作业。</p> : null}
          <div className="divide-y divide-[var(--admin-border-subtle)]">
          {visibleItems.map((item) => <button key={item.id} type="button" disabled={saving} onClick={() => void selectAssignment(item, true)} className={`w-full rounded-lg px-3 py-3 text-left transition-colors disabled:cursor-wait ${selectedID === item.id ? "bg-[color-mix(in_srgb,var(--admin-accent)_10%,var(--admin-surface))]" : "hover:bg-[var(--admin-hover-overlay)]"}`}>
            <span className="flex items-start justify-between gap-2"><strong className="text-sm text-[var(--admin-text)]">{item.title}</strong><span className="shrink-0 text-xs text-[var(--admin-muted)]">{item.publicationStatus === "withdrawn" ? "已撤回" : item.status === "submitted" ? "待批改" : assignmentStatusLabel(item.status)}</span></span>
            <span className="mt-1 block text-xs text-[var(--admin-muted)]">{item.groupName} · 截止 {formatAssignmentDate(item.dueAt)}</span>
            {item.isLate ? <span className="mt-1 block text-xs text-[var(--admin-warning)]">逾期提交</span> : null}
          </button>)}
          </div>
        </section>

        {assignment && visibleItems.some((item) => item.id === selectedID) ? <section ref={detailPanelRef} className="admin-panel scroll-mt-20 space-y-4 p-4 sm:p-5" aria-labelledby="assignment-detail-title">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs text-[var(--admin-muted)]">{assignment.groupName} · 截止 {formatAssignmentDate(assignment.dueAt)}</p><h2 id="assignment-detail-title" className="mt-1 text-xl font-semibold text-[var(--admin-text)]">{assignment.title}</h2></div>
            <span className="rounded-full border border-[var(--admin-border-subtle)] px-3 py-1 text-xs text-[var(--admin-muted)]">{assignment.publicationStatus === "withdrawn" ? assignmentPublicationStatusLabel(assignment.publicationStatus) : assignment.status === "submitted" ? "已提交，等待批改" : assignmentStatusLabel(assignment.status)}</span>
          </header>
          {submittedAssignmentID === assignment.id ? <p role="status" className="rounded-lg border border-[var(--admin-success-border)] bg-[var(--admin-success-surface)] px-3 py-2 text-sm text-[var(--admin-success)]">提交成功，等待批改。</p> : null}
          {assignment.publicationStatus === "withdrawn" ? <p role="status" className="rounded-lg border border-[var(--admin-border-subtle)] px-3 py-2 text-sm text-[var(--admin-muted)]">作业已撤回，无法继续提交；已有提交和批改记录仍可查看。</p> : null}
          <div className="whitespace-pre-wrap text-sm leading-6 text-[var(--admin-text)]">{assignment.description}</div>
          {assignment.attachmentRequirements ? <div className="rounded-lg bg-[var(--admin-surface-subtle)] px-3 py-2 text-sm"><span className="text-[var(--admin-muted)]">附件要求：</span>{assignment.attachmentRequirements}</div> : null}

          {(assignment.materialFiles ?? []).length > 0 ? <section className="space-y-2" aria-labelledby="assignment-teaching-materials-title">
            <h3 id="assignment-teaching-materials-title" className="text-sm font-semibold text-[var(--admin-text)]">教学资料</h3>
            <ul className="divide-y divide-[var(--admin-border-subtle)] rounded-lg border border-[var(--admin-border-subtle)] px-3">
              {(assignment.materialFiles ?? []).map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <a className="min-w-0 break-all text-[var(--admin-warning)] hover:text-[var(--admin-warning)]" href={file.downloadUrl}>{file.fileName}</a>
                <span className="text-xs text-[var(--admin-muted)]">{file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(file.size / 1024))} KB`}</span>
              </li>)}
            </ul>
          </section> : null}

          {assignment.status === "needs_redo" ? <section className="rounded-lg border border-[var(--admin-warning-border)] p-3" aria-label="返修意见">
            <strong className="text-sm text-[var(--admin-text)]">返修意见</strong>
            {latestFeedback ? <CommunityMarkdown source={latestFeedback} className="mt-2 whitespace-pre-wrap text-sm" /> : <p className="mt-2 text-sm text-[var(--admin-muted)]">作业已退回，请修改后重新提交。</p>}
          </section> : null}

          {assignment.status === "submitted" && canSubmit ? <details key={detail.submissions.at(-1)?.id} className="rounded-lg border border-[var(--admin-border-subtle)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--admin-text)]">更新已提交的附件</summary>
            <div className="mt-3">{submissionForm}</div>
          </details> : assignment.status === "submitted" ? null : submissionForm}
          {assignment.status === "needs_redo" && !canSubmit && assignment.publicationStatus !== "withdrawn" ? <p role="status" className="text-sm text-[var(--admin-warning)]">已过截止时间，无法重新提交。</p> : null}

          {detail.submissions.length > 0 ? <details key={assignment.id} className="space-y-3" aria-labelledby="assignment-history-title">
            <summary id="assignment-history-title" className="cursor-pointer text-sm font-semibold text-[var(--admin-text)]">提交与批改记录（{detail.submissions.length} 次）</summary>
            <div className="mt-3 space-y-3">
              {detail.submissions.map((submission) => <article key={submission.id} className="rounded-xl border border-[var(--admin-border-subtle)] p-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>第 {submission.attempt} 次提交</strong><span className="text-xs text-[var(--admin-muted)]">{formatAssignmentDate(submission.submittedAt)}{submission.isLate ? " · 逾期提交" : ""}</span></div>
                <ul className="mt-2 space-y-1 text-sm">{submission.files.map((file) => <li key={file.id}><a className="text-[var(--admin-warning)] hover:text-[var(--admin-warning)]" href={file.downloadUrl}>{file.fileName}</a><span className="ml-2 text-xs text-[var(--admin-muted)]">{Math.ceil(file.size / 1024)} KB</span></li>)}</ul>
                {submission.reviews.map((review) => <div key={review.id} className="mt-3 rounded-lg bg-[var(--admin-surface-subtle)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>已批改 · {assignmentDecisionLabel(review.decision)}</strong><span className="text-[var(--admin-muted)]">{formatAssignmentDate(review.createdAt)}</span></div>
                  {review.comment ? <CommunityMarkdown source={review.comment} className="mt-2 whitespace-pre-wrap text-sm" /> : null}
                </div>)}
              </article>)}
            </div>
          </details> : null}
        </section> : selectedID != null && detailLoading && visibleItems.some((item) => item.id === selectedID) ? <section className="admin-panel p-5"><BrandLoader label="正在读取作业记录" size="sm" /></section> : null}
      </div> : null}
    </section>
  );
}
