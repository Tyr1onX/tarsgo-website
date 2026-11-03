import { useEffect, useRef, useState } from "react";

import { CoBuilderBadgeMark } from "~/components/co-builder-badge-mark";
import { CommunityIcon } from "~/components/community-icons";
import type { CommunityFeaturedBadge } from "~/lib/community-member-profile-client";

export function CommunityBadgeMark({ badge, size = 32, className }: { badge: CommunityFeaturedBadge; size?: number; className?: string }) {
  if (badge.key === "co_builder") {
    return <CoBuilderBadgeMark className={className} level={badge.levelCode} size={size} />;
  }
  return <span
    className={`community-generic-badge community-generic-badge--${badge.levelCode}${className ? ` ${className}` : ""}`}
    role="img"
    aria-label={`${badge.name} ${badge.levelLabel}徽章`}
    style={{ width: size, height: size }}
  ><CommunityIcon name="award" /></span>;
}

export function CommunityBadgeInfo({ badge, size = 32, className, onReplay }: { badge: CommunityFeaturedBadge; size?: number; className?: string; onReplay?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

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

  const earnedAt = badge.earnedAt ? new Date(badge.earnedAt) : null;
  const earnedAtLabel = earnedAt && !Number.isNaN(earnedAt.getTime())
    ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "long" }).format(earnedAt)
    : "";

  return <div className={`community-badge-info${className ? ` ${className}` : ""}`} ref={rootRef} onBlur={() => window.requestAnimationFrame(() => {
    if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
  })}>
    <button
      ref={triggerRef}
      type="button"
      className="community-badge-info__trigger"
      aria-label={`查看徽章信息：${badge.name}，${badge.levelLabel}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    ><CommunityBadgeMark badge={badge} size={size} /></button>
    {open ? <section className="community-badge-info__popover" role="dialog" aria-label={`${badge.name}徽章信息`}>
      <strong>{badge.name}</strong>
      <span>{badge.levelLabel}</span>
      {badge.description ? <p>{badge.description}</p> : null}
      {earnedAtLabel ? <time dateTime={badge.earnedAt}>{earnedAtLabel}</time> : null}
      {onReplay ? <button type="button" className="community-inline-link" onClick={() => { setOpen(false); onReplay(); }}>重播解锁动画</button> : null}
    </section> : null}
  </div>;
}
