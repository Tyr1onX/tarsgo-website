import { Link, useLocation } from "react-router";

import { CommunityIcon } from "~/components/community-icons";
import { CommunityImageGallery } from "~/components/community-image-gallery";
import { communityCategoryLabel, communityPostHref, formatCommunityDate, type CommunityPost } from "~/lib/community-client";

export function CommunityAvatar({ name, src, size = "regular" }: { name: string; src?: string; size?: "regular" | "small" }) {
  const initial = Array.from(name.trim())[0] ?? "吉";
  return <span className={`community-avatar community-avatar--${size}`} aria-hidden="true">
    {src ? <img src={src} alt="" loading="lazy" /> : initial}
  </span>;
}

export function CommunityPostCard({
  post,
  busy = false,
  onLike,
  onBookmark,
}: {
  post: CommunityPost;
  busy?: boolean;
  onLike?: (post: CommunityPost) => void;
  onBookmark?: (post: CommunityPost) => void;
}) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const postState = { communityReturnTo: returnTo };
  const excerpt = post.body.trim().replace(/\s+/g, " ");
  const hasRecentReply = Boolean(post.lastReplyAt && new Date(post.lastReplyAt).getTime() > new Date(post.createdAt).getTime());
  return <article className={`community-post${post.isPinned ? " is-pinned" : ""}`}>
    <div className="community-post__author">
      <CommunityAvatar name={post.authorName} src={post.authorAvatar} />
      <div className="community-post__byline">
        <strong>{post.authorName}</strong>
        <time dateTime={hasRecentReply ? post.lastReplyAt : post.createdAt}>{hasRecentReply ? `最近回复 ${formatCommunityDate(post.lastReplyAt!)}` : formatCommunityDate(post.createdAt)}{post.editedAt ? " · 已编辑" : ""}</time>
      </div>
      {post.isPinned ? <span className="community-post__pin">置顶</span> : null}
      <span className="community-post__category">{communityCategoryLabel(post.category)}</span>
    </div>
    <h2 className="community-post__title"><Link to={communityPostHref(post.id)} state={postState}>{post.title}</Link></h2>
    {post.isLegacy && post.groupName ? <p className="community-post__scope">{post.visibility === "private" ? "历史私密讨论" : `${post.groupName} · 历史讨论`}</p> : null}
    {post.isFaq ? <span className="community-post__faq">FAQ</span> : null}
    <p className="community-post__excerpt">{excerpt}</p>
    {post.attachments.length ? <CommunityImageGallery attachments={post.attachments} compact /> : null}
    <footer className="community-post__actions">
      <button type="button" aria-label={`${post.likedByMe ? "取消点赞" : "点赞"}，${post.likeCount} 个赞`} aria-pressed={post.likedByMe} disabled={busy || !onLike} onClick={() => onLike?.(post)}>
        <CommunityActionIcon kind="like" /> <span>{post.likeCount}</span> <span className="sr-only">{post.likedByMe ? "取消点赞" : "点赞"}</span>
      </button>
      <Link to={communityPostHref(post.id)} state={postState} aria-label={`查看 ${post.commentCount} 条评论`}>
        <CommunityActionIcon kind="comment" /> <span>{post.commentCount}</span>
      </Link>
      <button type="button" aria-label={post.savedByMe ? "取消收藏" : "收藏"} aria-pressed={post.savedByMe} disabled={busy || !onBookmark} onClick={() => onBookmark?.(post)}>
        <CommunityActionIcon kind="bookmark" /> <span className="sr-only">{post.savedByMe ? "取消收藏" : "收藏"}</span>
      </button>
    </footer>
  </article>;
}

export function CommunityActionIcon({ kind }: { kind: "like" | "comment" | "bookmark" }) {
  const name = kind === "like" ? "heart" : kind === "comment" ? "messageCircle" : "bookmark";
  return <CommunityIcon name={name} className="community-action-icon" />;
}
