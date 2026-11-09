import { BrandLoader } from "~/components/brand-loader";
import { CommunityMarkdown } from "~/components/community-markdown";
import type { CommunityPendingImage } from "~/components/community-markdown-editor";
import { validateCommunityImages } from "~/lib/community-client";
import { validateCommunityImageBindings } from "~/lib/community-image-bindings";
import "~/components/community-markdown-editor.css";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";

import { assignmentClient, assignmentDecisionLabel, assignmentStatusLabel, formatAssignmentDate, type AdminAssignmentDetail, type Assignment } from "~/lib/assignment-client";
import { Notify } from "~/components/notify";

export function meta() {
  return [{ title: "作业管理 | TARSGO" }];
}

export default function AssignmentSubmissionsRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("view", "review");
  return <Navigate to={`/dashboard/admin/training/assignments?${params}`} replace />;
}

const fieldClass = "admin-field w-full";
const ReviewEditor = lazy(() => import("~/components/community-markdown-editor").then((module) => ({ default: module.CommunityMarkdownEditor })));

export function AssignmentReview({ groupId }: { groupId: number }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedID = Number(searchParams.get("assignmentId")) || 0;
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedID, setSelectedID] = useState(requestedID);
  const [submissionFilter, setSubmissionFilter] = useState<"toSubmit" | "toReview" | "passed">("toReview");
  const [editingReviewID, setEditingReviewID] = useState(0);
  const [reviewUploads, setReviewUploads] = useState<CommunityPendingImage[]>([]);
  const reviewUploadsRef = useRef<CommunityPendingImage[]>([]);
  const [reviewError, setReviewError] = useState("");
  const reviewFlushRef = useRef<() => string>(() => "");
  const [detail, setDetail] = useState<AdminAssignmentDetail | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<number, { score: string; decision: "passed" | "needs_redo"; comment: string }>>({});
  const [loading, setLoading] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingID, setSavingID] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setLoading(true);
    setListLoaded(false);
    setAssignments([]);
    setDetail(null);
    setDetailLoading(false);
    setSelectedID(0);
    setError("");
    assignmentClient.listAdmin(groupId).then((items) => {
      if (!active) return;
      setAssignments(items);
      setListLoaded(true);
      const nextID = items.some((item) => item.id === requestedID) ? requestedID : items.find((item) => item.submittedCount > item.reviewedCount)?.id ?? items[0]?.id ?? 0;
      setSelectedID(nextID);
      if (nextID) setSearchParams({ view: "review", assignmentId: String(nextID) }, { replace: true });
    }).catch((cause: unknown) => {
      if (active) {
        setAssignments([]);
        setListLoaded(false);
        setError(cause instanceof Error ? cause.message : "作业列表加载失败");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId]);

  useEffect(() => {
    if (!listLoaded || !selectedID) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    let active = true;
    setDetail(null);
    setDetailLoading(true);
    setError("");
    assignmentClient.getAdmin(selectedID).then((value) => { if (active) setDetail(value); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "提交记录加载失败"); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedID, listLoaded]);

  function draftFor(submissionID: number) {
    return reviewDrafts[submissionID] ?? { score: "", decision: "passed" as const, comment: "" };
  }

  function updateDraft(submissionID: number, patch: Partial<ReturnType<typeof draftFor>>) {
    setReviewDrafts((current) => ({ ...current, [submissionID]: { ...(current[submissionID] ?? { score: "", decision: "passed", comment: "" }), ...patch } }));
  }

  async function review(submissionID: number) {
    const draft = draftFor(submissionID);
    const score = Number(draft.score);
    if (draft.score.trim() === "" || !Number.isInteger(score) || score < 0 || score > 100) {
      setReviewError("请输入 0 至 100 的整数成绩。");
      return;
    }
    const comment = reviewFlushRef.current();
    const files = reviewUploadsRef.current.map((item) => item.file);
    const uploadTokens = reviewUploadsRef.current.map((item) => item.token);
    const validationError = validateCommunityImages(files) || validateCommunityImageBindings(comment, files.length, uploadTokens);
    if (validationError) {
      setReviewError(validationError);
      return;
    }
    if (Array.from(comment).length > 5000) {
      setReviewError("评语不能超过 5000 字。");
      return;
    }
    setSavingID(submissionID);
    setReviewError("");
    setError("");
    setNotice("");
    const wasCorrection = detail?.members.some((member) => member.latestSubmission?.id === submissionID && member.latestSubmission.reviews.length > 0);
    try {
      const updated = await assignmentClient.review(submissionID, { score, decision: draft.decision, comment, files, uploadTokens });
      const next = wasCorrection ? undefined : updated.members.find((member) => member.status === "submitted")?.latestSubmission;
      setDetail(updated);
      setNotice(next ? "批改已保存，已打开下一份。" : "批改结果已保存。");
      syncReviewDrafts(updated);
      if (!wasCorrection) setSubmissionFilter("toReview");
      setEditingReviewID(next?.id ?? 0);
      setReviewUploads([]);
      reviewUploadsRef.current = [];
      void assignmentClient.listAdmin(groupId).then(setAssignments).catch(() => {});
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : "保存批改结果失败");
    } finally {
      setSavingID(0);
    }
  }

  function editReview(submissionID: number, review?: { score?: number; decision: "passed" | "needs_redo"; comment: string }) {
    if (editingReviewID === submissionID) {
      setEditingReviewID(0);
      setReviewUploads([]);
    reviewUploadsRef.current = [];
      setReviewError("");
      return;
    }
    setReviewDrafts((current) => ({
      ...current,
      [submissionID]: {
        score: review?.score === undefined ? "" : String(review.score),
        decision: review?.decision ?? "passed",
        comment: review?.comment ?? "",
      },
    }));
    setEditingReviewID(submissionID);
    setReviewUploads([]);
    reviewUploadsRef.current = [];
    setReviewError("");
  }

  function syncReviewDrafts(value: AdminAssignmentDetail) {
    setReviewDrafts((current) => {
      const next = { ...current };
      for (const member of value.members) {
        const submission = member.latestSubmission;
        const review = submission?.reviews[submission.reviews.length - 1];
        if (submission && review) {
          next[submission.id] = { score: String(review.score), decision: review.decision, comment: review.comment };
        }
      }
      return next;
    });
  }

  function chooseAssignment(id: number) {
    setSelectedID(id);
    setDetail(null);
    setDetailLoading(Boolean(id));
    setEditingReviewID(0);
    setReviewUploads([]);
    reviewUploadsRef.current = [];
    setReviewError("");
    setError("");
    setSearchParams(id ? { view: "review", assignmentId: String(id) } : { view: "review" }, { replace: true });
    setNotice("");
  }

  const assignment = listLoaded && assignments.some((item) => item.id === selectedID) && detail?.assignment.id === selectedID
    ? detail.assignment
    : null;
  const toSubmit = detail?.members.filter((member) => member.status === "pending" || member.status === "overdue" || member.status === "needs_redo") ?? [];
  const toReview = detail?.members.filter((member) => member.status === "submitted") ?? [];
  const passed = detail?.members.filter((member) => member.status === "passed") ?? [];
  const visibleMembers = submissionFilter === "toSubmit" ? toSubmit : submissionFilter === "toReview" ? toReview : passed;

  return (
    <section className="space-y-5" aria-label="批改中心">
      {assignments.length > 0 ? <label className="admin-field-label">作业<select className="admin-field w-full" value={selectedID} onChange={(event) => chooseAssignment(Number(event.target.value))}>
        {assignments.map((item) => <option key={item.id} value={item.id}>{item.title}{item.submittedCount > item.reviewedCount ? ` · 待批改 ${item.submittedCount - item.reviewedCount}` : ""}</option>)}
      </select></label> : null}
      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {notice ? <Notify tone="success" message={notice} onClose={() => setNotice("")} /> : null}
      {loading && !assignments.length ? <BrandLoader label="正在加载作业列表" /> : null}
      {detailLoading && !detail ? <BrandLoader label="正在加载提交记录" size="sm" /> : null}
      {listLoaded && !loading && !error && assignments.length === 0 ? <section className="admin-panel p-5 text-sm text-[var(--admin-muted)]">暂无本组作业。</section> : null}
      {assignment ? <>
        <section className="admin-panel flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm" aria-label="作业统计">
          <strong className="text-[var(--admin-text)]">{assignment.title}</strong>
          <span>截止 {formatAssignmentDate(assignment.dueAt)}</span>
          <span>{assignment.isGroupWide ? "全组实时接收" : "指定成员"} · 接收 {assignment.targetCount} 人</span>
        </section>
         <section className="admin-panel divide-y divide-[var(--admin-border-subtle)] p-4 sm:p-5" aria-label="成员提交情况">
          {detail && detail.members.length > 0 ? <div className="grid grid-cols-3 gap-2 pb-4" role="group" aria-label="成员进度筛选">
            {([
              { value: "toSubmit", label: "待提交（含返修）", count: toSubmit.length },
              { value: "toReview", label: "待批改", count: toReview.length },
              { value: "passed", label: "已通过", count: passed.length },
            ] as const).map(({ value, label, count }) => <button key={value} type="button"
              className={`rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${submissionFilter === value ? "border-[var(--admin-text)] bg-[var(--admin-surface-subtle)]" : "border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] hover:border-[var(--admin-hover-border)]"}`}
              aria-pressed={submissionFilter === value} onClick={() => setSubmissionFilter(value)}>
              <span className="block text-sm text-[var(--admin-muted)]">{label}</span>
              <strong className="mt-1 block text-2xl tabular-nums text-[var(--admin-text)]">{count}</strong>
            </button>)}
          </div> : null}
          {detail && visibleMembers.length === 0 ? <p role="status" className="py-3 text-sm text-[var(--admin-muted)]">{detail.members.length === 0 ? "该作业当前没有分配成员。" : submissionFilter === "toSubmit" ? "当前没有待提交或返修的成员。" : submissionFilter === "toReview" ? "当前没有待批改的提交。" : "当前没有已通过的成员。"}</p> : null}
          {visibleMembers.map((member) => {
            const latest = member.latestSubmission;
            const lastReview = latest?.reviews.at(-1);
            const active = latest?.id === editingReviewID;
            return <article key={member.userId} className="py-5 first:pt-4 last:pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight text-[var(--admin-text)]">{member.name}</h2>
                  <span className="text-xs tabular-nums text-[var(--admin-muted)]">#{member.userId}</span>
                  <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${member.status === "passed" ? "border-[var(--admin-success-border)] bg-[var(--admin-success-surface)] text-[var(--admin-success)]" : member.status === "pending" ? "border-[var(--admin-border-subtle)] text-[var(--admin-muted)]" : "border-[var(--admin-warning-border)] bg-[var(--admin-warning-surface)] text-[var(--admin-warning)]"}`}>
                    {member.status === "submitted" ? "待批改" : assignmentStatusLabel(member.status)}
                  </span>
                </div>
                {latest ? <div className="text-right text-xs leading-5 text-[var(--admin-muted)]">
                  <span>第 {latest.attempt} 次提交</span><span className="mx-1.5">·</span>
                  <time dateTime={latest.submittedAt}>{formatAssignmentDate(latest.submittedAt)}</time>
                  {latest.isLate ? <span className="ml-1 text-[var(--admin-warning)]">逾期</span> : null}
                </div> : null}
              </div>
              {!latest ? <p className="mt-3 text-sm text-[var(--admin-muted)]">尚未提交</p> : <>
                <div className="mt-3 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
                  <div className="min-w-0 space-y-3">
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-[var(--admin-muted)]">提交附件</p>
                      <ul className="flex flex-wrap gap-2">
                        {latest.files.map((file) => <li key={file.id} className="min-w-0 max-w-full">
                          <a className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] px-3 py-2 text-sm text-[var(--admin-text)] transition-colors hover:border-[var(--admin-hover-border)] hover:bg-[var(--admin-surface-hover)]" href={file.downloadUrl}>
                            <span aria-hidden="true" className="text-[var(--admin-muted)]">↗</span><span className="min-w-0 truncate">{file.fileName}</span>
                          </a>
                        </li>)}
                      </ul>
                    </div>
                    {member.submissions.length > 1 || latest.reviews.length > 0 ? <details className="text-sm">
                      <summary className="w-fit cursor-pointer rounded-md py-1 text-[var(--admin-muted)] hover:text-[var(--admin-text)]">提交与批改历史（{member.submissions.length} 次）</summary>
                      <div className="mt-2 space-y-2">
                        {member.submissions.map((submission) => <div key={submission.id} className="rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface-subtle)] p-3">
                          <p className="text-xs text-[var(--admin-muted)]">第 {submission.attempt} 次 · {formatAssignmentDate(submission.submittedAt)}</p>
                          <ul className="mt-2 flex flex-wrap gap-2">{submission.files.map((file) => <li key={file.id}><a className="text-sm text-[var(--admin-accent-text)] underline-offset-2 hover:underline" href={file.downloadUrl}>{file.fileName}</a></li>)}</ul>
                          {submission.reviews.map((review) => <div key={review.id} className="mt-2 border-t border-[var(--admin-border-subtle)] pt-2">
                            <p className="text-xs font-medium text-[var(--admin-text)]">{review.score} 分 · {assignmentDecisionLabel(review.decision)} · {formatAssignmentDate(review.createdAt)}</p>
                            {review.comment ? <CommunityMarkdown source={review.comment} className="mt-2 whitespace-pre-wrap text-sm" /> : null}
                          </div>)}
                        </div>)}
                      </div>
                    </details> : null}
                  </div>
                  <div className="min-w-0">
                    {lastReview ? <div className="rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-surface-subtle)] p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[var(--admin-text)]">{lastReview.score} 分 · {assignmentDecisionLabel(lastReview.decision)}</span>
                        <button type="button" className="admin-button admin-button--quiet admin-button--small" disabled={savingID !== 0} onClick={() => editReview(latest.id, lastReview)}>{active ? "收起修改" : "修改批改"}</button>
                      </div>
                      {lastReview.comment ? <CommunityMarkdown source={lastReview.comment} className="mt-2 whitespace-pre-wrap text-sm" /> : <p className="mt-1 text-xs text-[var(--admin-muted)]">未填写评语</p>}
                    </div> : <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--admin-border-subtle)] px-3 py-3 sm:px-4">
                      <span className="text-sm text-[var(--admin-muted)]">尚未批改</span>
                      <button type="button" className={`admin-button admin-button--small ${active ? "admin-button--secondary" : "admin-button--primary"}`} disabled={savingID !== 0} onClick={() => editReview(latest.id)}>{active ? "收起批改" : "批改此份"}</button>
                    </div>}
                  </div>
                </div>
                {active ? <div className="mt-4 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-subtle)] p-3 sm:p-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(110px,0.35fr)_minmax(160px,0.65fr)]">
                    <label className="admin-field-label">评分
                      <input autoFocus className={fieldClass} type="number" min={0} max={100} step={1} inputMode="numeric" placeholder="0–100" value={draftFor(latest.id).score} onChange={(event) => updateDraft(latest.id, { score: event.target.value })} disabled={savingID !== 0} />
                    </label>
                    <label className="admin-field-label">结果
                      <select className="admin-field w-full" value={draftFor(latest.id).decision} onChange={(event) => updateDraft(latest.id, { decision: event.target.value as "passed" | "needs_redo" })} disabled={savingID !== 0}>
                        <option value="passed">通过</option><option value="needs_redo">退回重做</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 min-w-0 space-y-2">
                    <p className="admin-field-label">评语（可插入图片）</p>
                    <Suspense fallback={<BrandLoader label="正在加载评语编辑器" size="sm" />}>
                      <ReviewEditor key={latest.id} value={draftFor(latest.id).comment} onChange={(comment) => updateDraft(latest.id, { comment })} flushRef={reviewFlushRef} uploads={reviewUploads} onUploadsChange={(next) => { reviewUploadsRef.current = next; setReviewUploads(next); }} disabled={savingID !== 0} compact placeholder="填写修改建议，可粘贴截图或插入图片…" />
                    </Suspense>
                  </div>
                  {reviewError ? <p role="alert" className="mt-3 text-sm text-[var(--admin-danger)]">{reviewError}</p> : null}
                  <div className="mt-3 flex justify-end">
                    <button type="button" className="admin-button admin-button--primary" disabled={savingID !== 0 || draftFor(latest.id).score.trim() === ""} onClick={() => void review(latest.id)}>
                      {savingID === latest.id ? "正在保存…" : lastReview ? "保存修改" : "保存批改"}
                    </button>
                  </div>
                </div> : null}
              </>}
            </article>;
          })}
        </section>
      </> : null}
    </section>
  );
}