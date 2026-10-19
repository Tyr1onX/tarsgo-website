import { useEffect, useState } from "react";
import { useSearchParams, useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { assignmentClient, assignmentDecisionLabel, assignmentStatusLabel, formatAssignmentDate, type AdminAssignmentDetail, type Assignment } from "~/lib/assignment-client";
import { hasTechnicalGroupAccess } from "~/lib/dashboard-navigation";

export function meta() {
  return [{ title: "提交记录 | TARSGO" }];
}

const fieldClass = "admin-field w-full";

export default function AssignmentSubmissionsRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedID = Number(searchParams.get("assignmentId")) || 0;
  const technicalGroups = (groupResolution?.groups ?? []).filter((group) => hasTechnicalGroupAccess([group]));
  const [groupId, setGroupId] = useState(0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedID, setSelectedID] = useState(requestedID);
  const [detail, setDetail] = useState<AdminAssignmentDetail | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<number, { score: string; decision: "passed" | "needs_redo"; comment: string }>>({});
  const [loading, setLoading] = useState(false);
  const [savingID, setSavingID] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setAssignments([]);
    setDetail(null);
    setSelectedID(0);
    setReviewDrafts({});
    setGroupId((current) => technicalGroups.some((group) => group.groupId === current) ? current : technicalGroups[0]?.groupId ?? 0);
  }, [currentUser.id, groupResolution]);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setLoading(true);
    setError("");
    assignmentClient.listAdmin(groupId).then((items) => {
      if (!active) return;
      setAssignments(items);
      const nextID = items.some((item) => item.id === requestedID) ? requestedID : items[0]?.id ?? 0;
      setSelectedID(nextID);
      if (nextID) setSearchParams({ assignmentId: String(nextID) }, { replace: true });
      else setDetail(null);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "作业列表加载失败");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId, currentUser.id]);

  useEffect(() => {
    if (!selectedID) return;
    let active = true;
    setDetail(null);
    setError("");
    assignmentClient.getAdmin(selectedID).then((value) => { if (active) setDetail(value); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "提交记录加载失败"); });
    return () => { active = false; };
  }, [selectedID, currentUser.id]);

  function draftFor(submissionID: number) {
    return reviewDrafts[submissionID] ?? { score: "", decision: "passed" as const, comment: "" };
  }

  function updateDraft(submissionID: number, patch: Partial<ReturnType<typeof draftFor>>) {
    setReviewDrafts((current) => ({ ...current, [submissionID]: { ...draftFor(submissionID), ...patch } }));
  }

  async function review(submissionID: number) {
    const draft = draftFor(submissionID);
    if (draft.score === "") {
      setError("请填写 0 至 100 分的成绩。");
      return;
    }
    setSavingID(submissionID);
    setError("");
    setNotice("");
    try {
      const updated = await assignmentClient.review(submissionID, { score: Number(draft.score), decision: draft.decision, comment: draft.comment });
      setDetail(updated);
      setNotice("批改结果已保存。");
      syncReviewDrafts(updated);
      setAssignments(await assignmentClient.listAdmin(groupId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存批改结果失败");
    } finally {
      setSavingID(0);
    }
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
    setSearchParams(id ? { assignmentId: String(id) } : {}, { replace: true });
    setNotice("");
  }

  const assignment = detail?.assignment;
  return (
    <section className="admin-design space-y-5" aria-labelledby="assignment-submissions-title">
      <header className="admin-page-header flex flex-wrap items-center justify-between gap-3">
        <h1 id="assignment-submissions-title" className="admin-page-title">提交记录</h1>
        {technicalGroups.length > 1 ? <label className="admin-field-label">技术组<select className="admin-field w-full" value={groupId} onChange={(event) => { setGroupId(Number(event.target.value)); setSelectedID(0); setDetail(null); }}>
          {technicalGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
        </select></label> : technicalGroups[0] ? <p className="text-sm text-[var(--admin-muted)]">{technicalGroups[0].name}</p> : null}
      </header>
      {assignments.length > 0 ? <label className="admin-field-label">作业<select className="admin-field w-full" value={selectedID} onChange={(event) => chooseAssignment(Number(event.target.value))}>
        {assignments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label> : null}
      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {notice ? <div role="status" className="admin-notice admin-notice--success">{notice}</div> : null}
      {loading ? <p role="status" className="py-6 text-sm text-[var(--admin-muted)]">正在加载…</p> : null}
      {!loading && assignments.length === 0 ? <section className="admin-panel p-5 text-sm text-[var(--admin-muted)]">暂无本组作业。</section> : null}
      {assignment ? <>
        <section className="admin-panel flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm" aria-label="作业统计">
          <strong className="text-white">{assignment.title}</strong>
          <span>截止 {formatAssignmentDate(assignment.dueAt)}</span>
          <span>已提交 {assignment.submittedCount}/{assignment.targetCount}</span>
          <span>已批改 {assignment.reviewedCount}</span>
          <span>已通过 {assignment.passedCount}</span>
        </section>
        <section className="admin-panel divide-y divide-[var(--admin-border-subtle)] p-4 sm:p-5" aria-label="成员提交情况">
          {detail?.members.map((member) => <article key={member.userId} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-white">{member.name}</h2><div className="flex items-center gap-2 text-xs text-[var(--admin-muted)]"><span>{assignmentStatusLabel(member.status)}</span>{member.isLate ? <span className="text-amber-300">逾期提交</span> : null}</div></div>
            {!member.latestSubmission ? <p className="mt-2 text-sm text-[var(--admin-muted)]">尚未提交</p> : <>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--admin-muted)]"><span>第 {member.latestSubmission.attempt} 次提交 · {formatAssignmentDate(member.latestSubmission.submittedAt)}{member.latestSubmission.isLate ? " · 逾期" : ""}</span><span>{member.latestSubmission.status === "graded" ? `${assignmentDecisionLabel(member.latestSubmission.decision)} · ${member.latestSubmission.reviews.at(-1)?.score ?? "—"} 分` : "待批改"}</span></div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">{member.latestSubmission.files.map((file) => <li key={file.id}><a className="text-amber-300 hover:text-amber-200" href={file.downloadUrl}>{file.fileName}</a></li>)}</ul>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-[var(--admin-muted)]">查看提交与批改历史（{member.submissions.length}）</summary>
                <div className="mt-3 space-y-3">{member.submissions.map((submission) => <div key={submission.id} className="rounded-lg border border-[var(--admin-border-subtle)] p-3">
                  <p className="text-xs text-[var(--admin-muted)]">第 {submission.attempt} 次 · {formatAssignmentDate(submission.submittedAt)}{submission.isLate ? " · 逾期" : ""}</p>
                  <ul className="mt-2 space-y-1">{submission.files.map((file) => <li key={file.id}><a className="text-amber-300 hover:text-amber-200" href={file.downloadUrl}>{file.fileName}</a></li>)}</ul>
                  {submission.reviews.map((review) => <div key={review.id} className="mt-2 border-t border-[var(--admin-border-subtle)] pt-2 text-sm"><p>{review.score} 分 · {assignmentDecisionLabel(review.decision)} · {formatAssignmentDate(review.createdAt)}</p>{review.comment ? <p className="mt-1 whitespace-pre-wrap text-[var(--admin-muted)]">{review.comment}</p> : null}</div>)}
                </div>)}</div>
              </details>
              <div className="mt-3 grid gap-3 sm:grid-cols-[100px_150px_minmax(0,1fr)_auto] sm:items-end">
                <label className="admin-field-label">评分<input className={fieldClass} type="number" min={0} max={100} value={draftFor(member.latestSubmission.id).score} onChange={(event) => updateDraft(member.latestSubmission!.id, { score: event.target.value })} /></label>
                <label className="admin-field-label">结果<select className="admin-field w-full" value={draftFor(member.latestSubmission.id).decision} onChange={(event) => updateDraft(member.latestSubmission!.id, { decision: event.target.value as "passed" | "needs_redo" })}><option value="passed">通过</option><option value="needs_redo">退回重做</option></select></label>
                <label className="admin-field-label">评语<textarea className={fieldClass} rows={2} maxLength={5000} value={draftFor(member.latestSubmission.id).comment} onChange={(event) => updateDraft(member.latestSubmission!.id, { comment: event.target.value })} /></label>
                <button type="button" className="admin-button admin-button--primary" disabled={savingID === member.latestSubmission.id || draftFor(member.latestSubmission.id).score === ""} onClick={() => void review(member.latestSubmission!.id)}>{savingID === member.latestSubmission.id ? "保存中…" : member.latestSubmission.status === "graded" ? "更新批改" : "保存批改"}</button>
              </div>
            </>}
          </article>)}
        </section>
      </> : null}
    </section>
  );
}
