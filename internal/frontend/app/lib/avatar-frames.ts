import type { CommunityFeaturedBadge } from "~/lib/community-member-profile-client";

export type AvatarFrameId =
  | "calibration"
  | "reactor"
  | "titan"
  | "laurel"
  | "hawkeye"
  | "overclock"
  | "rm_league"
  | "rm_regional"
  | "rm_national";

export type AvatarFrameChoice = "auto" | "none" | AvatarFrameId;
export type AvatarFrameTrack = "level" | "honor" | "event";

export interface AvatarFrameDefinition {
  id: AvatarFrameId;
  name: string;
  track: AvatarFrameTrack;
  tierLabel: string;
  unlockHint: string;
  priority: number;
}

export interface AvatarFrameContext {
  userId?: number;
  level: number;
  featuredBadge?: CommunityFeaturedBadge | null;
  hasSevenDayStreak?: boolean;
  avatarFrameKey?: string;
  replyCount?: number;
  likeCount?: number;
  badges?: readonly { key: string; levelCode?: string; isEarned?: boolean }[];
  grantedFrameIds?: readonly string[];
  seasonYear?: number;
}

export const AVATAR_FRAMES: readonly AvatarFrameDefinition[] = [
  // Track A: 社区等级轨
  {
    id: "calibration",
    name: "校准刻度环",
    track: "level",
    tierLabel: "轨道 A · Lv.2",
    unlockHint: "达到社区 Lv.2",
    priority: 10,
  },
  {
    id: "reactor",
    name: "星核轨道反应堆",
    track: "level",
    tierLabel: "轨道 A · Lv.4",
    unlockHint: "达到社区 Lv.4",
    priority: 30,
  },
  {
    id: "titan",
    name: "泰坦机甲皇冠",
    track: "level",
    tierLabel: "轨道 A · Lv.6",
    unlockHint: "达到社区 Lv.6",
    priority: 50,
  },
  // Track B: 荣誉与成就轨
  {
    id: "laurel",
    name: "共建者荣耀桂冠",
    track: "honor",
    tierLabel: "轨道 B · 共建者",
    unlockHint: "获得「共建者」徽章",
    priority: 60,
  },
  {
    id: "hawkeye",
    name: "鹰眼火控瞄准框",
    track: "honor",
    tierLabel: "轨道 B · 活跃答疑",
    unlockHint: "Lv.3 且累计回复或获赞 5 次",
    priority: 25,
  },
  {
    id: "overclock",
    name: "赛场烈焰超频核心",
    track: "honor",
    tierLabel: "轨道 B · 连签 7 天",
    unlockHint: "连续签到 7 天",
    priority: 40,
  },
  // 赛事限定轨: RoboMaster 出征限定（带赛季年份）
  {
    id: "rm_league",
    name: "RMUL 2026 联盟赛 · 破阵先锋框",
    track: "event",
    tierLabel: "赛事限定 · 2026 联盟赛",
    unlockHint: "暂未开放 · 战队赛事颁发",
    priority: 65,
  },
  {
    id: "rm_regional",
    name: "RMUC 2026 区域赛 · 赛区突围框",
    track: "event",
    tierLabel: "赛事限定 · 2026 区域赛",
    unlockHint: "暂未开放 · 战队赛事颁发",
    priority: 72,
  },
  {
    id: "rm_national",
    name: "RMUC 2026 全国赛 · 殿堂远征框",
    track: "event",
    tierLabel: "赛事限定 · 2026 全国赛",
    unlockHint: "暂未开放 · 战队赛事颁发",
    priority: 80,
  },
] as const;

export function getLevelUnlockedFrameName(level: number): string | null {
  if (level === 2) return "校准刻度环";
  if (level === 4) return "星核轨道反应堆";
  if (level === 6) return "泰坦机甲皇冠";
  return null;
}

function hasEventGrant(ctx: AvatarFrameContext, frameId: "rm_league" | "rm_regional" | "rm_national"): boolean {
  if (ctx.grantedFrameIds?.includes(frameId)) return true;
  if (ctx.featuredBadge?.key === frameId && ctx.featuredBadge.levelCode !== "none") return true;
  return Boolean(ctx.badges?.some((b) => b.key === frameId && b.isEarned !== false && b.levelCode !== "none"));
}

export function isAvatarFrameUnlocked(frameId: AvatarFrameId, ctx: AvatarFrameContext): boolean {
  switch (frameId) {
    case "calibration":
      return ctx.level >= 2;
    case "reactor":
      return ctx.level >= 4;
    case "titan":
      return ctx.level >= 6;
    case "laurel":
      return Boolean(ctx.featuredBadge && ctx.featuredBadge.key === "co_builder" && ctx.featuredBadge.levelCode !== "none");
    case "hawkeye":
      return ctx.level >= 3 && ((ctx.replyCount ?? 0) >= 5 || (ctx.likeCount ?? 0) >= 5);
    case "overclock":
      return ctx.hasSevenDayStreak === true;
    case "rm_league":
    case "rm_regional":
    case "rm_national":
      return hasEventGrant(ctx, frameId);
    default:
      return false;
  }
}

export function getUnlockedAvatarFrames(ctx: AvatarFrameContext): AvatarFrameDefinition[] {
  return AVATAR_FRAMES.filter((frame) => isAvatarFrameUnlocked(frame.id, ctx));
}

export function resolveEquippedAvatarFrame(ctx: AvatarFrameContext): AvatarFrameId | null {
  const pref = ctx.avatarFrameKey ?? "auto";
  if (pref === "none") return null;
  const selected = AVATAR_FRAMES.find((frame) => frame.id === pref);
  if (selected) {
    // The server validates every explicit selection before storing it.
    return selected.id;
  }
  const unlocked = getUnlockedAvatarFrames(ctx).sort((a, b) => b.priority - a.priority);
  return unlocked[0]?.id ?? null;
}
