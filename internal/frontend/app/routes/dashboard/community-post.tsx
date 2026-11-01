import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useOutletContext, useParams } from "react-router";

import { CommunityRelatedTopics } from "~/components/community-related-topics";
import { CommunityReplyComposer } from "~/components/community-reply-composer";
import { CommunityImageGallery } from "~/components/community-image-gallery";
import { type CommunityPendingImage } from "~/components/community-markdown-editor";
import { CommunityMarkdown } from "~/components/community-markdown";
import { CommunityAuthorProfile } from "~/components/community-author-profile";
import { CommunityIcon } from "~/components/community-icons";
import { CommunityActionIcon, CommunityPostMenu } from "~/components/community-post-card";
import {
  COMMUNITY_CATEGORIES,
  communityCategoryLabel,
  communityClient,
  formatCommunityDate,
  type CommunityCategory,
  type CommunityComment,
  type CommunityDetail,
} from "~/lib/community-client";
import { clearCommunityLists, removeCommunityPostFromLists } from "~/lib/community-list-cache";
import { communityStandaloneAttachments, stripCommunityMarkdown } from "~/lib/community-markdown";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./community.css";

const CommunityMarkdownEditor = lazy(() => import("~/components/community-markdown-editor").then((module) => ({ default: module.CommunityMarkdownEditor })));

export function meta() {
  return [{ title: "社区讨论 | TARSGO" }];
}

export default function CommunityPostRoute() {
  const { id: rawID = "" } = useParams();
  const postID = Number(rawID);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [focusedCommentID, setFocusedCommentID] = useState<number | null>(null);
  const [shareStatus, setShareStatus] = useState("");
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState<CommunityCategory>("technology");
  const [editPostUploads, setEditPostUploads] = useState<CommunityPendingImage[]>([]);
  const [editingCommentID, setEditingCommentID] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [editCommentUploads, setEditCommentUploads] = useState<CommunityPendingImage[]>([]);
  const returnTarget = (location.state as { communityReturnTo?: unknown } | null)?.communityReturnTo;
  const hasCommunityReturnLocation = typeof returnTarget === "string" && (returnTarget === "/dashboard" || returnTarget.startsWith("/dashboard/") || returnTarget.startsWith("/dashboard?"));
  const returnTo = typeof returnTarget === "string" && (returnTarget === "/dashboard" || returnTarget.startsWith("/dashboard/") || returnTarget.startsWith("/dashboard?"))
    ? returnTarget
    : "/dashboard";

  function backToCommunity() {
    if (hasCommunityReturnLocation) navigate(-1);
    else navigate(returnTo);
  }

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

  useEffect(() => {
    const hash = location.hash || window.location.hash;
    if (!detail || !hash.startsWith("#community-comment-")) return;
    let finalFrame = 0;
    const restoreFrame = window.requestAnimationFrame(() => {
      finalFrame = window.requestAnimationFrame(() => {
        document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      window.cancelAnimationFrame(finalFrame);
    };
  }, [detail, location.hash]);

  async function toggleReaction(kind: "like" | "bookmark") {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    setRetryAction(null);
    const active = kind === "like" ? !detail.post.likedByMe : !detail.post.savedByMe;
    const previous = detail;
    setDetail({ ...detail, post: {
      ...detail.post,
      likedByMe: kind === "like" ? active : detail.post.likedByMe,
      savedByMe: kind === "bookmark" ? active : detail.post.savedByMe,
      likeCount: kind === "like" ? Math.max(0, detail.post.likeCount + (active ? 1 : -1)) : detail.post.likeCount,
    } });
    try {
      const state = kind === "like"
        ? await communityClient.like(postID, active)
        : await communityClient.bookmark(postID, active);
      clearCommunityLists();
      setDetail((current) => current ? { ...current, post: {
        ...current.post,
        likedByMe: kind === "like" ? state.active : current.post.likedByMe,
        savedByMe: kind === "bookmark" ? state.active : current.post.savedByMe,
        likeCount: state.likeCount,
      } } : current);
    } catch (cause) {
      setDetail(previous);
      setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
      setRetryAction(() => () => { void toggleReaction(kind); });
    } finally {
      setBusy(false);
    }
  }

  async function toggleCommentLike(item: CommunityComment) {
    if (!detail || busy || !item.canLike) return;
    const active = !item.likedByMe;
    const previous = detail;
    setBusy(true);
    setError("");
    setDetail({ ...detail, comments: detail.comments.map((commentItem) => commentItem.id === item.id ? {
      ...commentItem, likedByMe: active, likeCount: Math.max(0, commentItem.likeCount + (active ? 1 : -1)),
    } : commentItem) });
    try {
      const result = await communityClient.likeComment(item.id, active);
      setDetail((current) => current ? { ...current, comments: current.comments.map((commentItem) => commentItem.id === item.id ? {
        ...commentItem, likedByMe: result.active, likeCount: result.likeCount,
      } : commentItem) } : current);
    } catch (cause) {
      setDetail(previous);
      setError(cause instanceof Error ? cause.message : "回复点赞失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function setSolution(commentID: number | null) {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      setDetail(await communityClient.setSolution(postID, commentID));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解决方案状态更新失败。");
    } finally {
      setBusy(false);
    }
  }

  function openReply(target: CommunityComment | null = null) {
    setReplyTarget(target);
    setReplyOpen(true);
  }

  async function submitComment(input: { body: string; parentPostId?: number; files: File[]; uploadTokens: string[] }) {
    if (!input.body.trim() || busy) return;
    setBusy(true);
    setError("");
    setRetryAction(null);
    try {
      const result = await communityClient.addComment(postID, input);
      clearCommunityLists();
      setDetail(result);
      const createdComment = result.comments.at(-1);
      if (createdComment) {
        setFocusedCommentID(createdComment.id);
        navigate({ pathname: location.pathname, search: location.search, hash: `#community-comment-${createdComment.id}` }, {
          replace: true, state: location.state, preventScrollReset: true,
        });
      }
    } catch (cause) {
      throw new Error(cause instanceof Error ? cause.message : "回复失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function sharePost() {
    if (!detail) return;
    const url = new URL(`/dashboard/community/${detail.post.id}`, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: detail.post.title, url });
        setShareStatus("已打开分享面板");
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus("链接已复制");
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setShareStatus("分享失败，请重试");
    }
    window.setTimeout(() => setShareStatus(""), 2200);
  }

  async function savePostEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    setRetryAction(null);
    try {
      const updated = await communityClient.update(postID, { title: editTitle, body: editBody, category: editCategory, files: editPostUploads.map((item) => item.file), uploadTokens: editPostUploads.map((item) => item.token) });
      clearCommunityLists();
      setDetail(updated);
      setEditingPost(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "帖子更新失败。");
      setRetryAction(() => () => (document.getElementById("community-post-edit") as HTMLFormElement | null)?.requestSubmit());
    } finally {
      setBusy(false);
    }
  }

  async function deletePost() {
    if (!detail || busy || !window.confirm("确定删除这条帖子吗？")) return;
    setBusy(true);
    setRetryAction(null);
    try {
      await communityClient.remove(postID);
      removeCommunityPostFromLists(postID);
      if (hasCommunityReturnLocation) navigate(-1);
      else navigate(returnTo, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "帖子删除失败。");
      setRetryAction(() => () => { void deletePost(); });
      setBusy(false);
    }
  }

  async function saveCommentEdit(event: FormEvent<HTMLFormElement>, commentID: number) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setRetryAction(null);
    try {
      const updated = await communityClient.updateComment(commentID, { body: editCommentBody, files: editCommentUploads.map((item) => item.file), uploadTokens: editCommentUploads.map((item) => item.token) });
      clearCommunityLists();
      setDetail(updated);
      setEditingCommentID(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复更新失败。");
      setRetryAction(() => () => (document.getElementById(`community-comment-edit-${commentID}`) as HTMLFormElement | null)?.requestSubmit());
    } finally {
      setBusy(false);
    }
  }

  async function deleteComment(commentID: number) {
    if (busy || !window.confirm("确定删除这条回复吗？")) return;
    setBusy(true);
    setRetryAction(null);
    try {
      const updated = await communityClient.removeComment(commentID);
      clearCommunityLists();
      setDetail(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复删除失败。");
      setRetryAction(() => () => { void deleteComment(commentID); });
    } finally {
      setBusy(false);
    }
  }

  async function moderate(change: { pinned?: boolean; hidden?: boolean }) {
    if (!detail || busy) return;
    setBusy(true);
    setRetryAction(null);
    try {
      const updated = await communityClient.moderate(postID, change);
      clearCommunityLists();
      setDetail(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "社区管理操作失败。");
      setRetryAction(() => () => { void moderate(change); });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="admin-design community-page"><p className="community-state" role="status">正在加载讨论…</p></section>;
  if (!detail) return <section className="admin-design community-page"><p className="community-state community-state--error" role="alert">{error || "讨论不存在。"}{error ? <button type="button" className="community-inline-retry" onClick={() => void reload()}>重试</button> : null}</p><button className="community-thread__back" type="button" onClick={backToCommunity}><CommunityIcon name="arrowLeft" />返回吉甲社区</button></section>;

  const { post, comments } = detail;
  const parentByID = new Map(comments.map((item) => [item.id, item]));
  function commentDepth(comment: CommunityComment) {
    let depth = 0;
    let parentID = comment.parentPostId;
    const visited = new Set([comment.id]);
    while (parentID && !visited.has(parentID)) {
      visited.add(parentID);
      const parent = parentByID.get(parentID);
      if (!parent) break;
      depth += 1;
      parentID = parent.parentPostId;
    }
    return Math.min(depth, 3);
  }

  return <section className="admin-design community-page community-thread" aria-labelledby="community-thread-title">
    <button className="community-thread__back" type="button" onClick={backToCommunity}><CommunityIcon name="arrowLeft" />返回吉甲社区</button>
    {error ? <p className="community-state community-state--error" role="alert">{error}{retryAction ? <button type="button" className="community-inline-retry" onClick={() => retryAction()}>重试</button> : null}</p> : null}
    <article className={`community-post${post.isPinned ? " is-pinned" : ""}`}>
      <div className="community-post__author">
        <CommunityAuthorProfile id={post.authorId} name={post.authorName} avatar={post.authorAvatar} level={post.authorLevel} featuredBadge={post.authorFeaturedBadge} positions={post.authorPositions} teamIdentityStatus={post.authorTeamIdentityStatus} />
        <div className="community-post__byline"><time dateTime={post.createdAt}>{formatCommunityDate(post.createdAt)}{post.editedAt ? " · 已编辑" : ""} · {post.viewCount ?? 0} 浏览</time></div>
        {post.isPinned ? <span className="community-post__pin"><CommunityIcon name="pin" />置顶</span> : null}
        <span className="community-post__category">{communityCategoryLabel(post.category)}</span>
        <CommunityPostMenu
          post={post}
          busy={busy}
          onModerate={(change) => void moderate(change)}
          onEdit={!editingPost ? () => { setEditTitle(post.title); setEditBody(post.body); setEditCategory(post.category); setEditPostUploads([]); setEditingPost(true); } : undefined}
          onDelete={() => void deletePost()}
        />
      </div>
      {post.isLegacy && post.groupName ? <p className="community-post__scope">{post.visibility === "private" ? "历史私密讨论" : `${post.groupName} · 历史讨论`}</p> : null}
      {post.isFaq ? <span className="community-post__faq">FAQ</span> : null}
      {editingPost ? <form id="community-post-edit" className="community-composer" onSubmit={savePostEdit}>
        <label className="community-field">标题<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={160} required /></label>
        <label className="community-field">分类<select value={editCategory} onChange={(event) => setEditCategory(event.target.value as CommunityCategory)}>{COMMUNITY_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <div className="community-field community-field--editor"><span>正文</span><Suspense fallback={<div className="community-markdown-editor__loading" role="status">正在打开编辑器…</div>}><CommunityMarkdownEditor value={editBody} onChange={setEditBody} uploads={editPostUploads} onUploadsChange={setEditPostUploads} attachments={post.attachments} required placeholder="继续完善这条帖子…" /></Suspense></div>
        <div className="community-composer__actions"><button type="button" className="community-button community-button--quiet" onClick={() => setEditingPost(false)}>取消</button><button type="submit" className="community-button community-button--primary" disabled={busy}>保存修改</button></div>
      </form> : <>
        <h1 className="community-post__title" id="community-thread-title">{post.title}</h1>
        <CommunityMarkdown source={post.body} className="community-thread__body" />
        {communityStandaloneAttachments(post.body, post.attachments).length ? <CommunityImageGallery attachments={communityStandaloneAttachments(post.body, post.attachments)} /> : null}
      </>}
      <footer className="community-post__actions">
        <button type="button" aria-pressed={post.likedByMe} disabled={busy} onClick={() => void toggleReaction("like")}><CommunityActionIcon kind="like" /><span>{post.likeCount}</span>{post.likedByMe ? "已赞" : "点赞"}</button>
        <button type="button" onClick={() => openReply()}><CommunityActionIcon kind="comment" /><span>{post.commentCount}</span>回复</button>
        <button type="button" aria-pressed={post.savedByMe} disabled={busy} onClick={() => void toggleReaction("bookmark")}><CommunityActionIcon kind="bookmark" />{post.savedByMe ? "已收藏" : "收藏"}</button>
        <button type="button" onClick={() => void sharePost()}><CommunityIcon name="share2" />分享</button>
        {shareStatus ? <span className="community-share-status" role="status">{shareStatus}</span> : null}
      </footer>
    </article>

    <section className="community-comments" id="community-comments" aria-labelledby="community-comments-title">
      <header className="community-comments__heading"><h2 id="community-comments-title">讨论</h2><span>{comments.length} 条回复</span></header>
      {comments.map((item) => {
        const parent = item.parentPostId ? parentByID.get(item.parentPostId) : null;
        return <article key={item.id} id={`community-comment-${item.id}`} className={`community-comment${location.hash === `#community-comment-${item.id}` || focusedCommentID === item.id ? " is-targeted" : ""}`} data-reply={Boolean(item.parentPostId)} data-depth={commentDepth(item)}>
          <div className="community-comment__head"><CommunityAuthorProfile id={item.authorId} name={item.authorName} avatar={item.authorAvatar} level={item.authorLevel} featuredBadge={item.authorFeaturedBadge} positions={item.authorPositions} teamIdentityStatus={item.authorTeamIdentityStatus} size="small" />{item.isAcceptedSolution ? <span className="community-comment__solution"><CommunityIcon name="check" />已采纳</span> : null}<time dateTime={item.createdAt}>{formatCommunityDate(item.createdAt)}{item.editedAt ? " · 已编辑" : ""}</time></div>
          {parent ? <button type="button" className="community-comment__context" onClick={() => document.getElementById(`community-comment-${parent.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <span>回复 {parent.authorName}</span><span>{parent.isDeleted ? "该回复已删除" : stripCommunityMarkdown(parent.body)}</span>
          </button> : null}
          {editingCommentID === item.id ? <form id={`community-comment-edit-${item.id}`} className="community-comment-edit" onSubmit={(event) => void saveCommentEdit(event, item.id)}><Suspense fallback={<div className="community-markdown-editor__loading" role="status">正在打开编辑器…</div>}><CommunityMarkdownEditor value={editCommentBody} onChange={setEditCommentBody} uploads={editCommentUploads} onUploadsChange={setEditCommentUploads} attachments={item.attachments} compact required placeholder="编辑回复…" /></Suspense><button className="community-button community-button--primary" disabled={busy}>保存</button></form> : <CommunityMarkdown source={item.body} className="community-comment__body" />}
          {communityStandaloneAttachments(item.body, item.attachments).length ? <CommunityImageGallery attachments={communityStandaloneAttachments(item.body, item.attachments)} compact /> : null}
          {!item.isDeleted && <div className="community-comment__actions">
            <button type="button" onClick={() => openReply(item)}>回复</button>
            <button type="button" className={item.likedByMe ? "is-liked" : ""} aria-label={`${item.likedByMe ? "取消点赞" : "点赞"}，${item.likeCount} 个赞`} aria-pressed={item.likedByMe} disabled={busy || !item.canLike} onClick={() => void toggleCommentLike(item)}><CommunityActionIcon kind="like" /><span>{item.likeCount || "赞"}</span></button>
            {item.canAcceptSolution ? <button type="button" className={item.isAcceptedSolution ? "is-solution" : ""} disabled={busy} onClick={() => void setSolution(item.isAcceptedSolution ? null : item.id)}>{item.isAcceptedSolution ? "取消采纳" : "采纳为解决方案"}</button> : null}
            {item.canEdit ? <><button type="button" onClick={() => { setEditingCommentID(item.id); setEditCommentBody(item.body); setEditCommentUploads([]); }}>编辑</button><button type="button" onClick={() => void deleteComment(item.id)}>删除</button></> : null}
          </div>}
        </article>;
      })}
    </section>

    <CommunityRelatedTopics postId={post.id} returnTo={returnTo} />
    {replyOpen ? <CommunityReplyComposer accountId={currentUser.id} postId={post.id} comments={comments} busy={busy} replyTarget={replyTarget} onReplyTargetChange={setReplyTarget} onClose={() => setReplyOpen(false)} onSubmit={submitComment} /> : <button type="button" className="community-reply-launcher" onClick={() => openReply()} aria-controls="community-reply-form"><CommunityIcon name="messageCircle" />回复话题</button>}
  </section>;
}
