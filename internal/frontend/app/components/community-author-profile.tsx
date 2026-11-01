import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import { CommunityBadgeInfo } from "~/components/community-badge-mark";
import { CommunityLevelBadge } from "~/components/community-growth";
import { communityMemberProfileClient, type CommunityMemberPosition, type CommunityMemberProfileResult, type CommunityFeaturedBadge } from "~/lib/community-member-profile-client";

type AuthorProfileProps = {
  id: number;
  name: string;
  avatar?: string;
  level: number;
  featuredBadge?: CommunityFeaturedBadge;
  positions?: CommunityMemberPosition[];
  size?: "regular" | "small";
};

export function CommunityAuthorProfile({ id, name, avatar, level, featuredBadge, positions: authorPositions = [], size = "regular" }: AuthorProfileProps) {
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<CommunityMemberProfileResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || profile?.member.id === id) return;
    let active = true;
    setLoading(true);
    setError(false);
    communityMemberProfileClient.get(id, "card").then((result) => {
      if (active) setProfile(result);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id, open, profile]);

  const member = profile?.member.id === id ? profile.member : undefined;
  const badge = member ? member.featuredBadge : featuredBadge;
  const groups = member?.groups ?? [];
  const positions = member?.positions ?? authorPositions;
  const primaryPosition = positions[0];
  const positionLabel = primaryPosition ? `${primaryPosition.categoryTitle} · ${primaryPosition.title}` : "";
  return <div
    className={`community-author-profile${size === "small" ? " community-author-profile--small" : ""}`}
    ref={rootRef}
    onBlur={() => window.requestAnimationFrame(() => {
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    })}
  >
    <button
      type="button"
      className="community-author-profile__trigger"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={`查看 ${name} 的社区资料卡`}
      onClick={() => setOpen((value) => !value)}
    >
      <span className={`community-avatar community-avatar--${size}`} aria-hidden="true">
        {avatar ? <img src={avatar} alt="" loading="lazy" /> : Array.from(name.trim())[0] ?? "吉"}
      </span>
      <strong>{name}</strong>
      <CommunityLevelBadge level={member?.level.level ?? level} />
      {positionLabel ? <span className="community-author-profile__position" title={positions.map((position) => `${position.categoryTitle} · ${position.title}`).join("；")}>{positionLabel}</span> : null}
    </button>
    {badge ? <CommunityBadgeInfo className="community-author-profile__badge" badge={badge} size={18} /> : null}
    {open ? <section className="community-author-profile__popover" role="dialog" aria-label={`${name} 的社区资料卡`}>
      <header className="community-author-profile__card-head">
        <span className="community-avatar community-avatar--regular" aria-hidden="true">
          {member?.avatarUrl || avatar ? <img src={member?.avatarUrl ?? avatar} alt="" /> : Array.from(member?.displayName ?? name)[0] ?? "吉"}
        </span>
        <div className="community-author-profile__identity">
          <strong>{member?.displayName ?? name}</strong>
          <CommunityLevelBadge level={member?.level.level ?? level} />
        </div>
        {badge ? <CommunityBadgeInfo className="community-author-profile__card-badge" badge={badge} size={28} /> : null}
      </header>
      {loading ? <p className="community-author-profile__status" role="status">正在读取资料…</p> : null}
      {!loading && error ? <p className="community-author-profile__status">部分资料暂不可用</p> : null}
      {member?.bio ? <p className="community-author-profile__bio">{member.bio}</p> : null}
      {groups.length || positions.length ? <div className="community-author-profile__groups">
        {groups.map((group) => <span key={`${group.name}-${group.role}`}>{group.name} · {group.role}</span>)}
        {positions.map((position) => <span key={position.id}>{position.categoryTitle} · {position.title}</span>)}
      </div> : null}
      {member ? <p className="community-author-profile__stats">{member.level.totalXp.toLocaleString("zh-CN")} XP · Lv.{member.level.level}</p> : null}
      <Link
        className="community-author-profile__link"
        to={`/dashboard/members/${id}`}
        state={{ communityProfileReturnTo: returnTo }}
        onClick={() => setOpen(false)}
      >查看个人主页</Link>
    </section> : null}
  </div>;
}
