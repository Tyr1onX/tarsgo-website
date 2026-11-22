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
  description: string;
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
    unlockHint: "社区等级达到 Lv.2 自动解锁",
    description: "精密游标刻度与四向准星，迈入工程社区的第一枚标识。",
    priority: 10,
  },
  {
    id: "reactor",
    name: "星核轨道反应堆",
    track: "level",
    tierLabel: "轨道 A · Lv.4",
    unlockHint: "社区等级达到 Lv.4 自动解锁",
    description: "双向逆转涡轮齿环与青金等离子能弧，社区核心研发标志。",
    priority: 30,
  },
  {
    id: "titan",
    name: "泰坦机甲皇冠",
    track: "level",
    tierLabel: "轨道 A · Lv.6",
    unlockHint: "社区等级达到 Lv.6 自动解锁",
    description: "双侧破框机甲翼片、三叉金属皇冠与黑曜石倒角护环，顶级常驻排面。",
    priority: 50,
  },
  // Track B: 荣誉与成就轨
  {
    id: "laurel",
    name: "共建者荣耀桂冠",
    track: "honor",
    tierLabel: "轨道 B · 共建者",
    unlockHint: "获得「共建者」徽章自动解锁（随铜/银/金进阶）",
    description: "立体锻造机械桂冠双翼与底部菱形勋章，献给建设战队平台的贡献者。",
    priority: 60,
  },
  {
    id: "hawkeye",
    name: "鹰眼火控瞄准框",
    track: "honor",
    tierLabel: "轨道 B · 活跃答疑",
    unlockHint: "Lv.3 且累计回复或获赞 ≥ 5 次解锁",
    description: "实时旋转雷达扇区与重型四角 HUD 护角，赛场自瞄火控既视感。",
    priority: 25,
  },
  {
    id: "overclock",
    name: "赛场烈焰超频核心",
    track: "honor",
    tierLabel: "轨道 B · 连签 7 天",
    unlockHint: "连续签到满 7 天自动解锁",
    description: "碳金锋刃双翼、熔金能量内环与浮升余烬，属于最自律的打卡队员。",
    priority: 40,
  },
  // Track C: 战队组别专属轨
  {
    id: "group_mech",
    name: "机械组 · 精密传动齿轮框",
    track: "group",
    tierLabel: "轨道 C · 机械组",
    unlockHint: "所属组别包含「机械组」自动解锁",
    description: "黑曜石倒角齿轮外圈与双侧液压卡钳护翼，致敬硬核结构与传动美学。",
    priority: 20,
  },
  {
    id: "group_elec",
    name: "电控组 · 脉冲总线回路框",
    track: "group",
    tierLabel: "轨道 C · 电控组",
    unlockHint: "所属组别包含「电控组」自动解锁",
    description: "蚀刻金线 PCB 回路、青金脉冲电流弧与上下总线接口，底盘云台的心脏。",
    priority: 20,
  },
  {
    id: "group_vision",
    name: "视觉组 · 光学虹膜识别框",
    track: "group",
    tierLabel: "轨道 C · 视觉组",
    unlockHint: "所属组别包含「视觉组」自动解锁",
    description: "多叶片机械光圈虹膜与光学测距刻度环，精准锁定每一帧赛场目标。",
    priority: 20,
  },
  {
    id: "group_ai",
    name: "AI组 · 神经矩阵星核框",
    track: "group",
    tierLabel: "轨道 C · AI 组",
    unlockHint: "所属组别包含「AI 组」自动解锁",
    description: "六边形神经突触矩阵与顶部四芒算力星核，承载自主决策与前沿算法。",
    priority: 20,
  },
  {
    id: "group_ops",
    name: "运营组 · 荣耀棱镜勋章框",
    track: "group",
    tierLabel: "轨道 C · 运营组",
    unlockHint: "所属组别包含「运营组」自动解锁",
    description: "香槟金切面棱镜外环与丝带翼饰，凝聚战队品牌叙事与对外排面。",
    priority: 20,
  },
  // 赛事限定轨: RoboMaster 出征限定
  {
    id: "rm_league",
    name: "RMUL 联盟赛 · 破阵先锋框",
    track: "event",
    tierLabel: "赛事限定 · 联盟赛",
    unlockHint: "参加 RoboMaster 高校联盟赛由战队颁发解锁",
    description: "赤金战术V型装甲翼与红蓝赛场脉冲饰条，致敬首次披甲上阵的联盟赛征程。",
    priority: 65,
  },
  {
    id: "rm_regional",
    name: "RMUC 区域赛 · 赛区突围框",
    track: "event",
    tierLabel: "赛事限定 · 区域赛",
    unlockHint: "参加 RoboMaster 超级对抗赛区域赛由战队颁发解锁",
    description: "双色对抗能环、重型八角盾甲与战旗飞翼，记录区域赛突围的高燃时刻。",
    priority: 72,
  },
  {
    id: "rm_national",
    name: "RMUC 全国赛 · 殿堂远征框",
    track: "event",
    tierLabel: "赛事限定 · 全国赛",
    unlockHint: "出征 RoboMaster 全国赛由战队统一颁发解锁",
    description: "破框镀金胜利双翼、殿堂级三叉冠冕与 RMUC 铭牌，战队最高赛事荣耀标识。",
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
