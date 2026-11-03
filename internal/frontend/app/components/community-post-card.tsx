import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useLocation } from "react-router";

import { CommunityIcon } from "~/components/community-icons";
import { CommunityFeaturedMark } from "~/components/community-featured-mark";
import { communityCategoryLabel, communityPostHref, formatCommunityDate, type CommunityPost, type CommunityListItem } from "~/lib/community-client";

export function CommunityAvatar({ name, src, size = "regular", className }: { name: string; src?: string; size?: "regular" | "small"; className?: string }) {
  const initial = Array.from(name.trim())[0] ?? "吉";
  return <span className={`community-avatar community-avatar--${size}${className ? ` ${className}` : ""}`} aria-hidden="true">
    {src ? <img src={src} alt="" loading="lazy" /> : initial}
  </span>;
}

export function CommunityPostCard({ post }: { post: CommunityListItem }) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const postState = { communityReturnTo: returnTo };
  const participants = post.participants?.slice(0, 5) ?? [];
  const lastActivity = post.lastReplyAt ?? post.createdAt;
  return <article className={`community-topic-row${post.isPinned ? " is-pinned" : ""}`}>
    <div className="community-topic-row__main">
      <h2 className="community-topic-row__title"><Link to={communityPostHref(post.id)} state={postState}>{post.title}</Link></h2>
      <div className="community-topic-row__labels">
        {post.isPinned ? <span className="community-post__pin"><CommunityIcon name="pin" />置顶</span> : null}
        <CommunityFeaturedMark featured={post.isFeatured} />
        {post.isSolved ? <span className="community-post__resolved"><CommunityIcon name="check" />已解决</span> : null}
        <span className="community-post__category">{communityCategoryLabel(post.category)}</span>
      </div>
    </div>
    <div className="community-topic-row__activity">
      <div className="community-topic-row__participants" role="group" aria-label="最近参与成员">
        {participants.map((participant) => <Link
          key={participant.id}
          className="community-topic-row__participant"
          to={`/dashboard/members/${participant.id}`}
          state={{ communityProfileReturnTo: returnTo }}
          aria-label={`查看 ${participant.name} 的资料`}
          title={participant.name}
        ><CommunityAvatar name={participant.name} src={participant.avatarUrl} size="small" /></Link>)}
      </div>
      <span className="community-topic-row__stat" aria-label={`${post.commentCount} 条回复`}>{post.commentCount} 回复</span>
      <span className="community-topic-row__stat" aria-label={`${post.viewCount ?? 0} 次浏览`}>{post.viewCount ?? 0} 浏览</span>
      <time className="community-topic-row__time" dateTime={lastActivity} aria-label={`最近活动 ${formatCommunityDate(lastActivity)}`} title="最近活动">{formatCommunityDate(lastActivity)}</time>
    </div>
  </article>;
}

export type CommunityModerationChange = { pinned?: boolean; hidden?: boolean };

export function CommunityPostMenu({
  post,
  busy = false,
  canManageFeatured = false,
  onModerate,
  onToggleFeatured,
  onEdit,
  onDelete,
}: {
  post: CommunityPost;
  busy?: boolean;
  canManageFeatured?: boolean;
  onModerate?: (change: CommunityModerationChange) => void;
  onToggleFeatured?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hasActions = Boolean((canManageFeatured && onToggleFeatured) || (post.canModerate && onModerate) || (post.canEdit && (onEdit || onDelete)));

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
      {canManageFeatured && onToggleFeatured ? <button type="button" role="menuitem" disabled={busy} aria-pressed={post.isFeatured} onClick={() => run(onToggleFeatured)}>
        <CommunityIcon name="star" />{post.isFeatured ? "取消精华" : "设为精华"}
      </button> : null}
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

export function CommunityActionIcon({ kind, active = false }: { kind: "like" | "comment" | "bookmark"; active?: boolean }) {
  const name = kind === "like" ? "heart" : kind === "comment" ? "messageCircle" : "bookmark";
  return <CommunityIcon name={name} className={`community-action-icon${active ? " is-active" : ""}`} />;
}
