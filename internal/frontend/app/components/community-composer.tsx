import { BrandLoader } from "~/components/brand-loader";
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";

import { CommunityIcon } from "~/components/community-icons";
import type { CommunityPendingImage } from "~/components/community-markdown-editor";
import { COMMUNITY_CATEGORIES, type CommunityCategory } from "~/lib/community-client";
import { clearCommunityDraft, loadCommunityDraft, saveCommunityDraft } from "~/lib/community-draft";

const CommunityMarkdownEditor = lazy(() => import("~/components/community-markdown-editor").then((module) => ({ default: module.CommunityMarkdownEditor })));

export function CommunityComposer({ id, accountId, onCancel, onPublish }: {
  id: string;
  accountId: number;
  onCancel: () => void;
  onPublish: (input: { category: CommunityCategory; title: string; body: string; files: File[]; uploadTokens: string[] }) => Promise<void>;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<CommunityCategory>("technology");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const editorFlushRef = useRef<() => string>(() => body);
  const [uploads, setUploads] = useState<CommunityPendingImage[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"empty" | "saving" | "saved" | "failed">("empty");
  const persistedOnCloseRef = useRef(false);
  const latestDraftRef = useRef({ accountId, category, title, body, uploads, draftReady, saving });
  latestDraftRef.current = { accountId, category, title, body, uploads, draftReady, saving };

  useEffect(() => {
    let active = true;
    setDraftReady(false);
    void loadCommunityDraft(accountId).then((draft) => {
      if (!active) return;
      if (draft) {
        setCategory(draft.category);
        setTitle(draft.title);
        setBody(draft.body);
        setUploads(draft.files.map((file, index) => ({ file, token: draft.uploadTokens?.[index] ?? "" })));
        setDraftStatus("saved");
      } else {
        setCategory("technology");
        setTitle("");
        setBody("");
        setUploads([]);
        setDraftStatus("empty");
      }
      setDraftReady(true);
    }).catch(() => {
      if (!active) return;
      setDraftStatus("failed");
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [accountId]);

  useEffect(() => {
    if (draftReady) titleRef.current?.focus();
  }, [draftReady]);

  useEffect(() => () => {
    if (persistedOnCloseRef.current) return;
    const draft = latestDraftRef.current;
    if (draft.draftReady && !draft.saving && (draft.title.trim() || draft.body.trim() || draft.uploads.length || draft.category !== "technology")) {
      void saveCommunityDraft(draft.accountId, { category: draft.category, title: draft.title, body: draft.body, files: draft.uploads.map((item) => item.file), uploadTokens: draft.uploads.map((item) => item.token), updatedAt: Date.now() });
    }
  }, []);

  useEffect(() => {
    if (!draftReady || saving) return;
    const hasContent = Boolean(title.trim() || body.trim() || uploads.length || category !== "technology");
    const timer = window.setTimeout(() => {
      if (!hasContent) {
        void clearCommunityDraft(accountId).then(() => setDraftStatus("empty")).catch(() => setDraftStatus("failed"));
        return;
      }
      setDraftStatus("saving");
      void saveCommunityDraft(accountId, { category, title, body, files: uploads.map((item) => item.file), uploadTokens: uploads.map((item) => item.token), updatedAt: Date.now() })
        .then(() => setDraftStatus("saved"))
        .catch(() => setDraftStatus("failed"));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [accountId, body, category, draftReady, uploads, saving, title]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentBody = editorFlushRef.current();
    setSaving(true);
    setError("");
    try {
      await onPublish({ category, title, body: currentBody, files: uploads.map((item) => item.file), uploadTokens: uploads.map((item) => item.token) });
      await clearCommunityDraft(accountId).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "帖子发布失败");
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!draftReady) {
      onCancel();
      return;
    }
    const currentBody = editorFlushRef.current();
    const hasContent = Boolean(title.trim() || currentBody.trim() || uploads.length || category !== "technology");
    setDraftStatus("saving");
    try {
      if (hasContent) {
        await saveCommunityDraft(accountId, { category, title, body: currentBody, files: uploads.map((item) => item.file), uploadTokens: uploads.map((item) => item.token), updatedAt: Date.now() });
        setDraftStatus("saved");
      } else {
        await clearCommunityDraft(accountId);
        setDraftStatus("empty");
      }
      persistedOnCloseRef.current = true;
      onCancel();
    } catch {
      setDraftStatus("failed");
      setError("草稿保存失败，请重试后再收起。");
    }
  }

  return <form id={id} className="community-composer" onSubmit={submit} aria-labelledby="community-composer-title" aria-busy={saving || !draftReady}>
    <div className="community-composer__header">
      <h2 id="community-composer-title">发布帖子</h2>
      <button className="community-icon-button" type="button" aria-label="收起发帖表单" onClick={() => void cancel()}><CommunityIcon name="x" /></button>
    </div>
    <div className="community-composer__fields">
      <label className="community-field">标题
        <input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="这次想聊什么？" disabled={!draftReady || saving} />
      </label>
      <label className="community-field">分类
        <select value={category} onChange={(event) => setCategory(event.target.value as CommunityCategory)} disabled={!draftReady || saving}>
          {COMMUNITY_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <div className="community-field community-field--editor"><span>正文</span>
        {draftReady ? <Suspense fallback={<div className="community-markdown-editor__loading"><BrandLoader label="正在打开编辑器" size="sm" /></div>}><CommunityMarkdownEditor value={body} onChange={setBody} flushRef={editorFlushRef} uploads={uploads} onUploadsChange={setUploads} required disabled={saving} placeholder="分享过程、问题或进展…" /></Suspense> : <div className="community-markdown-editor__loading"><BrandLoader label="正在恢复草稿" size="sm" /></div>}
      </div>
    </div>
    <div className="community-composer__actions">
      <span className={`community-draft-status${draftStatus === "failed" ? " is-error" : ""}`} role="status">{draftStatus === "saving" ? "正在保存草稿" : draftStatus === "saved" ? "草稿已保存到此设备" : draftStatus === "failed" ? "草稿保存失败" : ""}</span>
      {error ? <p className="community-error" role="alert">{error}</p> : null}
      <button type="button" className="community-button community-button--quiet" onClick={() => void cancel()} disabled={saving}>取消</button>
      <button type="submit" className="community-button community-button--primary" disabled={saving || !draftReady || !title.trim() || !body.trim()}>{saving ? "发布中…" : "发布"}</button>
    </div>
  </form>;
}
