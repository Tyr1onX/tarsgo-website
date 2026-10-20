import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import { QuestionActionBar, TrainingQuestionThread } from "~/components/training-question-thread";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { formatQuestionDate, questionStatusLabel, trainingQuestionClient, type TrainingQuestion, type TrainingQuestionDetail } from "~/lib/training-question-client";
import { useAssignmentGroups } from "~/lib/use-assignment-groups";

export function meta() {
  return [{ title: "答疑管理 | TARSGO" }];
}

const fieldClass = "admin-field w-full";

export default function TrainingQuestionManagementRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const memberGroups = groupResolution?.groups.map(({ groupId, name }) => ({ groupId, name }));
  const { technicalGroups, loading: groupsLoading, error: groupError } = useAssignmentGroups(currentUser.id, currentUser.role.name, memberGroups);
  const [groupId, setGroupId] = useState(0);
  const [items, setItems] = useState<TrainingQuestion[]>([]);
  const [selectedID, setSelectedID] = useState(0);
  const [detail, setDetail] = useState<TrainingQuestionDetail | null>(null);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"" | "open" | "solved">("");
  const [faqOnly, setFaqOnly] = useState(false);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const filesRef = useRef<HTMLInputElement>(null);
  const activeGroups = useMemo(() => technicalGroups, [technicalGroups]);
  const isSuperAdmin = currentUser.role.name === "super_admin";

  useEffect(() => {
    setItems([]);
    setDetail(null);
    setSelectedID(0);
    if (isSuperAdmin) setGroupId(0);
    else setGroupId((current) => activeGroups.some((group) => group.groupId === current) ? current : activeGroups[0]?.groupId ?? 0);
  }, [currentUser.id, groupResolution, activeGroups, isSuperAdmin]);

  useEffect(() => {
    if (!groupsLoading && !groupId && !isSuperAdmin) return;
    if (groupsLoading) return;
    let active = true;
    setLoading(true);
    setError("");
    trainingQuestionClient.listAdmin({ groupId: groupId || undefined, q: keyword, status, faqOnly })
      .then((result) => {
        if (!active) return;
        setItems(result);
        if (!result.some((item) => item.id === selectedID)) setSelectedID(result[0]?.id ?? 0);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "问题列表加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId, keyword, status, faqOnly, currentUser.id, groupsLoading, isSuperAdmin]);

  useEffect(() => {
    if (!selectedID) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetail(null);
    trainingQuestionClient.getAdmin(selectedID)
      .then((result) => { if (active) setDetail(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "问题详情加载失败"); });
    return () => { active = false; };
  }, [selectedID, currentUser.id]);

  async function reload(questionId = selectedID) {
    const result = await trainingQuestionClient.listAdmin({ groupId: groupId || undefined, q: keyword, status, faqOnly });
    setItems(result);
    if (questionId && result.some((item) => item.id === questionId)) setSelectedID(questionId);
    else setSelectedID(result[0]?.id ?? 0);
  }

  async function answer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await trainingQuestionClient.replyAdmin(detail.question.id, reply, Array.from(filesRef.current?.files ?? []));
      setReply("");
      if (filesRef.current) filesRef.current.value = "";
      setDetail(result);
      setNotice("回答已发布。");
      await reload(result.question.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布回答失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateSolved() {
    if (!detail) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await trainingQuestionClient.solveAdmin(detail.question.id, !detail.question.isSolved);
      setDetail(result);
      setNotice(result.question.isSolved ? "问题已标记为解决。" : "问题已重新打开，FAQ 标记已取消。");
      await reload(result.question.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新问题状态失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateFAQ() {
    if (!detail) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await trainingQuestionClient.setFAQ(detail.question.id, !detail.question.isFaq);
      setDetail(result);
      setNotice(result.question.isFaq ? "已加入 FAQ。" : "已从 FAQ 中移除。");
      await reload(result.question.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新 FAQ 失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-design space-y-5" aria-labelledby="training-question-management-title">
      <header className="admin-page-header flex flex-wrap items-center justify-between gap-3">
        <h1 id="training-question-management-title" className="admin-page-title">答疑管理</h1>
        {activeGroups.length > 1 || isSuperAdmin ? <label className="admin-field-label">技术组<select className="admin-field w-full" value={groupId} onChange={(event) => { setGroupId(Number(event.target.value)); setSelectedID(0); }}>
          {isSuperAdmin ? <option value={0}>全部技术组</option> : null}
          {activeGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
        </select></label> : activeGroups[0] ? <p className="text-sm text-[var(--admin-muted)]">{activeGroups[0].name}</p> : null}
      </header>

      {groupError ? <p role="alert" className="rounded-lg border border-[var(--admin-danger)] bg-[var(--admin-danger-surface)] px-3 py-2 text-sm text-[var(--admin-danger)]">{groupError}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-[var(--admin-danger)] bg-[var(--admin-danger-surface)] px-3 py-2 text-sm text-[var(--admin-danger)]">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-[var(--admin-success)] bg-[var(--admin-success-surface)] px-3 py-2 text-sm text-[var(--admin-success)]">{notice}</p> : null}

      <section className="admin-panel grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end" aria-label="筛选问题">
        <label className="admin-field-label">搜索问题与回答<input className={fieldClass} type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入关键词" /></label>
        <label className="admin-field-label">状态<select className="admin-field w-full" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="">全部状态</option><option value="open">待解决</option><option value="solved">已解决</option></select></label>
        <button type="button" className={`admin-button ${faqOnly ? "admin-button--primary" : "admin-button--secondary"}`} onClick={() => setFaqOnly((value) => !value)}>{faqOnly ? "查看全部" : "仅看 FAQ"}</button>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.7fr)]">
        <section className="admin-panel overflow-hidden" aria-label="问题列表">
          <div className="flex items-center justify-between border-b border-[var(--admin-border-subtle)] px-4 py-3 text-sm"><strong className="text-white">问题</strong><span className="text-xs text-[var(--admin-muted)]">{loading || groupsLoading ? "加载中" : `${items.length} 条`}</span></div>
          {items.length ? <div className="divide-y divide-[var(--admin-border-subtle)]">
            {items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedID(item.id)} className={`w-full px-4 py-3 text-left ${selectedID === item.id ? "bg-amber-400/10" : "hover:bg-white/[0.035]"}`}>
              <span className="flex items-start justify-between gap-2"><strong className="line-clamp-2 text-sm text-white">{item.title}</strong><span className="shrink-0 text-[11px] text-[var(--admin-muted)]">{questionStatusLabel(item)}</span></span>
              <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--admin-muted)]"><span>{item.groupName} · {item.askerName}</span><span>{formatQuestionDate(item.lastReplyAt ?? item.createdAt)}</span><span>{item.postCount} 条回复</span></span>
              {item.isFaq ? <span className="mt-2 inline-block rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] text-amber-200">FAQ</span> : null}
            </button>)}
          </div> : <p className="px-4 py-6 text-sm text-[var(--admin-muted)]">{loading ? "" : "没有匹配的问题"}</p>}
        </section>

        <section className="space-y-4">
          {detail ? <>
            <QuestionActionBar>
              <button type="button" className="admin-button admin-button--secondary" onClick={() => void updateSolved()} disabled={saving}>{detail.question.isSolved ? "重新打开" : "标记已解决"}</button>
              {detail.question.isSolved && detail.question.visibility === "public" ? <button type="button" className="admin-button admin-button--secondary" onClick={() => void updateFAQ()} disabled={saving}>{detail.question.isFaq ? "取消 FAQ" : "加入 FAQ"}</button> : null}
            </QuestionActionBar>
            <TrainingQuestionThread detail={detail} />
            {!detail.question.isSolved ? <form className="admin-panel space-y-3 p-4 sm:p-5" onSubmit={answer}>
              <label className="admin-field-label">回答<textarea className={`${fieldClass} min-h-28`} value={reply} onChange={(event) => setReply(event.target.value)} maxLength={20000} required /></label>
              <div className="flex flex-wrap items-end justify-between gap-3"><label className="admin-field-label">图片<input ref={filesRef} className={fieldClass} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple /></label><button type="submit" className="admin-button admin-button--primary" disabled={saving}>{saving ? "发布中…" : "发布回答"}</button></div>
            </form> : null}
          </> : <div className="admin-panel px-5 py-10 text-center text-sm text-[var(--admin-muted)]">{selectedID ? "正在加载问题…" : "选择一条问题查看讨论"}</div>}
        </section>
      </div>
    </section>
  );
}
