import { useEffect, useRef, useState, type FormEvent } from "react";
import { useOutletContext, useSearchParams } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  assignmentClient,
  assignmentDecisionLabel,
  assignmentStatusLabel,
  formatAssignmentDate,
  type Assignment,
  type MyAssignmentDetail,
} from "~/lib/assignment-client";

export function meta() {
  return [{ title: "我的作业 | TARSGO" }];
}

const fileAccept = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.7z,.rar";
const inputClass = "admin-field w-full";

export default function MyAssignmentsRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams] = useSearchParams();
  const requestedAssignmentID = Number(searchParams.get("assignmentId")) || null;
  const [items, setItems] = useState<Assignment[]>([]);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [detail, setDetail] = useState<MyAssignmentDetail | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestId = useRef(0);
  const currentUserId = useRef(currentUser.id);
  currentUserId.current = currentUser.id;

  async function loadAssignments(selectID?: number | null) {
    const activeRequest = ++requestId.current;
    const accountId = currentUser.id;
    setLoading(true);
    setError("");
    try {
      const result = await assignmentClient.listMine();
      if (requestId.current !== activeRequest || currentUserId.current !== accountId) return;
      setItems(result);
      const id = selectID === null ? result[0]?.id ?? null : selectID ?? selectedID ?? result[0]?.id ?? null;
      setSelectedID(id);
      if (id != null) {
        const nextDetail = await assignmentClient.getMine(id);
        if (requestId.current !== activeRequest || currentUserId.current !== accountId) return;
        setDetail(nextDetail);
      }
      else setDetail(null);
    } catch (cause) {
      if (requestId.current === activeRequest && currentUserId.current === accountId) {
        setError(cause instanceof Error ? cause.message : "作业加载失败");
      }
    } finally {
      if (requestId.current === activeRequest && currentUserId.current === accountId) setLoading(false);
    }
  }

  useEffect(() => {
    requestId.current += 1;
    setItems([]);
    setSelectedID(null);
    setDetail(null);
    void loadAssignments(requestedAssignmentID);
  }, [currentUser.id, requestedAssignmentID]);

  async function selectAssignment(item: Assignment) {
    const activeRequest = ++requestId.current;
    const accountId = currentUser.id;
    setSelectedID(item.id);
    setDetail(null);
    setFiles([]);
    setError("");
    try {
      const nextDetail = await assignmentClient.getMine(item.id);
      if (requestId.current === activeRequest && currentUserId.current === accountId) setDetail(nextDetail);
    } catch (cause) {
      if (requestId.current === activeRequest && currentUserId.current === accountId) {
        setError(cause instanceof Error ? cause.message : "作业详情加载失败");
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || files.length === 0) return;
    const accountId = currentUser.id;
    const activeRequest = ++requestId.current;
    setSaving(true);
    setError("");
    try {
      const updated = await assignmentClient.submit(detail.assignment.id, files);
      if (currentUserId.current !== accountId || requestId.current !== activeRequest) return;
      setDetail(updated);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadAssignments(updated.assignment.id);
    } catch (cause) {
      if (currentUserId.current === accountId) setError(cause instanceof Error ? cause.message : "提交失败，请稍后重试");
    } finally {
      if (currentUserId.current === accountId) setSaving(false);
    }
  }

  const assignment = detail?.assignment;
  const canSubmit = Boolean(assignment
    && assignment.status !== "passed"
    && (!detail?.submissions.length || Date.now() <= new Date(assignment.dueAt).getTime()));

  return (
    <section className="admin-design space-y-5" aria-labelledby="my-assignments-title">
      <header className="admin-page-header"><h1 id="my-assignments-title" className="admin-page-title">我的作业</h1></header>
      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {loading ? <p role="status" className="py-6 text-sm text-[var(--admin-muted)]">正在加载作业…</p> : null}
      {!loading && items.length === 0 ? <section className="admin-panel p-5 text-sm text-[var(--admin-muted)]">暂无分配给你的作业。</section> : null}
      {!loading && items.length > 0 ? <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.6fr)]">
        <section className="admin-panel divide-y divide-[var(--admin-border-subtle)] p-3" aria-label="作业列表">
          {items.map((item) => <button key={item.id} type="button" disabled={saving} onClick={() => void selectAssignment(item)} className={`w-full rounded-lg px-3 py-3 text-left transition-colors disabled:cursor-wait ${selectedID === item.id ? "bg-amber-400/10" : "hover:bg-white/[0.04]"}`}>
            <span className="flex items-start justify-between gap-2"><strong className="text-sm text-white">{item.title}</strong><span className="shrink-0 text-xs text-[var(--admin-muted)]">{assignmentStatusLabel(item.status)}</span></span>
            <span className="mt-1 block text-xs text-[var(--admin-muted)]">{item.groupName} · 截止 {formatAssignmentDate(item.dueAt)}</span>
            {item.isLate ? <span className="mt-1 block text-xs text-amber-300">逾期提交</span> : null}
          </button>)}
        </section>

        {assignment ? <section className="admin-panel space-y-4 p-4 sm:p-5" aria-labelledby="assignment-detail-title">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs text-[var(--admin-muted)]">{assignment.groupName} · 截止 {formatAssignmentDate(assignment.dueAt)}</p><h2 id="assignment-detail-title" className="mt-1 text-xl font-semibold text-white">{assignment.title}</h2></div>
            <span className="rounded-full border border-[var(--admin-border-subtle)] px-3 py-1 text-xs text-[var(--admin-muted)]">{assignmentStatusLabel(assignment.status)}</span>
          </header>
          <div className="whitespace-pre-wrap text-sm leading-6 text-[var(--admin-text)]">{assignment.description}</div>
          {assignment.attachmentRequirements ? <div className="rounded-lg bg-white/[0.035] px-3 py-2 text-sm"><span className="text-[var(--admin-muted)]">附件要求：</span>{assignment.attachmentRequirements}</div> : null}

          <section className="space-y-3" aria-labelledby="assignment-history-title">
            <h3 id="assignment-history-title" className="text-sm font-semibold text-white">提交与批改记录</h3>
            {detail.submissions.length === 0 ? <p className="text-sm text-[var(--admin-muted)]">尚未提交</p> : <div className="space-y-3">
              {detail.submissions.map((submission) => <article key={submission.id} className="rounded-xl border border-[var(--admin-border-subtle)] p-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>第 {submission.attempt} 次提交</strong><span className="text-xs text-[var(--admin-muted)]">{formatAssignmentDate(submission.submittedAt)}{submission.isLate ? " · 逾期提交" : ""}</span></div>
                <ul className="mt-2 space-y-1 text-sm">{submission.files.map((file) => <li key={file.id}><a className="text-amber-300 hover:text-amber-200" href={file.downloadUrl}>{file.fileName}</a><span className="ml-2 text-xs text-[var(--admin-muted)]">{Math.ceil(file.size / 1024)} KB</span></li>)}</ul>
                {submission.reviews.map((review) => <div key={review.id} className="mt-3 rounded-lg bg-white/[0.035] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>已批改 · {assignmentDecisionLabel(review.decision)}</strong><span className="text-[var(--admin-muted)]">{review.score} 分 · {formatAssignmentDate(review.createdAt)}</span></div>
                  {review.comment ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--admin-text)]">{review.comment}</p> : null}
                </div>)}
              </article>)}
            </div>}
          </section>

          {canSubmit ? <form onSubmit={submit} className="space-y-3 border-t border-[var(--admin-border-subtle)] pt-4">
            <label className="admin-field-label">提交附件<input ref={fileInputRef} className={inputClass} type="file" multiple required accept={fileAccept} onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))} /></label>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--admin-muted)]">最多 10 个文件，单个不超过 20 MB，总计不超过 50 MB。</p><button type="submit" className="admin-button admin-button--primary" disabled={saving || files.length === 0}>{saving ? "提交中…" : detail.submissions.length ? "重新提交" : "提交作业"}</button></div>
          </form> : null}
        </section> : selectedID != null && !loading ? <section className="admin-panel p-5 text-sm text-[var(--admin-muted)]">正在读取作业记录…</section> : null}
      </div> : null}
    </section>
  );
}
