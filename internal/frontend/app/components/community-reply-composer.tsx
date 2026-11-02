import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";

import { CommunityIcon } from "~/components/community-icons";
import type { CommunityPendingImage } from "~/components/community-markdown-editor";
import type { CommunityComment } from "~/lib/community-client";
import { clearCommunityReplyDraft, loadCommunityReplyDraft, saveCommunityReplyDraft, type CommunityReplyDraft } from "~/lib/community-draft";
import { stripCommunityMarkdown } from "~/lib/community-markdown";

const CommunityMarkdownEditor = lazy(() => import("~/components/community-markdown-editor").then((module) => ({ default: module.CommunityMarkdownEditor })));

export function CommunityReplyComposer({ accountId, postId, busy = false, comments, replyTarget, onReplyTargetChange, onClose, onSubmit }: {
  accountId: number;
  postId: number;
  busy?: boolean;
  comments: CommunityComment[];
  replyTarget: CommunityComment | null;
  onReplyTargetChange: (target: CommunityComment | null) => void;
  onClose: () => void;
  onSubmit: (input: { body: string; parentPostId?: number; files: File[]; uploadTokens: string[] }) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [uploads, setUploads] = useState<CommunityPendingImage[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"empty" | "saving" | "saved" | "failed">("empty");
  const [error, setError] = useState("");
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startLeft: number; startTop: number; header: HTMLElement } | null>(null);
  const [dragging, setDragging] = useState(false);
  const latestDraftRef = useRef({ accountId, postId, body, uploads, ready, saving, replyTarget });
  const completedRef = useRef(false);
  const persistedOnCloseRef = useRef(false);
  latestDraftRef.current = { accountId, postId, body, uploads, ready, saving, replyTarget };

  const persistDraft = useCallback(async (draft: CommunityReplyDraft) => {
    if (draft.body.trim() || draft.files.length || draft.parentPostId) {
      await saveCommunityReplyDraft(accountId, postId, draft);
      setDraftStatus("saved");
    } else {
      await clearCommunityReplyDraft(accountId, postId);
      setDraftStatus("empty");
    }
  }, [accountId, postId]);

  useEffect(() => {
    let active = true;
    setReady(false);
    void loadCommunityReplyDraft(accountId, postId).then((draft) => {
      if (!active) return;
      if (draft) {
        setBody(draft.body);
        setUploads(draft.files.map((file, index) => ({ file, token: draft.uploadTokens?.[index] ?? "" })));
        if (draft.parentPostId) onReplyTargetChange(commentsRef.current.find((item) => item.id === draft.parentPostId) ?? null);
        setDraftStatus("saved");
      }
      setReady(true);
    }).catch(() => {
      if (!active) return;
      setDraftStatus("failed");
      setReady(true);
    });
    return () => { active = false; };
  }, [accountId, postId, onReplyTargetChange]);

  useEffect(() => () => {
    const draft = latestDraftRef.current;
    if (completedRef.current || persistedOnCloseRef.current || !draft.ready || draft.saving) return;
    if (!draft.body.trim() && !draft.uploads.length && !draft.replyTarget) return;
    void saveCommunityReplyDraft(draft.accountId, draft.postId, {
      body: draft.body, files: draft.uploads.map((item) => item.file),
      uploadTokens: draft.uploads.map((item) => item.token), parentPostId: draft.replyTarget?.id, updatedAt: Date.now(),
    });
  }, []);

  useEffect(() => {
    if (!ready || saving) return;
    const hasContent = Boolean(body.trim() || uploads.length || replyTarget);
    const timer = window.setTimeout(() => {
      if (!hasContent) {
        void clearCommunityReplyDraft(accountId, postId).then(() => setDraftStatus("empty")).catch(() => setDraftStatus("failed"));
        return;
      }
      setDraftStatus("saving");
      void saveCommunityReplyDraft(accountId, postId, {
        body, files: uploads.map((item) => item.file), uploadTokens: uploads.map((item) => item.token),
        parentPostId: replyTarget?.id, updatedAt: Date.now(),
      }).then(() => setDraftStatus("saved")).catch(() => setDraftStatus("failed"));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [accountId, body, postId, ready, replyTarget, saving, uploads]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let clampFrame = 0;

    function keepMovedPanelInViewport() {
      clampFrame = 0;
      const activePanel = panelRef.current;
      if (!activePanel) return;
      if (window.matchMedia("(max-width: 767px)").matches) {
        if (activePanel.style.left || activePanel.style.top || activePanel.style.right || activePanel.style.bottom) {
          activePanel.style.removeProperty("left");
          activePanel.style.removeProperty("top");
          activePanel.style.removeProperty("right");
          activePanel.style.removeProperty("bottom");
        }
        if (dragRef.current) {
          dragRef.current = null;
          setDragging(false);
        }
        return;
      }
      if (!activePanel.style.left || !activePanel.style.top) return;
      const rect = activePanel.getBoundingClientRect();
      const margin = 12;
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - rect.width - margin));
      const top = Math.max(margin, Math.min(rect.top, window.innerHeight - rect.height - margin));
      if (Math.abs(left - rect.left) > 0.5) activePanel.style.left = `${left}px`;
      if (Math.abs(top - rect.top) > 0.5) activePanel.style.top = `${top}px`;
    }

    function scheduleViewportClamp() {
      if (clampFrame) return;
      clampFrame = window.requestAnimationFrame(keepMovedPanelInViewport);
    }

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleViewportClamp);
    observer?.observe(panel);
    window.addEventListener("resize", scheduleViewportClamp);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleViewportClamp);
      if (clampFrame) window.cancelAnimationFrame(clampFrame);
    };
  }, []);

  function startPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || !window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      header: event.currentTarget,
    };
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function movePanelDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel || drag.pointerId !== event.pointerId) return;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
    panel.style.left = `${Math.max(margin, Math.min(drag.startLeft + event.clientX - drag.startX, maxLeft))}px`;
    panel.style.top = `${Math.max(margin, Math.min(drag.startTop + event.clientY - drag.startY, maxTop))}px`;
  }

  function endPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.header.hasPointerCapture(event.pointerId)) drag.header.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  }

  async function close() {
    if (busy || saving) return;
    setSaving(true);
    setError("");
    try {
      await persistDraft({
        body, files: uploads.map((item) => item.file), uploadTokens: uploads.map((item) => item.token),
        parentPostId: replyTarget?.id, updatedAt: Date.now(),
      });
      persistedOnCloseRef.current = true;
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复草稿保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || busy || saving || !ready) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit({ body, parentPostId: replyTarget?.id, files: uploads.map((item) => item.file), uploadTokens: uploads.map((item) => item.token) });
      completedRef.current = true;
      await clearCommunityReplyDraft(accountId, postId).catch(() => undefined);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return <aside ref={panelRef} className={`admin-design community-reply-panel${replyTarget ? " has-context" : ""}${dragging ? " is-dragging" : ""}`} role="dialog" aria-modal="false" aria-labelledby="community-reply-panel-title" aria-busy={!ready || busy || saving} onKeyDown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      void close();
    }
  }}>
    <form id="community-reply-form" className="community-reply-panel__form" onSubmit={(event) => void submit(event)} aria-labelledby="community-reply-panel-title">
      <header className="community-reply-panel__header" onPointerDown={startPanelDrag} onPointerMove={movePanelDrag} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag}>
        <div><h2 id="community-reply-panel-title">回复讨论</h2>{replyTarget ? <span>回复 {replyTarget.authorName}</span> : <span>继续阅读原帖并参与讨论</span>}</div>
        <button type="button" className="community-icon-button" aria-label="收起回复编辑器" onClick={() => void close()} disabled={busy || saving}><CommunityIcon name="x" /></button>
      </header>
      {replyTarget ? <div className="community-reply-panel__context"><span>{replyTarget.isDeleted ? "该回复已删除" : stripCommunityMarkdown(replyTarget.body)}</span><button type="button" onClick={() => onReplyTargetChange(null)} aria-label="改为回复话题">回复话题</button></div> : null}
      <div className="community-reply-panel__editor">
        {ready ? <Suspense fallback={<div className="community-markdown-editor__loading" role="status">正在打开编辑器…</div>}><CommunityMarkdownEditor value={body} onChange={(next) => { setBody(next); setError(""); }} uploads={uploads} onUploadsChange={setUploads} compact required disabled={busy || saving} placeholder="参与讨论…" /></Suspense> : <div className="community-markdown-editor__loading" role="status">正在恢复回复草稿…</div>}
      </div>
      <footer className="community-reply-panel__footer">
        <span className={`community-draft-status${draftStatus === "failed" ? " is-error" : ""}`} role="status">{draftStatus === "saving" ? "正在保存草稿" : draftStatus === "saved" ? "草稿已保存到此设备" : draftStatus === "failed" ? "草稿保存失败" : ""}</span>
        {error ? <p className="community-error" role="alert">{error}</p> : null}
        <button type="button" className="community-button community-button--quiet" onClick={() => void close()} disabled={busy || saving}>收起</button>
        <button type="submit" className="community-button community-button--primary" disabled={busy || saving || !ready || !body.trim()}>{busy || saving ? "发送中…" : "回复"}</button>
      </footer>
    </form>
  </aside>;
}
