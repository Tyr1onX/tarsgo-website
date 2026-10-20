import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext, useSearchParams } from "react-router";

import { QuestionActionBar, TrainingQuestionThread } from "~/components/training-question-thread";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { isTechnicalGroupName } from "~/lib/dashboard-navigation";
import { formatQuestionDate, questionStatusLabel, trainingQuestionClient, type TrainingQuestion, type TrainingQuestionDetail } from "~/lib/training-question-client";
import { useAssignmentGroups } from "~/lib/use-assignment-groups";

export function meta() {
  return [{ title: "提问答疑 | TARSGO" }];
}

const fieldClass = "admin-field w-full";

export default function TrainingQuestionsRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams] = useSearchParams();
  const requestedGroupID = Number(searchParams.get("groupId")) || 0;
  const requestedQuestionID = Number(searchParams.get("questionId")) || 0;
  const memberGroups = groupResolution?.groups.map(({ groupId, name }) => ({ groupId, name }));
  const { technicalGroups, loading: groupsLoading, error: groupError } = useAssignmentGroups(currentUser.id, currentUser.role.name, memberGroups);
  const [groupId, setGroupId] = useState(0);
  const [items, setItems] = useState<TrainingQuestion[]>([]);
  const [detail, setDetail] = useState<TrainingQuestionDetail | null>(null);
  const [selectedID, setSelectedID] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"" | "open" | "solved">("");
  const [faqOnly, setFaqOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const questionFilesRef = useRef<HTMLInputElement>(null);
  const replyFilesRef = useRef<HTMLInputElement>(null);
  const activeGroups = useMemo(() => technicalGroups.filter((group) => isTechnicalGroupName(group.name)), [technicalGroups]);

  useEffect(() => {
    setItems([]);
    setDetail(null);
    setSelectedID(requestedQuestionID);
    setGroupId((current) => activeGroups.some((group) => group.groupId === requestedGroupID)
      ? requestedGroupID
      : activeGroups.some((group) => group.groupId === current) ? current : activeGroups[0]?.groupId ?? 0);
  }, [currentUser.id, groupResolution, activeGroups, requestedGroupID, requestedQuestionID]);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setLoading(true);
    setError("");
    trainingQuestionClient.listMember({ groupId, q: keyword, status, faqOnly, mineOnly })
      .then((result) => {
        if (!active) return;
        setItems(result);
        if (!result.some((item) => item.id === selectedID) && selectedID !== requestedQuestionID) {
          setSelectedID(result[0]?.id ?? 0);
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "问题列表加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId, keyword, status, faqOnly, mineOnly, currentUser.id, requestedQuestionID]);

  useEffect(() => {
    if (!selectedID) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetail(null);
    trainingQuestionClient.getMember(selectedID)
      .then((result) => { if (active) setDetail(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "问题详情加载失败"); });
    return () => { active = false; };
  }, [selectedID, currentUser.id]);

  async function reload(questionId = selectedID) {
    const result = await trainingQuestionClient.listMember({ groupId, q: keyword, status, faqOnly, mineOnly });
    setItems(result);
    if (questionId && result.some((item) => item.id === questionId)) setSelectedID(questionId);
    else setSelectedID(result[0]?.id ?? 0);
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await trainingQuestionClient.create(groupId, {
        title,
        body,
        visibility,
        files: Array.from(questionFilesRef.current?.files ?? []),
      });
      setTitle("");
      setBody("");
      setVisibility("public");
      if (questionFilesRef.current) questionFilesRef.current.value = "";
      setShowComposer(false);
      setNotice("问题已发布。");
      await reload(result.question.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布问题失败");
    } finally {
      setSaving(false);
    }
  }

  async function postReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await trainingQuestionClient.replyMember(detail.question.id, {
        kind: currentUser.id === detail.question.askerId ? "follow_up" : "answer",
        body: reply,
        files: Array.from(replyFilesRef.current?.files ?? []),
      });
      setReply("");
      if (replyFilesRef.current) replyFilesRef.current.value = "";
      setDetail(result);
      setNotice(currentUser.id === result.question.askerId ? "追问已发布。" : "回答已发布。");
      await reload(result.question.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布回复失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSolved() {
    if (!detail) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await trainingQuestionClient.solveMember(detail.question.id, !detail.question.isSolved);
      setDetail(result);
      setNotice(result.question.isSolved ? "问题已标记为解决。" : "问题已重新打开。");
      await reload(result.question.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新问题状态失败");
    } finally {
      setSaving(false);
    }
  }

  const canChangeSolved = Boolean(detail && (detail.question.askerId === currentUser.id || currentUser.role.name === "admin"));

  return (
    <section className="admin-design space-y-5" aria-labelledby="training-questions-title">
      <header className="admin-page-header flex flex-wrap items-center justify-between gap-3">
        <h1 id="training-questions-title" className="admin-page-title">提问答疑</h1>
        {activeGroups.length > 1 ? <label className="admin-field-label">技术组<select className={fieldClass} value={groupId} onChange={(event) => { setGroupId(Number(event.target.value)); setSelectedID(0); }}>
          {activeGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
        </select></label> : activeGroups[0] ? <p className="text-sm text-[var(--admin-muted)]">{activeGroups[0].name}</p> : null}
      </header>

      {groupError ? <p role="alert" className="rounded-lg border border-[var(--admin-danger)] bg-[var(--admin-danger-surface)] px-3 py-2 text-sm text-[var(--admin-danger)]">{groupError}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-[var(--admin-danger)] bg-[var(--admin-danger-surface)] px-3 py-2 text-sm text-[var(--admin-danger)]">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-[var(--admin-success)] bg-[var(--admin-success-surface)] px-3 py-2 text-sm text-[var(--admin-success)]">{notice}</p> : null}

      <section className="admin-panel space-y-3 p-4 sm:p-5" aria-label="搜索问题">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="admin-field-label">搜索问题与 FAQ<input className={fieldClass} type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入关键词" /></label>
          <label className="admin-field-label">状态<select className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="">全部状态</option><option value="open">待解决</option><option value="solved">已解决</option>
          </select></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`admin-button ${!faqOnly && !mineOnly ? "admin-button--primary" : "admin-button--secondary"}`} onClick={() => { setFaqOnly(false); setMineOnly(false); }}>全部问题</button>
          <button type="button" className={`admin-button ${faqOnly ? "admin-button--primary" : "admin-button--secondary"}`} onClick={() => { setFaqOnly(true); setMineOnly(false); }}>FAQ</button>
          <button type="button" className={`admin-button ${mineOnly ? "admin-button--primary" : "admin-button--secondary"}`} onClick={() => { setMineOnly(true); setFaqOnly(false); }}>我的问题</button>
          <button type="button" className="admin-button admin-button--quiet ml-auto" onClick={() => setShowComposer((value) => !value)}>{showComposer ? "收起" : "提问"}</button>
        </div>
        {showComposer ? <form className="grid gap-3 border-t border-[var(--admin-border-subtle)] pt-4" onSubmit={ask}>
          <label className="admin-field-label">标题<input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required /></label>
          <label className="admin-field-label">问题<textarea className={`${fieldClass} min-h-36`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={20000} required placeholder="可以粘贴代码块：用三个反引号包住代码" /></label>
          <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-end">
            <label className="admin-field-label">范围<select className={fieldClass} value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="public">公开给本组</option><option value="private">仅自己和管理员</option></select></label>
            <label className="admin-field-label">图片<input ref={questionFilesRef} className={fieldClass} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple /></label>
          </div>
          <div><button type="submit" className="admin-button admin-button--primary" disabled={saving || !groupId}>{saving ? "发布中…" : "发布问题"}</button></div>
        </form> : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.7fr)]">
        <section className="admin-panel overflow-hidden" aria-label="问题列表">
          <div className="flex items-center justify-between border-b border-[var(--admin-border-subtle)] px-4 py-3 text-sm"><strong className="text-white">问题</strong><span className="text-xs text-[var(--admin-muted)]">{loading || groupsLoading ? "加载中" : `${items.length} 条`}</span></div>
          {items.length ? <div className="divide-y divide-[var(--admin-border-subtle)]">
            {items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedID(item.id)} className={`w-full px-4 py-3 text-left ${selectedID === item.id ? "bg-amber-400/10" : "hover:bg-white/[0.035]"}`}>
              <span className="flex items-start justify-between gap-2"><strong className="line-clamp-2 text-sm text-white">{item.title}</strong><span className="shrink-0 text-[11px] text-[var(--admin-muted)]">{questionStatusLabel(item)}</span></span>
              <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--admin-muted)]"><span>{item.askerName}</span><span>{formatQuestionDate(item.lastReplyAt ?? item.createdAt)}</span><span>{item.postCount} 条回复</span></span>
              {item.isFaq ? <span className="mt-2 inline-block rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] text-amber-200">FAQ</span> : null}
            </button>)}
          </div> : <p className="px-4 py-6 text-sm text-[var(--admin-muted)]">{loading ? "" : "没有匹配的问题"}</p>}
        </section>

        <section className="space-y-4">
          {detail ? <>
            <QuestionActionBar>
              {canChangeSolved ? <button type="button" className="admin-button admin-button--secondary" onClick={() => void toggleSolved()} disabled={saving}>{detail.question.isSolved ? "重新打开" : "标记已解决"}</button> : null}
            </QuestionActionBar>
            <TrainingQuestionThread detail={detail} />
            {!detail.question.isSolved ? <form className="admin-panel space-y-3 p-4 sm:p-5" onSubmit={postReply}>
              <label className="admin-field-label">{currentUser.id === detail.question.askerId ? "追问" : "回答"}<textarea className={`${fieldClass} min-h-28`} value={reply} onChange={(event) => setReply(event.target.value)} maxLength={20000} required /></label>
              <div className="flex flex-wrap items-end justify-between gap-3"><label className="admin-field-label">图片<input ref={replyFilesRef} className={fieldClass} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple /></label><button type="submit" className="admin-button admin-button--primary" disabled={saving}>{saving ? "发布中…" : currentUser.id === detail.question.askerId ? "发布追问" : "发布回答"}</button></div>
            </form> : null}
          </> : <div className="admin-panel px-5 py-10 text-center text-sm text-[var(--admin-muted)]">{selectedID ? "正在加载问题…" : "选择一条问题查看讨论"}</div>}
        </section>
      </div>
    </section>
  );
}
