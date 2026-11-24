import type { RoomObject } from "./pixel-jijia-room.ts";

// The community post is member-only. Source links retain its existing
// authorization boundary; no account IDs, real names or private media are
// embedded in the publicly accessible campus bundle.
export type CommunitySource = {
  comment: number;
  date: string;
  role: "suggestion" | "support" | "reply";
};
export type CommunityInteraction = "smoke" | "burst" | "cable" | "old-capacitor" | "glow" | "tools" | "assembly" | "drive" | "terminal" | "silverwolf" | "memoir" | "memory" | "meeting" | "senior" | "laugh";
export type CommunityContribution = {
  sources: readonly CommunitySource[];
  interaction?: CommunityInteraction;
};
const suggestion = (comment: number, day: number): CommunitySource => ({ comment, date: `2026.11.${String(day).padStart(2, "0")}`, role: "suggestion" });
const reply = (comment: number, day: number, role: "support" | "reply"): CommunitySource => ({ ...suggestion(comment, day), role });
export const communitySourceHref = (source: CommunitySource) => `/dashboard/community/28#community-comment-${source.comment}`;
export const COMMUNITY_PREFIX = "community:";
export const communityDiscoveryId = (object: RoomObject) => COMMUNITY_PREFIX + object.id;

type Entry = RoomObject & { community: CommunityContribution };
const item = (
  id: string, title: string, description: string, kind: RoomObject["kind"],
  x: number, y: number, width: number, height: number, sources: CommunitySource[],
  interaction?: CommunityInteraction, host?: string, solid = false,
): Entry => ({
  id, title, description, kind, x, y, width, height, solid, host,
  community: { sources, interaction },
});

// Host-attached objects inherit the host's draw depth and reachable front
// edge, without introducing additional floor collision.
export const COMMUNITY_ROOM_OBJECTS: Record<string, Entry[]> = {
  electrical: [
    item("burnt-stm32", "烧掉的 STM32", "蓝色开发板上留下了焦黑的痕迹。一段尚未完成的程序，也是一份像素世界里的调试纪念。", "machine", 2.3, 14.2, 1.65, .55, [suggestion(38, 2), reply(66, 7, "reply"), reply(67, 7, "reply")], "smoke", "solder"),
    item("burst-capacitor", "炸掉的电容", "裂开的外壳和弯曲的引脚，像素特效只是玩笑，不是现实实验。", "machine", 4.85, 14.45, .85, .5, [suggestion(41, 2)], "burst", "solder"),
    item("charge-only-cable", "不能传数据的蓝色数据线", "一根蓝色数据线，连接终端试试看。", "console", 14.05, 15.1, 1.7, .55, [suggestion(43, 2)], "cable", "embedded"),
    item("old-capacitor", "老旧电容", "Old Capacitor · 电压不足 · Voltage starving。根据共建成员的原始像素投稿重新绘制。", "machine", 28.55, 10.65, .85, .5, [suggestion(63, 5)], "old-capacitor", "components"),
    item("lit-capacitor", "点亮的电容", "一枚收藏在像素实验室里的发光电容；这只是虚构的电子元件彩蛋。", "machine", 18.45, 15.1, 1, .55, [suggestion(49, 2)], "glow", "embedded"),
    item("lit-mos", "点亮的 MOS 管", "三根引脚、金属散热片与黑色封装；它在这个像素世界里闪出一点光。", "machine", 21.15, 15.1, .95, .55, [suggestion(62, 4)], "glow", "embedded"),
    item("chip-poster", "奶娃 · 调试海报", "灵感来自共建者提出的嘉立创奶娃海报。这里是原创电子实验室主题海报，并非嘉立创原版海报。", "display", 26.2, 5, 3.5, .5, [suggestion(64, 5)]),
  ],
  mechanical: [
    item("tool-pile", "乱中有序的工具", "机械工作台上的螺丝、轴承、齿轮、扳手和六角工具，各自有用处。", "machine", 26.25, 16.35, 2.2, .6, [suggestion(44, 2)], "tools", "review"),
    item("unfinished-robot", "拆了一半的旧机器人", "这里展示的是一台原创的半拆卸机器人模型：底盘、电机、裸露线束与拆下的装甲。它不对应未经核实的真实赛事经历。", "machine", 6.6, 15.7, 3.8, 2.4, [suggestion(57, 2)], undefined, undefined, true),
    item("assembly-kit", "机器人组装", "把底盘、动力系统、云台和装甲装到正确的位置，再启动机器人。", "workbench", 19.85, 15.9, 2.05, .65, [suggestion(53, 2)], "assembly", "assembly"),
    item("test-robot", "可操控的机器人", "先体验机器人移动与转向，再进入已有的机甲竞技场学习比赛规则。", "machine", 29.65, 7.8, 3.6, 2.1, [suggestion(48, 2), suggestion(71, 8)], "drive", undefined, true),
  ],
  ai: [
    item("hello-terminal", "Hello World", "打开一台最简单的终端，看看第一行程序的输出。", "console", 8.15, 7.9, 3.2, 1.9, [suggestion(50, 2)], "terminal", undefined, true),
    item("silverwolf-terminal", "银狼 LV.999", "致敬《崩坏：星穹铁道》的银狼 LV.999。星际玩家已经解锁满级成就，游戏却尚未结束。", "console", 25, 6.7, 2.25, 1.65, [suggestion(69, 8)], "silverwolf", undefined, true),
  ],
  honors: [
    item("memoir", "吉甲回忆录", "翻开这本回忆录，从战队介绍、历年机器人和赛事档案中认识过去的吉甲。封面插画为原创像素美术。", "display", 24.15, 16.25, 2.45, .6, [suggestion(59, 3)], "memoir", "history"),
    item("memory-archive", "隐藏回忆", "在这个档案角停留片刻，翻阅官网已经公开的赛事与文化记录。插画并非真实历史照片。", "cabinet", 30.1, 14.4, 2.6, 1.6, [suggestion(59, 3)], "memory", undefined, true),
  ],
  guild: [
    item("weekly-meeting", "共创周会", "大家围坐交流研发进度、记录问题和安排接下来的工作。以下对话是通用情景演绎，不代表真实成员的发言。", "workbench", 2, 16.6, 9.5, 4.4, [suggestion(58, 3)], "meeting", undefined, true),
    item("senior", "老学长", "一位原创的吉甲引路人，和他聊聊如何了解战队、寻找学习资源和参与研发。", "reception", 24.5, 13.8, 1.45, .95, [suggestion(70, 8)], "senior", undefined, true),
    item("burger", "汉堡王外卖", "共建者点名的汉堡王外卖。休憩角的原创纸袋与汉堡，留给每一位忙碌的队员。", "display", 28, 17.7, 1.65, .6, [suggestion(42, 2), reply(56, 2, "support"), reply(61, 3, "support")], undefined, "welcome-wall"),
    item("milk-frog", "奶蛙摆件", "共建者留下的「hohoho」笑声，源于奶龙衍生的奶蛙网络梗；这是一只原创捧腹笑摆件。", "display", 32.15, 17.7, 1.1, .5, [suggestion(45, 2)], "laugh", "welcome-wall"),
  ],
  vision: [
    item("block-landscape", "Minecraft 方块小景", "致敬共建者提出的 MC：方块草地、泥土、树木与水流组成的原创微缩景观。", "display", 6.2, 8.2, 2.5, 1.4, [suggestion(51, 2)], undefined, undefined, true),
  ],
};

// #52 intentionally remains unimplemented: the meaning and any personal
// likeness/relationship authorization have not been confirmed.

export const COMMUNITY_POSES: Record<string, readonly string[]> = {
  "test-robot": ["test-robot", "pose-robot-turn", "pose-robot-start"],
  "senior": ["senior", "pose-senior-1", "pose-senior-2"],
  "weekly-meeting": ["weekly-meeting", "pose-meeting-1", "pose-meeting-2"],
};
