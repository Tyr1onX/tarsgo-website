import { useEffect, useRef, useState, type FormEvent } from "react";

import { FileUploadField, type FileUploadStatus } from "~/components/file-upload-field";
import {
  COMMUNITY_CATEGORIES,
  communityImageAccept,
  communityImageHint,
  validateCommunityImages,
  type CommunityCategory,
} from "~/lib/community-client";

export function CommunityComposer({ onCancel, onPublish }: {
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

  useEffect(() => { titleRef.current?.focus(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setStatus(files.length ? "uploading" : "pending");
    try {
      await onPublish({ category, title, body, files });
    } catch (cause) {
      setStatus(files.length ? "failed" : "pending");
      setError(cause instanceof Error ? cause.message : "帖子发布失败");
    } finally {
      setSaving(false);
    }
  }

  return <form className="community-composer" onSubmit={submit} aria-labelledby="community-composer-title">
    <div className="community-composer__header">
      <h2 id="community-composer-title">发布帖子</h2>
      <button className="community-icon-button" type="button" aria-label="收起发帖表单" onClick={onCancel}>×</button>
    </div>
    <div className="community-composer__fields">
      <label className="community-field">标题
        <input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="这次想聊什么？" />
      </label>
      <label className="community-field">分类
        <select value={category} onChange={(event) => setCategory(event.target.value as CommunityCategory)}>
          {COMMUNITY_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="community-field">正文
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={20000} required rows={6} placeholder="分享过程、问题或进展…" />
      </label>
      <div className="community-field">图片
        <FileUploadField
          label="帖子图片"
          files={files}
          onFilesChange={(next) => { setFiles(next); setStatus("pending"); setError(""); }}
          accept={communityImageAccept}
          multiple
          variant="compact"
          hint={communityImageHint}
          status={status}
          disabled={saving}
          error={error}
          validateSelection={validateCommunityImages}
        />
      </div>
    </div>
    <div className="community-composer__actions">
      {error ? <p className="community-error" role="alert">{error}</p> : null}
      <button type="button" className="community-button community-button--quiet" onClick={onCancel} disabled={saving}>取消</button>
      <button type="submit" className="community-button community-button--primary" disabled={saving}>{saving ? "发布中…" : "发布"}</button>
    </div>
  </form>;
}
