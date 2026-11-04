import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useNavigationType, useOutletContext, useParams } from "react-router";

import { CommunityRelatedTopics } from "~/components/community-related-topics";
import { CommunityReplyComposer } from "~/components/community-reply-composer";
import { CommunityImageGallery } from "~/components/community-image-gallery";
import { CommunityCommentManagementMenu } from "~/components/community-comment-management-menu";
import { CommunityReadingTimeline } from "~/components/community-reading-timeline";
import { type CommunityPendingImage } from "~/components/community-markdown-editor";
import { CommunityMarkdown } from "~/components/community-markdown";
import { CommunityAuthorProfile } from "~/components/community-author-profile";
import { CommunityFeaturedMark } from "~/components/community-featured-mark";
import { BrandLoader } from "~/components/brand-loader";
import { CommunityIcon } from "~/components/community-icons";
import { CommunityActionIcon, CommunityAvatar, CommunityPostMenu } from "~/components/community-post-card";
import {
  COMMUNITY_CATEGORIES,
  communityCategoryLabel,
  communityClient,
  communityPostReactionSnapshot,
  formatCommunityDate,
  mergeCommunityReactionOverrides,
  releaseCommunityReactionLock,
  setCommunityPostReaction,
  tryAcquireCommunityReactionLock,
  withCommunityPostReactions,
  type CommunityCategory,
  type CommunityComment,
  type CommunityDetail,
  type CommunityPostReactionSnapshot,
  type CommunityReactionOverride,
} from "~/lib/community-client";
import { clearCommunityLists, invalidateCommunitySavedLists, removeCommunityPostFromLists, updateCommunityPostInLists } from "~/lib/community-list-cache";
import { buildCommunityReadingEntries, findHotCommunityReply, groupCommunityReplies } from "~/lib/community-discussion-model";
import { useDeferredCommunityScrollRestoration } from "~/lib/community-scroll-restoration";
import { communityStandaloneAttachments, stripCommunityMarkdown } from "~/lib/community-markdown";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./community.css";

const CommunityMarkdownEditor = lazy(() => import("~/components/community-markdown-editor").then((module) => ({ default: module.CommunityMarkdownEditor })));

type CommunityCommentReactionSnapshot = Pick<CommunityComment, "likedByMe" | "likeCount">;

function mergeDetailReactions(
  detail: CommunityDetail,
  postOverrides: Map<number, CommunityReactionOverride<CommunityPostReactionSnapshot>>,
  commentOverrides: Map<number, CommunityReactionOverride<CommunityCommentReactionSnapshot>>,
  startedAtVersion: number,
) {
  const [post] = mergeCommunityReactionOverrides([detail.post], postOverrides, startedAtVersion, withCommunityPostReactions);
  const comments = mergeCommunityReactionOverrides(detail.comments, commentOverrides, startedAtVersion, (comment, reaction) => ({ ...comment, ...reaction }));
  return { ...detail, post: post ?? detail.post, comments };
}

function communityReplyPreviewText(body: string) {
  const text = stripCommunityMarkdown(body).replace(/\s+/g, " ").trim();
  const characters = Array.from(text || "图片回复");
  return characters.length > 88 ? `${characters.slice(0, 88).join("")}…` : characters.join("");
}

export function meta() {
  return [{ title: "社区讨论 | TARSGO" }];
}

export default function CommunityPostRoute() {
  const { id: rawID = "" } = useParams();
  const postID = Number(rawID);
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { currentUser, setPageTitle } = useOutletContext<DashboardLayoutOutletContext>();
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [postReactionBusy, setPostReactionBusy] = useState(false);
  const [commentReactionBusyIDs, setCommentReactionBusyIDs] = useState<Set<number>>(() => new Set());
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [focusedCommentID, setFocusedCommentID] = useState<number | null>(null);
  const [expandedReplyPreviewParentIDs, setExpandedReplyPreviewParentIDs] = useState<Set<number>>(() => new Set());
  const [shareStatus, setShareStatus] = useState("");
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const editPostFlushRef = useRef<() => string>(() => editBody);
  const [editCategory, setEditCategory] = useState<CommunityCategory>("technology");
  const [editPostUploads, setEditPostUploads] = useState<CommunityPendingImage[]>([]);
  const [editingCommentID, setEditingCommentID] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const editCommentFlushRef = useRef<() => string>(() => editCommentBody);
  const focusedCommentTimeoutRef = useRef<number | null>(null);
  const [editCommentUploads, setEditCommentUploads] = useState<CommunityPendingImage[]>([]);
  const detailRequestRef = useRef(0);
  const reactionVersionRef = useRef(0);
  const postReactionLocksRef = useRef(new Set<number>());
  const commentReactionLocksRef = useRef(new Set<number>());
  const postReactionOverridesRef = useRef(new Map<number, CommunityReactionOverride<CommunityPostReactionSnapshot>>());
  const commentReactionOverridesRef = useRef(new Map<number, CommunityReactionOverride<CommunityCommentReactionSnapshot>>());
  useDeferredCommunityScrollRestoration(location.key, navigationType, detail !== null, location.hash);
  const returnTarget = (location.state as { communityReturnTo?: unknown } | null)?.communityReturnTo;
  const hasCommunityReturnLocation = typeof returnTarget === "string" && (returnTarget === "/dashboard" || returnTarget.startsWith("/dashboard/") || returnTarget.startsWith("/dashboard?"));
  const returnTo = typeof returnTarget === "string" && (returnTarget === "/dashboard" || returnTarget.startsWith("/dashboard/") || returnTarget.startsWith("/dashboard?"))
    ? returnTarget
    : "/dashboard";
  const profileReturnTo = `${location.pathname}${location.search}${location.hash}`;

  function backToCommunity() {
    if (hasCommunityReturnLocation) navigate(-1);
    else navigate(returnTo);
  }

  const reload = useCallback(async () => {
    const requestID = ++detailRequestRef.current;
    const startedAtVersion = reactionVersionRef.current;
    if (!Number.isSafeInteger(postID) || postID < 1) {
      setError("帖子地址无效。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await communityClient.get(postID);
      if (detailRequestRef.current !== requestID) return;
      setDetail(mergeDetailReactions(result, postReactionOverridesRef.current, commentReactionOverridesRef.current, startedAtVersion));
    } catch (cause) {
      if (detailRequestRef.current !== requestID) return;
      setError(cause instanceof Error ? cause.message : "讨论内容暂时无法读取。");
      setDetail(null);
    } finally {
      if (detailRequestRef.current === requestID) setLoading(false);
    }
  }, [postID]);

  useEffect(() => { void reload(); }, [reload]);

  const pageTitle = !loading && detail?.post.id === postID ? detail.post.title : "";
  useLayoutEffect(() => {
    setPageTitle(pageTitle);
  }, [pageTitle, setPageTitle]);
  useLayoutEffect(() => () => setPageTitle(""), [setPageTitle]);

  useEffect(() => () => {
    if (focusedCommentTimeoutRef.current !== null) window.clearTimeout(focusedCommentTimeoutRef.current);
  }, []);

  function focusComment(commentID: number) {
    setFocusedCommentID(commentID);
    if (focusedCommentTimeoutRef.current !== null) window.clearTimeout(focusedCommentTimeoutRef.current);
    focusedCommentTimeoutRef.current = window.setTimeout(() => {
      setFocusedCommentID((current) => current === commentID ? null : current);
      focusedCommentTimeoutRef.current = null;
    }, 2400);
    document.getElementById(`community-comment-${commentID}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleReplyPreview(parentID: number) {
    setExpandedReplyPreviewParentIDs((current) => {
      const next = new Set(current);
      if (next.has(parentID)) next.delete(parentID);
      else next.add(parentID);
      return next;
    });
  }

  function syncPostReactionCache(reaction: CommunityPostReactionSnapshot, invalidateSaved = false) {
    updateCommunityPostInLists(currentUser.id, postID, (cachedPost) => withCommunityPostReactions(cachedPost, reaction));
    if (invalidateSaved) invalidateCommunitySavedLists(currentUser.id);
  }

  useEffect(() => {
    const hash = location.hash || window.location.hash;
    if (!detail || !hash.startsWith("#community-comment-")) return;
    let finalFrame = 0;
    const restoreFrame = window.requestAnimationFrame(() => {
      finalFrame = window.requestAnimationFrame(() => {
        document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      window.cancelAnimationFrame(finalFrame);
    };
  }, [detail, location.hash]);

  async function toggleReaction(kind: "like" | "bookmark") {
    if (!detail || busy || !tryAcquireCommunityReactionLock(postReactionLocksRef.current, postID)) return;
    setPostReactionBusy(true);
    setError("");
    setRetryAction(null);
    const active = kind === "like" ? !detail.post.likedByMe : !detail.post.savedByMe;
    const previousReaction = communityPostReactionSnapshot(detail.post);
    const optimisticPost = setCommunityPostReaction(detail.post, kind, {
      active,
      likeCount: kind === "like" ? Math.max(0, detail.post.likeCount + (active ? 1 : -1)) : detail.post.likeCount,
    });
    const optimisticReaction = communityPostReactionSnapshot(optimisticPost);
    const optimisticVersion = ++reactionVersionRef.current;
    postReactionOverridesRef.current.set(postID, { reaction: optimisticReaction, version: optimisticVersion, pending: true });
    setDetail((current) => current ? { ...current, post: setCommunityPostReaction(current.post, kind, {
      active,
      likeCount: optimisticPost.likeCount,
    }) } : current);
    syncPostReactionCache(optimisticReaction, kind === "bookmark" && active);
    try {
      const state = kind === "like"
        ? await communityClient.like(postID, active)
        : await communityClient.bookmark(postID, active);
      const settledPost = setCommunityPostReaction(optimisticPost, kind, state);
      const settledReaction = communityPostReactionSnapshot(settledPost);
      const settledVersion = ++reactionVersionRef.current;
      postReactionOverridesRef.current.set(postID, { reaction: settledReaction, version: settledVersion, pending: false });
      setDetail((current) => current ? { ...current, post: setCommunityPostReaction(current.post, kind, state) } : current);
      syncPostReactionCache(settledReaction, kind === "bookmark" && state.active);
    } catch (cause) {
      const rollbackVersion = ++reactionVersionRef.current;
      postReactionOverridesRef.current.set(postID, { reaction: previousReaction, version: rollbackVersion, pending: false });
      setDetail((current) => current ? { ...current, post: withCommunityPostReactions(current.post, previousReaction) } : current);
      syncPostReactionCache(previousReaction, kind === "bookmark" && previousReaction.savedByMe);
      setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
      setRetryAction(() => () => { void toggleReaction(kind); });
    } finally {
      releaseCommunityReactionLock(postReactionLocksRef.current, postID);
      setPostReactionBusy(false);
    }
  }

  async function toggleCommentLike(item: CommunityComment) {
    if (!detail || busy || !item.canLike || !tryAcquireCommunityReactionLock(commentReactionLocksRef.current, item.id)) return;
    const active = !item.likedByMe;
    const previousReaction: CommunityCommentReactionSnapshot = { likedByMe: item.likedByMe, likeCount: item.likeCount };
    const optimisticReaction: CommunityCommentReactionSnapshot = {
      likedByMe: active,
      likeCount: Math.max(0, item.likeCount + (active ? 1 : -1)),
    };
    const optimisticVersion = ++reactionVersionRef.current;
    commentReactionOverridesRef.current.set(item.id, { reaction: optimisticReaction, version: optimisticVersion, pending: true });
    setCommentReactionBusyIDs((current) => new Set(current).add(item.id));
    setError("");
    setDetail((current) => current ? { ...current, comments: current.comments.map((commentItem) => commentItem.id === item.id ? { ...commentItem, ...optimisticReaction } : commentItem) } : current);
    try {
      const result = await communityClient.likeComment(item.id, active);
      const settledReaction = { likedByMe: result.active, likeCount: result.likeCount };
      const settledVersion = ++reactionVersionRef.current;
      commentReactionOverridesRef.current.set(item.id, { reaction: settledReaction, version: settledVersion, pending: false });
      setDetail((current) => current ? { ...current, comments: current.comments.map((commentItem) => commentItem.id === item.id ? { ...commentItem, ...settledReaction } : commentItem) } : current);
    } catch (cause) {
      const rollbackVersion = ++reactionVersionRef.current;
      commentReactionOverridesRef.current.set(item.id, { reaction: previousReaction, version: rollbackVersion, pending: false });
      setDetail((current) => current ? { ...current, comments: current.comments.map((commentItem) => commentItem.id === item.id ? { ...commentItem, ...previousReaction } : commentItem) } : current);
      setError(cause instanceof Error ? cause.message : "回复点赞失败，请稍后重试。");
      setRetryAction(() => () => { void toggleCommentLike(item); });
    } finally {
      releaseCommunityReactionLock(commentReactionLocksRef.current, item.id);
      setCommentReactionBusyIDs((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function setSolution(commentID: number | null) {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    const startedAtVersion = reactionVersionRef.current;
    try {
      const updated = await communityClient.setSolution(postID, commentID);
      setDetail(mergeDetailReactions(updated, postReactionOverridesRef.current, commentReactionOverridesRef.current, startedAtVersion));
      updateCommunityPostInLists(currentUser.id, postID, (cachedPost) => ({
        ...cachedPost,
        isSolved: updated.post.isSolved,
        acceptedSolutionId: updated.post.acceptedSolutionId,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解决方案状态更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function togglePostFeatured() {
    if (!detail || busy || currentUser.role.name !== "super_admin") return;
    setBusy(true);
    setError("");
    try {
      const state = await communityClient.setPostFeatured(postID, !detail.post.isFeatured);
      setDetail((current) => current ? { ...current, post: { ...current.post, isFeatured: state.isFeatured } } : current);
      updateCommunityPostInLists(currentUser.id, postID, (cachedPost) => ({ ...cachedPost, isFeatured: state.isFeatured }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "帖子精华状态更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function toggleReplyFeatured(commentID: number, featured: boolean) {
    if (!detail || busy || currentUser.role.name !== "super_admin") return;
    setBusy(true);
    setError("");
    try {
      const state = await communityClient.setReplyFeatured(commentID, !featured);
      setDetail((current) => current ? {
        ...current,
        comments: current.comments.map((comment) => comment.id === commentID ? { ...comment, isFeatured: state.isFeatured } : comment),
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回复精华状态更新失败。");
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
    const startedAtVersion = reactionVersionRef.current;
    try {
      const result = await communityClient.addComment(postID, input);
      clearCommunityLists();
      setDetail(mergeDetailReactions(result, postReactionOverridesRef.current, commentReactionOverridesRef.current, startedAtVersion));
      const createdComment = result.comments.at(-1);
      if (createdComment) {
        focusComment(createdComment.id);
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
    const currentBody = editPostFlushRef.current();
    setBusy(true);
    setError("");
    setRetryAction(null);
    const startedAtVersion = reactionVersionRef.current;
    try {
      const updated = await communityClient.update(postID, { title: editTitle, body: currentBody, category: editCategory, files: editPostUploads.map((item) => item.file), uploadTokens: editPostUploads.map((item) => item.token) });
      clearCommunityLists();
      setDetail(mergeDetailReactions(updated, postReactionOverridesRef.current, commentReactionOverridesRef.current, startedAtVersion));
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
    const currentBody = editCommentFlushRef.current();
    setBusy(true);
    setRetryAction(null);
    const startedAtVersion = reactionVersionRef.current;
    try {
      const updated = await communityClient.updateComment(commentID, { body: currentBody, files: editCommentUploads.map((item) => item.file), uploadTokens: editCommentUploads.map((item) => item.token) });
      clearCommunityLists();
      setDetail(mergeDetailReactions(updated, postReactionOverridesRef.current, commentReactionOverridesRef.current, startedAtVersion));
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
    const startedAtVersion = reactionVersionRef.current;
    try {
      const updated = await communityClient.removeComment(commentID);
      clearCommunityLists();
      setDetail(mergeDetailReactions(updated, postReactionOverridesRef.current, commentReactionOverridesRef.current, startedAtVersion));
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
    const startedAtVersion = reactionVersionRef.current;
    try {
      const updated = await communityClient.moderate(postID, change);
      clearCommunityLists();
      setDetail(mergeDetailReactions(updated, postReactionOverridesRef.current, commentReactionOverridesRef.current, startedAtVersion));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "社区管理操作失败。");
      setRetryAction(() => () => { void moderate(change); });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="admin-design community-page"><BrandLoader label="正在加载讨论" /></section>;
  if (!detail) return <section className="admin-design community-page"><p className="community-state community-state--error" role="alert">{error || "讨论不存在。"}{error ? <button type="button" className="community-inline-retry" onClick={() => void reload()}>重试</button> : null}</p><button className="community-thread__back" type="button" onClick={backToCommunity}><CommunityIcon name="arrowLeft" />返回吉甲社区</button></section>;

  const { post, comments } = detail;
  const canManageFeatured = currentUser.role.name === "super_admin" && post.groupId === 0 && post.visibility === "public";
  const parentByID = new Map(comments.map((item) => [item.id, item]));
  const repliesByParentID = groupCommunityReplies(comments);
  const readingEntries = buildCommunityReadingEntries(post, comments);
  const readingIndexByCommentID = new Map<number, number>();
  readingEntries.forEach((entry, index) => {
    if (entry.commentId !== undefined) readingIndexByCommentID.set(entry.commentId, index);
  });
  const hotReply = findHotCommunityReply(comments);
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
    <div className="community-thread__layout">
      <div className="community-thread__content">
        <button className="community-thread__back" type="button" onClick={backToCommunity}><CommunityIcon name="arrowLeft" />返回吉甲社区</button>
        {error ? <p className="community-state community-state--error" role="alert">{error}{retryAction ? <button type="button" className="community-inline-retry" onClick={() => retryAction()}>重试</button> : null}</p> : null}
    <article id={`community-post-${post.id}`} data-community-reading-index="0" className={`community-post${post.isPinned ? " is-pinned" : ""}`}>
      <div className="community-post__author">
        <CommunityAuthorProfile id={post.authorId} name={post.authorName} avatar={post.authorAvatar} level={post.authorLevel} featuredBadge={post.authorFeaturedBadge} positions={post.authorPositions} teamIdentityStatus={post.authorTeamIdentityStatus} />
        <div className="community-post__byline"><time dateTime={post.createdAt}>{formatCommunityDate(post.createdAt)}{post.editedAt ? " · 已编辑" : ""} · {post.viewCount ?? 0} 浏览</time></div>
        {post.isPinned ? <span className="community-post__pin"><CommunityIcon name="pin" />置顶</span> : null}
        <CommunityFeaturedMark featured={post.isFeatured} />
        <span className="community-post__category">{communityCategoryLabel(post.category)}</span>
        <CommunityPostMenu
          post={post}
          busy={busy || postReactionBusy}
          canManageFeatured={canManageFeatured}
          onModerate={(change) => void moderate(change)}
          onToggleFeatured={() => void togglePostFeatured()}
          onEdit={!editingPost ? () => { setEditTitle(post.title); setEditBody(post.body); setEditCategory(post.category); setEditPostUploads([]); setEditingPost(true); } : undefined}
          onDelete={() => void deletePost()}
        />
      </div>
      {post.isLegacy && post.groupName ? <p className="community-post__scope">{post.visibility === "private" ? "历史私密讨论" : `${post.groupName} · 历史讨论`}</p> : null}
      {post.isFaq ? <span className="community-post__faq">FAQ</span> : null}
      {editingPost ? <form id="community-post-edit" className="community-composer" onSubmit={savePostEdit}>
        <label className="community-field">标题<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={160} required /></label>
        <label className="community-field">分类<select value={editCategory} onChange={(event) => setEditCategory(event.target.value as CommunityCategory)}>{COMMUNITY_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <div className="community-field community-field--editor"><span>正文</span><Suspense fallback={<div className="community-markdown-editor__loading" role="status">正在打开编辑器…</div>}><CommunityMarkdownEditor value={editBody} onChange={setEditBody} flushRef={editPostFlushRef} uploads={editPostUploads} onUploadsChange={setEditPostUploads} attachments={post.attachments} required placeholder="继续完善这条帖子…" /></Suspense></div>
        <div className="community-composer__actions"><button type="button" className="community-button community-button--quiet" onClick={() => setEditingPost(false)}>取消</button><button type="submit" className="community-button community-button--primary" disabled={busy}>保存修改</button></div>
      </form> : <>
        <h1 className="community-post__title" id="community-thread-title">{post.title}</h1>
        {post.isSolved ? <div className="community-post__resolved-callout" role="status">
          <span className="community-post__resolved"><CommunityIcon name="check" />已解决</span>
          {post.acceptedSolutionId ? <button type="button" onClick={() => focusComment(post.acceptedSolutionId!)}>查看最佳答案<CommunityIcon name="chevronDown" /></button> : null}
        </div> : null}
        <CommunityMarkdown source={post.body} className="community-thread__body" />
        {communityStandaloneAttachments(post.body, post.attachments).length ? <CommunityImageGallery attachments={communityStandaloneAttachments(post.body, post.attachments)} /> : null}
      </>}
      <footer className="community-post__actions">
        <button type="button" aria-pressed={post.likedByMe} disabled={busy || postReactionBusy} onClick={() => void toggleReaction("like")}><CommunityActionIcon kind="like" active={post.likedByMe} /><span>{post.likeCount}</span>{post.likedByMe ? "已赞" : "点赞"}</button>
        <button type="button" aria-pressed={post.savedByMe} disabled={busy || postReactionBusy} onClick={() => void toggleReaction("bookmark")}><CommunityActionIcon kind="bookmark" active={post.savedByMe} />{post.savedByMe ? "已收藏" : "收藏"}</button>
        <button type="button" onClick={() => void sharePost()}><CommunityIcon name="share2" />分享</button>
        {shareStatus ? <span className="community-share-status" role="status">{shareStatus}</span> : null}
      </footer>
    </article>

    <section className="community-comments" id="community-comments" aria-labelledby="community-comments-title">
      <header className="community-comments__heading">
        <div className="community-comments__heading-copy"><h2 id="community-comments-title">讨论</h2><span>· {comments.filter((comment) => !comment.isDeleted).length} 条回复</span></div>
        <button type="button" className="community-button community-button--primary community-comments__reply" onClick={() => openReply()} aria-controls="community-reply-form">
          <CommunityIcon name="messageCircle" />回复话题
        </button>
      </header>
      {comments.map((item) => {
        const parent = item.parentPostId ? parentByID.get(item.parentPostId) : null;
        const replies = repliesByParentID.get(item.id) ?? [];
        const previewAuthors = [...new Map(replies.map((reply) => [reply.authorId, reply])).values()].slice(0, 3);
        const previewsExpanded = expandedReplyPreviewParentIDs.has(item.id);
        const visibleReplies = previewsExpanded ? replies : replies.slice(0, 2);
        const readingIndex = readingIndexByCommentID.get(item.id);
        return <article key={item.id} id={`community-comment-${item.id}`} data-community-reading-index={readingIndex} className={`community-comment${location.hash === `#community-comment-${item.id}` || focusedCommentID === item.id ? " is-targeted" : ""}`} data-reply={Boolean(item.parentPostId)} data-depth={commentDepth(item)}>
          <div className="community-comment__head">
            <CommunityAuthorProfile id={item.authorId} name={item.authorName} avatar={item.authorAvatar} level={item.authorLevel} featuredBadge={item.authorFeaturedBadge} positions={item.authorPositions} teamIdentityStatus={item.authorTeamIdentityStatus} size="small" />
            {item.isAcceptedSolution ? <><span className="community-comment__solution"><CommunityIcon name="check" />最佳答案</span>{item.isFeatured ? <span className="community-comment__secondary-featured" aria-label="同时为精华" title="同时为精华"><CommunityIcon name="star" /></span> : null}</> : <CommunityFeaturedMark featured={item.isFeatured} />}
            <time dateTime={item.createdAt}>{formatCommunityDate(item.createdAt)}{item.editedAt ? " · 已编辑" : ""}</time>
            {!item.isDeleted && (item.canAcceptSolution || canManageFeatured) ? <CommunityCommentManagementMenu
              canManageSolution={item.canAcceptSolution}
              acceptedSolution={item.isAcceptedSolution}
              onToggleSolution={() => void setSolution(item.isAcceptedSolution ? null : item.id)}
              canManageFeatured={canManageFeatured}
              featured={item.isFeatured}
              onToggleFeatured={() => void toggleReplyFeatured(item.id, item.isFeatured)}
              busy={busy}
            /> : null}
          </div>
          {parent ? <button type="button" className="community-comment__context" onClick={() => focusComment(parent.id)}>
            <span>回复 {parent.authorName}</span><span>{parent.isDeleted ? "该回复已删除" : stripCommunityMarkdown(parent.body)}</span>
          </button> : null}
          {editingCommentID === item.id ? <form id={`community-comment-edit-${item.id}`} className="community-comment-edit" onSubmit={(event) => void saveCommentEdit(event, item.id)}><Suspense fallback={<div className="community-markdown-editor__loading" role="status">正在打开编辑器…</div>}><CommunityMarkdownEditor value={editCommentBody} onChange={setEditCommentBody} flushRef={editCommentFlushRef} uploads={editCommentUploads} onUploadsChange={setEditCommentUploads} attachments={item.attachments} compact required placeholder="编辑回复…" /></Suspense><button className="community-button community-button--primary" disabled={busy}>保存</button></form> : <CommunityMarkdown source={item.body} className="community-comment__body" />}
          {communityStandaloneAttachments(item.body, item.attachments).length ? <CommunityImageGallery attachments={communityStandaloneAttachments(item.body, item.attachments)} compact /> : null}
          {replies.length ? <div className="community-reply-preview">
            <div className="community-reply-preview__heading">
              <span>{replies.length} 条回复</span>
              <div className="community-reply-preview__avatars" role="group" aria-label="回复成员头像">
                {previewAuthors.map((reply) => <Link
                  key={reply.authorId}
                  className="community-reply-preview__avatar-link"
                  to={`/dashboard/members/${reply.authorId}`}
                  state={{ communityProfileReturnTo: profileReturnTo }}
                  aria-label={`查看 ${reply.authorName} 的个人主页`}
                  title={reply.authorName}
                ><CommunityAvatar name={reply.authorName} src={reply.authorAvatar} size="small" /></Link>)}
              </div>
            </div>
            <div className="community-reply-preview__items">
              {visibleReplies.map((reply) => <button key={reply.id} type="button" className="community-reply-preview__item" onClick={() => focusComment(reply.id)} aria-label={`定位到 ${reply.authorName} 的回复：${communityReplyPreviewText(reply.body)}`}>
                <strong>{reply.authorName}</strong><span>{communityReplyPreviewText(reply.body)}</span>
              </button>)}
            </div>
            {replies.length > 2 ? <button type="button" className="community-reply-preview__toggle" aria-expanded={previewsExpanded} onClick={() => toggleReplyPreview(item.id)}>{previewsExpanded ? "收起回复预览" : `查看另外 ${replies.length - 2} 条回复`}</button> : null}
          </div> : null}
          {!item.isDeleted && <div className="community-comment__actions">
            <button type="button" onClick={() => openReply(item)}>回复</button>
            <button type="button" className={item.likedByMe ? "is-liked" : ""} aria-label={`${item.likedByMe ? "取消点赞" : "点赞"}，${item.likeCount} 个赞`} aria-pressed={item.likedByMe} disabled={busy || commentReactionBusyIDs.has(item.id) || !item.canLike} onClick={() => void toggleCommentLike(item)}><CommunityActionIcon kind="like" active={item.likedByMe} /><span>{item.likeCount || "赞"}</span></button>
            {item.canEdit ? <><button type="button" onClick={() => { setEditingCommentID(item.id); setEditCommentBody(item.body); setEditCommentUploads([]); }}>编辑</button><button type="button" onClick={() => void deleteComment(item.id)}>删除</button></> : null}
          </div>}
        </article>;
      })}
    </section>

    <CommunityRelatedTopics postId={post.id} returnTo={returnTo} />
    {replyOpen ? <CommunityReplyComposer accountId={currentUser.id} postId={post.id} comments={comments} busy={busy} replyTarget={replyTarget} onReplyTargetChange={setReplyTarget} onClose={() => setReplyOpen(false)} onSubmit={submitComment} /> : null}
      </div>
      <CommunityReadingTimeline entries={readingEntries} hotReplyID={hotReply?.id ?? null} />
    </div>
  </section>;
}
