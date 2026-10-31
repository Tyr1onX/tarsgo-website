import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { CommunityActionIcon, CommunityAvatar } from "~/components/community-post-card";
import { FileUploadField, type FileUploadStatus } from "~/components/file-upload-field";
import {
  COMMUNITY_CATEGORIES,
  communityCategoryLabel,
  communityClient,
  communityImageAccept,
  communityImageHint,
  formatCommunityDate,
  validateCommunityImages,
  type CommunityCategory,
  type CommunityComment,
  type CommunityDetail,
} from "~/lib/community-client";
import "./community.css";

export function meta() {
  return [{ title: "社区讨论 | TARSGO" }];
}

export default function CommunityPostRoute() {
  const { id: rawID = "" } = useParams();
  const postID = Number(rawID);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null);
  const [comment, setComment] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentStatus, setCommentStatus] = useState<FileUploadStatus>("pending");
  const [commentError, setCommentError] = useState("");
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState<CommunityCategory>("technology");
  const [editingCommentID, setEditingCommentID] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");

  const reload = useCallback(async () => {
    if (!Number.isSafeInteger(postID) || postID < 1) {
      setError("帖子地址无效。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setDetail(await communityClient.get(postID));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "讨论内容暂时无法读取。");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [postID]);

  useEffect(() => { void reload(); }, [reload]);

  async function toggleReaction(kind: "like" | "bookmark") {
    if (!detail || busy) return;
    setBusy(true);
    const active = kind === "like" ? !detail.post.likedByMe : !detail.post.savedByMe;
    try {
      const state = kind === "like"
        ? await communityClient.like(postID, active)
        : await communityClient.bookmark(postID, active);
      setDetail((current) => current ? { ...current, post: {
        ...current.post,
        likedByMe: kind === "like" ? state.active : current.post.likedByMe,
        savedByMe: kind === "bookmark" ? state.active : current.post.savedByMe,
        likeCount: state.likeCount,
      } } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim() || busy) return;
    setBusy(true);
    setCommentError("");
    setCommentStatus(commentFiles.length ? "uploading" : "pending");
    try {
      const result = await communityClient.addComment(postID, { body: comment, parentPostId: replyTarget?.id, files: commentFiles });
      setDetail(result);
      setComment("");
      setCommentFiles([]);
      setReplyTarget(null);
      setCommentStatus("pending");
    } catch (cause) {
      setCommentStatus(commentFiles.length ? "failed" : "pending");
      setCommentError(cause instanceof Error ? cause.message : "回复失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function savePostEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      setDetail(await communityClient.update(postID, { title: editTitle, body: editBody, category: editCategory }));
      setEditingPost(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "帖子更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function deletePost() {
    if (!detail || busy || !window.confirm("确定删除这条帖子吗？")) return;
    setBusy(true);
    try {
      await communityClient.remove(postID);
      navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "帖子删除失败。");
      setBusy(false);
    }
  }

  async function saveCommentEdit(event: FormEvent<HTMLFormElement>, commentID: number) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      setDetail(await communityClient.updateComment(commentID, editCommentBody));
      setEditingCommentID(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function deleteComment(commentID: number) {
    if (busy || !window.confirm("确定删除这条回复吗？")) return;
    setBusy(true);
    try {
      setDetail(await communityClient.removeComment(commentID));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复删除失败。");
    } finally {
      setBusy(false);
    }
  }

  async function moderate(change: { pinned?: boolean; hidden?: boolean }) {
    if (!detail || busy) return;
    setBusy(true);
    try {
      setDetail(await communityClient.moderate(postID, change));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "社区管理操作失败。");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="admin-design community-page"><p className="community-state" role="status">正在加载讨论…</p></section>;
  if (!detail) return <section className="admin-design community-page"><p className="community-state community-state--error" role="alert">{error || "讨论不存在。"}</p><Link className="community-thread__back" to="/dashboard">返回吉甲社区</Link></section>;

  const { post, comments } = detail;
  const parentByID = new Map(comments.map((item) => [item.id, item]));
  return <section className="admin-design community-page community-thread" aria-labelledby="community-thread-title">
    <Link className="community-thread__back" to="/dashboard">← 返回吉甲社区</Link>
    {error ? <p className="community-state community-state--error" role="alert">{error}</p> : null}
    <article className={`community-post${post.isPinned ? " is-pinned" : ""}`}>
      <div className="community-post__author">
        <CommunityAvatar name={post.authorName} src={post.authorAvatar} />
        <div className="community-post__byline"><strong>{post.authorName}</strong><time dateTime={post.createdAt}>{formatCommunityDate(post.createdAt)}{post.editedAt ? " · 已编辑" : ""}</time></div>
        <span className="community-post__category">{communityCategoryLabel(post.category)}</span>
        {post.isPinned ? <span className="community-post__pin">置顶</span> : null}
      </div>
      {post.isLegacy && post.groupName ? <p className="community-post__scope">{post.visibility === "private" ? "历史私密讨论" : `${post.groupName} · 历史讨论`}</p> : null}
      {post.isFaq ? <span className="community-post__faq">FAQ</span> : null}
      {editingPost ? <form className="community-composer" onSubmit={savePostEdit}>
        <label className="community-field">标题<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={160} required /></label>
        <label className="community-field">分类<select value={editCategory} onChange={(event) => setEditCategory(event.target.value as CommunityCategory)}>{COMMUNITY_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="community-field">正文<textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={20000} required rows={8} /></label>
        <div className="community-composer__actions"><button type="button" className="community-button community-button--quiet" onClick={() => setEditingPost(false)}>取消</button><button type="submit" className="community-button community-button--primary" disabled={busy}>保存修改</button></div>
      </form> : <>
        <h1 className="community-post__title" id="community-thread-title">{post.title}</h1>
        <p className="community-thread__body">{post.body}</p>
        {post.attachments.length ? <div className="community-thread-images" aria-label="帖子图片">{post.attachments.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.fileName} /></a>)}</div> : null}
      </>}
      <footer className="community-post__actions">
        <button type="button" aria-pressed={post.likedByMe} disabled={busy} onClick={() => void toggleReaction("like")}><CommunityActionIcon kind="like" /><span>{post.likeCount}</span>{post.likedByMe ? "已赞" : "点赞"}</button>
        <a href="#community-comments"><CommunityActionIcon kind="comment" /><span>{post.commentCount}</span>评论</a>
        <button type="button" aria-pressed={post.savedByMe} disabled={busy} onClick={() => void toggleReaction("bookmark")}><CommunityActionIcon kind="bookmark" />{post.savedByMe ? "已收藏" : "收藏"}</button>
        <div className="community-thread__tools">
          {post.canEdit && !editingPost ? <><button type="button" onClick={() => { setEditTitle(post.title); setEditBody(post.body); setEditCategory(post.category); setEditingPost(true); }}>编辑</button><button type="button" onClick={() => void deletePost()}>删除</button></> : null}
          {post.canModerate ? <><button type="button" onClick={() => void moderate({ pinned: !post.isPinned })}>{post.isPinned ? "取消置顶" : "置顶"}</button><button type="button" onClick={() => void moderate({ hidden: !post.isHidden })}>{post.isHidden ? "取消隐藏" : "隐藏"}</button></> : null}
        </div>
      </footer>
    </article>

    <section className="community-comments" id="community-comments" aria-labelledby="community-comments-title">
      <header className="community-comments__heading"><h2 id="community-comments-title">讨论</h2><span>{comments.length} 条回复</span></header>
      {comments.map((item) => {
        const parent = item.parentPostId ? parentByID.get(item.parentPostId) : null;
        return <article key={item.id} className="community-comment" data-reply={Boolean(item.parentPostId)}>
          <div className="community-comment__head"><CommunityAvatar name={item.authorName} src={item.authorAvatar} size="small" /><strong>{item.authorName}</strong><time dateTime={item.createdAt}>{formatCommunityDate(item.createdAt)}{item.editedAt ? " · 已编辑" : ""}</time></div>
          {parent && !item.isDeleted ? <p className="community-comment__body">回复 {parent.authorName}</p> : null}
          {editingCommentID === item.id ? <form className="community-comment-edit" onSubmit={(event) => void saveCommentEdit(event, item.id)}><textarea value={editCommentBody} onChange={(event) => setEditCommentBody(event.target.value)} maxLength={20000} required /><button className="community-button community-button--primary" disabled={busy}>保存</button></form> : <p className="community-comment__body">{item.body}</p>}
          {item.attachments.length ? <div className="community-thread-images">{item.attachments.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.fileName} /></a>)}</div> : null}
          {!item.isDeleted && <div className="community-comment__actions">
            <button type="button" onClick={() => { setReplyTarget(item); document.getElementById("community-reply-body")?.focus(); }}>回复</button>
            {item.canEdit ? <><button type="button" onClick={() => { setEditingCommentID(item.id); setEditCommentBody(item.body); }}>编辑</button><button type="button" onClick={() => void deleteComment(item.id)}>删除</button></> : null}
          </div>}
        </article>;
      })}
    </section>

    <form className="community-thread-composer" onSubmit={submitComment} aria-label="发表回复">
      {replyTarget ? <div className="community-thread-composer__replying"><span>回复 {replyTarget.authorName}</span><button type="button" className="community-icon-button" aria-label="取消回复对象" onClick={() => setReplyTarget(null)}>×</button></div> : null}
      <label htmlFor="community-reply-body" className="sr-only">写下你的回复</label>
      <textarea id="community-reply-body" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={20000} required placeholder="参与讨论…" />
      <FileUploadField label="回复图片" files={commentFiles} onFilesChange={(next) => { setCommentFiles(next); setCommentStatus("pending"); setCommentError(""); }} accept={communityImageAccept} multiple variant="compact" hint={communityImageHint} status={commentStatus} disabled={busy} validateSelection={validateCommunityImages} />
      <div className="community-thread-composer__actions">{commentError ? <p className="community-error" role="alert">{commentError}</p> : null}<button type="submit" className="community-button community-button--primary" disabled={busy || !comment.trim()}>{busy ? "提交中…" : "回复"}</button></div>
    </form>
  </section>;
}
