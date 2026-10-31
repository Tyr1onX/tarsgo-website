import { useEffect, useRef, useState, type FormEvent } from "react";

import { FileUploadField, type FileUploadStatus } from "~/components/file-upload-field";
import { CommunityIcon } from "~/components/community-icons";
import {
  COMMUNITY_CATEGORIES,
  communityImageAccept,
  communityImageHint,
  validateCommunityImages,
  type CommunityCategory,
} from "~/lib/community-client";
import { clearCommunityDraft, loadCommunityDraft, saveCommunityDraft } from "~/lib/community-draft";

export function CommunityComposer({ id, accountId, onCancel, onPublish }: {
  id: string;
  accountId: number;
  onCancel: () => void;
  onPublish: (input: { category: CommunityCategory; title: string; body: string; files: File[] }) => Promise<void>;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<CommunityCategory>("technology");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<FileUploadStatus>("pending");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"empty" | "saving" | "saved" | "failed">("empty");
  const latestDraftRef = useRef({ accountId, category, title, body, files, draftReady, saving });
  latestDraftRef.current = { accountId, category, title, body, files, draftReady, saving };

  useEffect(() => {
    let active = true;
    setDraftReady(false);
    void loadCommunityDraft(accountId).then((draft) => {
      if (!active) return;
      if (draft) {
        setCategory(draft.category);
        setTitle(draft.title);
        setBody(draft.body);
        setFiles(draft.files);
        setDraftStatus("saved");
      } else {
        setCategory("technology");
        setTitle("");
        setBody("");
        setFiles([]);
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
    const draft = latestDraftRef.current;
    if (draft.draftReady && !draft.saving && (draft.title.trim() || draft.body.trim() || draft.files.length || draft.category !== "technology")) {
      void saveCommunityDraft(draft.accountId, { category: draft.category, title: draft.title, body: draft.body, files: draft.files, updatedAt: Date.now() });
    }
  }, []);

  useEffect(() => {
    if (!draftReady || saving) return;
    const hasContent = Boolean(title.trim() || body.trim() || files.length || category !== "technology");
    const timer = window.setTimeout(() => {
      if (!hasContent) {
        void clearCommunityDraft(accountId).then(() => setDraftStatus("empty")).catch(() => setDraftStatus("failed"));
        return;
      }
      setDraftStatus("saving");
      void saveCommunityDraft(accountId, { category, title, body, files, updatedAt: Date.now() })
        .then(() => setDraftStatus("saved"))
        .catch(() => setDraftStatus("failed"));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [accountId, body, category, draftReady, files, saving, title]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setStatus(files.length ? "uploading" : "pending");
    try {
      await onPublish({ category, title, body, files });
      await clearCommunityDraft(accountId).catch(() => undefined);
    } catch (cause) {
      setStatus(files.length ? "failed" : "pending");
      setError(cause instanceof Error ? cause.message : "帖子发布失败");
    } finally {
      setSaving(false);
    }
  }

  return <form id={id} className="community-composer" onSubmit={submit} aria-labelledby="community-composer-title" aria-busy={saving || !draftReady}>
    <div className="community-composer__header">
      <h2 id="community-composer-title">发布帖子</h2>
      <button className="community-icon-button" type="button" aria-label="收起发帖表单" onClick={onCancel}><CommunityIcon name="x" /></button>
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
      <label className="community-field">正文
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={20000} required rows={7} placeholder="分享过程、问题或进展…" disabled={!draftReady || saving} />
      </label>
      <div className="community-field">
        <span className="community-field__label"><CommunityIcon name="image" />图片</span>
        <FileUploadField
          label="帖子图片"
          files={files}
          onFilesChange={(next) => { setFiles(next); setStatus("pending"); setError(""); }}
          accept={communityImageAccept}
          multiple
          variant="compact"
          hint={communityImageHint}
          status={status}
          disabled={!draftReady || saving}
          validateSelection={validateCommunityImages}
        />
      </div>
    </div>
    <div className="community-composer__actions">
      <span className={`community-draft-status${draftStatus === "failed" ? " is-error" : ""}`} role="status">{draftStatus === "saving" ? "正在保存草稿" : draftStatus === "saved" ? "草稿已保存到此设备" : draftStatus === "failed" ? "草稿保存失败" : ""}</span>
      {error ? <p className="community-error" role="alert">{error}</p> : null}
      <button type="button" className="community-button community-button--quiet" onClick={onCancel} disabled={saving}>取消</button>
      <button type="submit" className="community-button community-button--primary" disabled={saving || !draftReady}>{saving ? "发布中…" : "发布"}</button>
    </div>
  </form>;
}
