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
