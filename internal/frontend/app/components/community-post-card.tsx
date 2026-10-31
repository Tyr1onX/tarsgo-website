import { Link } from "react-router";

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
  const excerpt = Array.from(post.body.trim()).slice(0, 280).join("");
  return <article className={`community-post${post.isPinned ? " is-pinned" : ""}`}>
    <div className="community-post__author">
      <CommunityAvatar name={post.authorName} src={post.authorAvatar} />
      <div className="community-post__byline">
        <strong>{post.authorName}</strong>
        <time dateTime={post.createdAt}>{formatCommunityDate(post.createdAt)}{post.editedAt ? " · 已编辑" : ""}</time>
      </div>
      <span className="community-post__category">{communityCategoryLabel(post.category)}</span>
    </div>
    {post.isPinned ? <span className="community-post__pin">置顶</span> : null}
    <h2 className="community-post__title"><Link to={communityPostHref(post.id)}>{post.title}</Link></h2>
    {post.isLegacy && post.groupName ? <p className="community-post__scope">{post.visibility === "private" ? "历史私密讨论" : `${post.groupName} · 历史讨论`}</p> : null}
    {post.isFaq ? <span className="community-post__faq">FAQ</span> : null}
    <p className="community-post__excerpt">{excerpt}{Array.from(post.body.trim()).length > 280 ? "…" : ""}</p>
    {post.attachments.length ? <div className="community-post__images" aria-label="帖子图片">
      {post.attachments.slice(0, 4).map((file) => <a href={file.url} target="_blank" rel="noreferrer" key={file.id} aria-label={`打开图片：${file.fileName}`}>
        <img src={file.url} alt={file.fileName} loading="lazy" />
      </a>)}
      {post.attachments.length > 4 ? <span>+{post.attachments.length - 4}</span> : null}
    </div> : null}
    <footer className="community-post__actions">
      <button type="button" aria-pressed={post.likedByMe} disabled={busy || !onLike} onClick={() => onLike?.(post)}>
        <CommunityActionIcon kind="like" /> <span>{post.likeCount}</span> <span className="sr-only">{post.likedByMe ? "取消点赞" : "点赞"}</span>
      </button>
      <Link to={communityPostHref(post.id)} aria-label={`查看 ${post.commentCount} 条评论`}>
        <CommunityActionIcon kind="comment" /> <span>{post.commentCount}</span>
      </Link>
      <button type="button" aria-pressed={post.savedByMe} disabled={busy || !onBookmark} onClick={() => onBookmark?.(post)}>
        <CommunityActionIcon kind="bookmark" /> <span className="sr-only">{post.savedByMe ? "取消收藏" : "收藏"}</span>
      </button>
    </footer>
  </article>;
}

export function CommunityActionIcon({ kind }: { kind: "like" | "comment" | "bookmark" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}>
    {kind === "like" ? <path d="M12 20s-7.2-4.2-8.7-8.5C1.6 6.7 7.3 3.5 12 8c4.7-4.5 10.4-1.3 8.7 3.5C19.2 15.8 12 20 12 20Z" /> : null}
    {kind === "comment" ? <><path d="M20 11.4a7.4 7.4 0 0 1-7.8 7.4 8.4 8.4 0 0 1-3.6-.8L4 19l1.2-3.9a7.2 7.2 0 0 1-1.4-4.3A7.6 7.6 0 0 1 12 3.5a7.6 7.6 0 0 1 8 7.9Z" /><path d="M8.5 11.5h.01m3.49 0h.01m3.49 0h.01" /></> : null}
    {kind === "bookmark" ? <path d="M6.5 4.5h11v16L12 17l-5.5 3.5z" /> : null}
  </svg>;
}
