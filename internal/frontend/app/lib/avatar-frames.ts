import type { CommunityFeaturedBadge } from "~/lib/community-member-profile-client";

export type AvatarFrameId =
  | "calibration"
  | "reactor"
  | "titan"
  | "laurel"
  | "hawkeye"
  | "overclock"
  | "group_mech"
  | "group_elec"
  | "group_vision"
  | "group_ai"
  | "group_ops"
  | "rm_league"
  | "rm_regional"
  | "rm_national";

export type AvatarFrameChoice = "auto" | "none" | AvatarFrameId;
export type AvatarFrameTrack = "level" | "honor" | "group" | "event";

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
  groups?: readonly { name: string; role?: string }[];
  badges?: readonly { key: string; levelCode?: string; isEarned?: boolean }[];
  grantedFrameIds?: readonly string[];
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
  // Track C: 战队组别专属轨
  {
    id: "group_mech",
    name: "机械组 · 精密传动齿轮框",
    track: "group",
    tierLabel: "轨道 C · 机械组",
    unlockHint: "加入机械组",
    priority: 20,
  },
  {
    id: "group_elec",
    name: "电控组 · 脉冲总线回路框",
    track: "group",
    tierLabel: "轨道 C · 电控组",
    unlockHint: "加入电控组",
    priority: 20,
  },
  {
    id: "group_vision",
    name: "视觉组 · 光学虹膜识别框",
    track: "group",
    tierLabel: "轨道 C · 视觉组",
    unlockHint: "加入视觉组",
    priority: 20,
  },
  {
    id: "group_ai",
    name: "AI组 · 神经矩阵星核框",
    track: "group",
    tierLabel: "轨道 C · AI 组",
    unlockHint: "加入 AI 组",
    priority: 20,
  },
  {
    id: "group_ops",
    name: "运营组 · 荣耀棱镜勋章框",
    track: "group",
    tierLabel: "轨道 C · 运营组",
    unlockHint: "加入运营组",
    priority: 20,
  },
  // 赛事限定轨: RoboMaster 出征限定
  {
    id: "rm_league",
    name: "RMUL 联盟赛 · 破阵先锋框",
    track: "event",
    tierLabel: "赛事限定 · 联盟赛",
    unlockHint: "暂未开放 · 战队赛事颁发",
    priority: 65,
  },
  {
    id: "rm_regional",
    name: "RMUC 区域赛 · 赛区突围框",
    track: "event",
    tierLabel: "赛事限定 · 区域赛",
    unlockHint: "暂未开放 · 战队赛事颁发",
    priority: 72,
  },
  {
    id: "rm_national",
    name: "RMUC 全国赛 · 殿堂远征框",
    track: "event",
    tierLabel: "赛事限定 · 全国赛",
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

function matchGroupKey(groups: readonly { name: string }[] | undefined, key: "mech" | "elec" | "vision" | "ai" | "ops") {
  if (!groups?.length) return false;
  return groups.some(({ name }) => {
    if (key === "mech") return name.includes("机械");
    if (key === "elec") return name.includes("电控");
    if (key === "vision") return name.includes("视觉");
    if (key === "ai") return name.toUpperCase().includes("AI");
    return name.includes("运营");
  });
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
    case "group_mech":
      return matchGroupKey(ctx.groups, "mech");
    case "group_elec":
      return matchGroupKey(ctx.groups, "elec");
    case "group_vision":
      return matchGroupKey(ctx.groups, "vision");
    case "group_ai":
      return matchGroupKey(ctx.groups, "ai");
    case "group_ops":
      return matchGroupKey(ctx.groups, "ops");
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
