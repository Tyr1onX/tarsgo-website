import type { RoomObject } from "./pixel-jijia-room.ts";

// Source links retain the community's authorization boundary.
// Set authorName only with the contributor's confirmed public attribution consent.
export type CommunitySource = {
  comment: number;
  date: string;
  role: "suggestion" | "support" | "reply";
  authorName?: string;
};
export type CommunityInteraction = "smoke" | "burst" | "cable" | "old-capacitor" | "glow" | "tools" | "assembly" | "drive" | "terminal" | "silverwolf" | "memoir" | "memory" | "meeting" | "senior" | "laugh" | "poster-laugh";
export function communityCreditRole(sources: readonly CommunitySource[], index: number) {
  const role = sources[index].role;
  if (role === "suggestion") return sources.slice(0,index).some(s=>s.role==="suggestion") ? "共同提出者" : "提出者";
  return role === "support" ? "支持者" : "跟帖者";
}
export type CommunityContribution = {
  sources: readonly CommunitySource[];
  interaction?: CommunityInteraction;
};
const suggestion = (comment: number, day: number, authorName?: string): CommunitySource => ({ comment, date: `2026.11.${String(day).padStart(2, "0")}`, role: "suggestion", ...(authorName ? {authorName} : {}) });
const reply = (comment: number, day: number, role: "support" | "reply", authorName?: string): CommunitySource => ({ ...suggestion(comment, day, authorName), role });
export const communitySourceHref = (source: CommunitySource) => `/dashboard/community/28#community-comment-${source.comment}`;
export const COMMUNITY_PREFIX = "community:";
export const communityDiscoveryId = (object: RoomObject) => COMMUNITY_PREFIX + object.id;

type Entry = RoomObject & { community: CommunityContribution };
const item = (
  id: string, title: string, kind: RoomObject["kind"],
  x: number, y: number, width: number, height: number, sources: CommunitySource[],
  interaction?: CommunityInteraction, host?: string, solid = false,
): Entry => ({
  id, title, kind, x, y, width, height, solid, host,
  community: { sources, interaction },
});

// Host-attached objects inherit the host's draw depth and reachable front
// edge, without introducing additional floor collision.
export const COMMUNITY_ROOM_OBJECTS: Record<string, Entry[]> = {
  electrical: [
    item("burnt-stm32", "烧掉的 STM32", "machine", 2.3, 14.2, 1.65, .55, [suggestion(38, 2, "王达阳"), reply(66, 7, "reply", "冯鲲鹏"), reply(67, 7, "reply", "冯鲲鹏")], "smoke", "solder"),
    item("burst-capacitor", "炸掉的电容", "machine", 4.85, 14.45, .85, .5, [suggestion(41, 2, "王英")], "burst", "solder"),
    item("charge-only-cable", "不能传数据的蓝色数据线", "console", 14.05, 15.1, 1.7, .55, [suggestion(43, 2, "乔炀")], "cable", "embedded"),
    item("old-capacitor", "老旧电容", "machine", 28.55, 10.65, .85, .5, [suggestion(63, 5, "张宇航")], "old-capacitor", "components"),
    item("lit-capacitor", "点亮的电容", "machine", 18.45, 15.1, 1, .55, [suggestion(49, 2, "阿吾扎尔")], "glow", "embedded"),
    item("lit-mos", "点亮的 MOS 管", "machine", 21.15, 15.1, .95, .55, [suggestion(62, 4, "李槐桐")], "glow", "embedded"),
    item("chip-poster", "奶娃 · 调试海报", "display", 26.2, 5, 3.5, .5, [suggestion(64, 5, "符蔚伟")], "poster-laugh"),
  ],
  mechanical: [
    item("tool-pile", "乱中有序的工具", "machine", 26.25, 16.35, 2.2, .6, [suggestion(44, 2, "于博尧")], "tools", "review"),
    item("unfinished-robot", "拆了一半的旧机器人", "machine", 6.6, 15.7, 3.8, 2.4, [suggestion(57, 2, "吴佳蔚")], undefined, undefined, true),
    item("assembly-kit", "机器人组装", "workbench", 19.85, 15.9, 2.05, .65, [suggestion(53, 2, "王思程")], "assembly", "assembly"),
    item("test-robot", "可操控的机器人", "machine", 29.65, 7.8, 3.6, 2.1, [suggestion(48, 2, "徐博喻"), suggestion(71, 8, "郑睿")], "drive", undefined, true),
  ],
  ai: [
    item("hello-terminal", "Hello World", "console", 8.15, 7.9, 3.2, 1.9, [suggestion(50, 2, "刘捷睿")], "terminal", undefined, true),
    item("silverwolf-terminal", "银狼 LV.999", "console", 25, 6.7, 2.25, 1.65, [suggestion(69, 8, "张赛")], "silverwolf", undefined, true),
  ],
  honors: [
    item("memoir", "吉甲回忆录", "display", 24.15, 16.25, 2.45, .6, [suggestion(59, 3, "高雅祺")], "memoir", "history"),
    item("memory-archive", "隐藏回忆", "cabinet", 30.1, 14.4, 2.6, 1.6, [suggestion(59, 3, "高雅祺")], "memory", undefined, true),
  ],
  guild: [
    item("weekly-meeting", "共创周会", "workbench", 2, 16.6, 9.5, 4.4, [suggestion(58, 3, "边婧帼")], "meeting", undefined, true),
    item("senior", "老学长", "reception", 24.5, 13.8, 1.45, .95, [suggestion(70, 8, "陈梓涵")], "senior", undefined, true),
    item("burger", "汉堡王外卖", "display", 28, 17.7, 1.65, .6, [suggestion(42, 2, "马腾宇"), reply(56, 2, "support", "辛逸轩"), reply(61, 3, "support", "王达阳")], undefined, "welcome-wall"),
    item("milk-frog", "奶蛙摆件", "display", 32.15, 17.7, 1.1, .5, [suggestion(45, 2, "王达阳")], "laugh", "welcome-wall"),
  ],
  vision: [
    item("block-landscape", "Minecraft 方块小景", "display", 6.2, 8.2, 2.5, 1.4, [suggestion(51, 2, "颜子闰")], undefined, undefined, true),
  ],
};

// #52 intentionally remains unimplemented: the meaning and any personal
// likeness/relationship authorization have not been confirmed.

export const COMMUNITY_POSES: Record<string, readonly string[]> = {
  "chip-poster": ["chip-poster","pose-poster-laugh-1","pose-poster-laugh-2","pose-poster-laugh-3"],
  "milk-frog": ["milk-frog","pose-frog-laugh-1","pose-frog-laugh-2","pose-frog-laugh-3"],
  "test-robot": ["test-robot", "pose-robot-turn", "pose-robot-start"],
  "senior": ["senior", "pose-senior-1", "pose-senior-2"],
  "weekly-meeting": ["weekly-meeting", "pose-meeting-1", "pose-meeting-2"],
};
