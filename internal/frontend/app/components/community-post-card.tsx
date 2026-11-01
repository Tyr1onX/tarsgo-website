import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useLocation } from "react-router";

import { CommunityIcon } from "~/components/community-icons";
import { CommunityImageGallery } from "~/components/community-image-gallery";
import { CommunityAuthorProfile } from "~/components/community-author-profile";
import { communityStandaloneAttachments, stripCommunityMarkdown } from "~/lib/community-markdown";
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
  onModerate,
}: {
  post: CommunityPost;
  busy?: boolean;
  onLike?: (post: CommunityPost) => void;
  onBookmark?: (post: CommunityPost) => void;
  onModerate?: (post: CommunityPost, change: CommunityModerationChange) => void;
}) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const postState = { communityReturnTo: returnTo };
  const excerpt = stripCommunityMarkdown(post.body);
  const galleryAttachments = communityStandaloneAttachments(post.body, post.attachments);
  const hasRecentReply = Boolean(post.lastReplyAt && new Date(post.lastReplyAt).getTime() > new Date(post.createdAt).getTime());
  return <article className={`community-post${post.isPinned ? " is-pinned" : ""}`}>
    <div className="community-post__author">
      <CommunityAuthorProfile id={post.authorId} name={post.authorName} avatar={post.authorAvatar} level={post.authorLevel} featuredBadge={post.authorFeaturedBadge} positions={post.authorPositions} />
      <div className="community-post__byline"><time dateTime={hasRecentReply ? post.lastReplyAt : post.createdAt}>{hasRecentReply ? `最近回复 ${formatCommunityDate(post.lastReplyAt!)}` : formatCommunityDate(post.createdAt)}{post.editedAt ? " · 已编辑" : ""}</time></div>
      {post.isPinned ? <span className="community-post__pin"><CommunityIcon name="pin" />置顶</span> : null}
      <span className="community-post__category">{communityCategoryLabel(post.category)}</span>
      <CommunityPostMenu post={post} busy={busy} onModerate={onModerate ? (change) => onModerate(post, change) : undefined} />
    </div>
    <h2 className="community-post__title"><Link to={communityPostHref(post.id)} state={postState}>{post.title}</Link></h2>
    {post.isLegacy && post.groupName ? <p className="community-post__scope">{post.visibility === "private" ? "历史私密讨论" : `${post.groupName} · 历史讨论`}</p> : null}
    {post.isFaq ? <span className="community-post__faq">FAQ</span> : null}
    <p className="community-post__excerpt">{excerpt}</p>
    {galleryAttachments.length ? <CommunityImageGallery attachments={galleryAttachments} compact /> : null}
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

export type CommunityModerationChange = { pinned?: boolean; hidden?: boolean };

export function CommunityPostMenu({
  post,
  busy = false,
  onModerate,
  onEdit,
  onDelete,
}: {
  post: CommunityPost;
  busy?: boolean;
  onModerate?: (change: CommunityModerationChange) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hasActions = Boolean((post.canModerate && onModerate) || (post.canEdit && (onEdit || onDelete)));

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!hasActions) return null;

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    items[(currentIndex + delta + items.length) % items.length]?.focus();
  }

  function run(action?: () => void) {
    setOpen(false);
    action?.();
  }

  return <div className="community-post-menu" ref={rootRef} onBlur={() => window.requestAnimationFrame(() => {
    if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
  })}>
    <button
      ref={triggerRef}
      type="button"
      className="community-post-menu__trigger"
      aria-label="更多帖子操作"
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={busy}
      onClick={() => setOpen((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && !open) {
          event.preventDefault();
          setOpen(true);
          requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
        }
      }}
    ><CommunityIcon name="moreVertical" /></button>
    {open ? <div className="community-post-menu__items" role="menu" aria-label="帖子操作" ref={menuRef} onKeyDown={handleMenuKeyDown}>
      {post.canModerate && onModerate ? <>
        <button type="button" role="menuitem" disabled={busy} onClick={() => run(() => onModerate({ pinned: !post.isPinned }))}>
          <CommunityIcon name="pin" />{post.isPinned ? "取消置顶" : "置顶"}
        </button>
        <button type="button" role="menuitem" disabled={busy} onClick={() => run(() => onModerate({ hidden: !post.isHidden }))}>
          {post.isHidden ? "取消隐藏" : "隐藏"}
        </button>
      </> : null}
      {post.canEdit && onEdit ? <button type="button" role="menuitem" disabled={busy} onClick={() => run(onEdit)}>编辑</button> : null}
      {post.canEdit && onDelete ? <button type="button" role="menuitem" disabled={busy} onClick={() => run(onDelete)}>删除</button> : null}
    </div> : null}
  </div>;
}

export function CommunityActionIcon({ kind }: { kind: "like" | "comment" | "bookmark" }) {
  const name = kind === "like" ? "heart" : kind === "comment" ? "messageCircle" : "bookmark";
  return <CommunityIcon name={name} className="community-action-icon" />;
}
