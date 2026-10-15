export type TeamHistorySource = {
  label: string;
  kind: "校方报道" | "RoboMaster 赛事档案" | "战队公开记录" | "公开视频" | "创队者口述" | "赛季规划" | "官网档案";
  href?: string;
};

export const teamHistorySources = {
  jlu2019Icra: {
    label: "吉林大学：ICRA 2019 赛事报道",
    kind: "校方报道",
    href: "https://news.jlu.edu.cn/info/1021/48397.htm",
  },
  jlu2020Origin: {
    label: "吉林大学：吉甲大师与 TARS-Go 起源报道",
    kind: "校方报道",
    href: "https://news.jlu.edu.cn/info/1306/52000.htm",
  },
  jlu2021Platform: {
    label: "吉林大学创新创业教育学院：梦工场平台报道",
    kind: "校方报道",
    href: "https://cxcyjyxy.jlu.edu.cn/info/1099/1228.htm",
  },
  jlu2022S1: {
    label: "吉林大学创新创业教育学院：S1 模拟对抗实践",
    kind: "校方报道",
    href: "https://cxcyjyxy.jlu.edu.cn/info/1099/1614.htm",
  },
  rm2019Retrospective: {
    label: "RoboMaster 社区：2019 战队回顾",
    kind: "战队公开记录",
    href: "https://bbs.robomaster.com/article/6827",
  },
  oralOrigin: {
    label: "创队者口述（2026.09）",
    kind: "创队者口述",
  },
  culture2024: {
    label: "TARS-Go 2024 文化建设资料",
    kind: "战队公开记录",
    href: "https://hz-rm-bbs-web-prod.oss-cn-hangzhou.aliyuncs.com/attachment/pre/v1/202312/14/130746pb0nsenne0500iv5.attach/%E5%90%89%E6%9E%97%E5%A4%A7%E5%AD%A6%20TARS_Go%E6%88%98%E9%98%9F%20%E6%96%87%E5%8C%96%E5%BB%BA%E8%AE%BE.pdf",
  },
  bilibili2021Camp: {
    label: "吉甲大师 2021 电控夏令营",
    kind: "公开视频",
    href: "https://www.bilibili.com/video/BV1nU4y1n7Xu/",
  },
  jlu2026Outreach: {
    label: "吉林大学：吉甲智创研学实践报道",
    kind: "校方报道",
    href: "https://news.jlu.edu.cn/info/1211/61778.htm",
  },
  rm2022Algorithm: {
    label: "RoboMaster 社区：TARS-Go 2022 算法开源",
    kind: "战队公开记录",
    href: "https://bbs.robomaster.com/article/9138",
  },
  rm2023Hero: {
    label: "RoboMaster 社区：2023 英雄机器人机械设计开源",
    kind: "战队公开记录",
    href: "https://bbs.robomaster.com/article/9447",
  },
  rm2025OpenSource: {
    label: "RoboMaster 社区：2025 步兵机器人开源",
    kind: "战队公开记录",
    href: "https://bbs.robomaster.com/article/716393",
  },
  teamCulture2025: {
    label: "2025 赛季文化建设规划",
    kind: "赛季规划",
  },
  siteRobotArchive: {
    label: "官网机器人赛季档案",
    kind: "官网档案",
    href: "/robots",
  },
  siteHistoryPhoto: {
    label: "官网现存历史照片原图",
    kind: "官网档案",
  },
  rm2026AutoAim: {
    label: "RoboMaster 社区：2026 步兵自瞄与能量机关算法开源",
    kind: "战队公开记录",
    href: "https://bbs.robomaster.com/article/1883887",
  },
  rm2026Engineering: {
    label: "RoboMaster 社区：2026 工程机器人机械结构开源",
    kind: "战队公开记录",
    href: "https://bbs.robomaster.com/article/1885239",
  },
} satisfies Record<string, TeamHistorySource>;

export type TeamHistoryLane = "TARS-Go 战队" | "吉甲大师平台" | "共同发展";

export type TeamHistoryStory = {
  id: string;
  date: string;
  lane: TeamHistoryLane;
  title: string;
  summary: string;
  sourceIds: Array<keyof typeof teamHistorySources>;
  honorIds?: string[];
};

export type TeamHistoryYear = {
  year: number;
  stories: TeamHistoryStory[];
  image?: {
    src: string;
    alt: string;
    caption: string;
    sourceIds: Array<keyof typeof teamHistorySources>;
  };
};

export const teamHistoryYears: TeamHistoryYear[] = [
  {
    year: 2018,
    stories: [
      {
        id: "team-origin",
        date: "年末",
        lane: "TARS-Go 战队",
        title: "TARS-Go 名称来自《星际穿越》",
        summary: "吉林大学官方报道确认战队成立于 2018 年底，并记载名称来自电影《星际穿越》中的机器人 TARS。创队者口述将组队和首次 AI Challenge 报名回忆在当年 12 月，并称报名时已使用 TARS-Go 这一名称。官方报道记录其寓意为“外在做事沉稳有条，内在思维活跃创新”；具体成立日仍未确认。",
        sourceIds: ["jlu2020Origin", "oralOrigin", "culture2024"],
      },
    ],
  },
  {
    year: 2019,
    image: {
      src: "/assets/images/Milestone/2019-breakthrough.webp",
      alt: "2019 年 ICRA RoboMaster 人工智能挑战赛现场，队员举着 TARS-Go 队旗，机器人在画面前方。",
      caption: "2019 年 5 月 · 加拿大蒙特利尔 ICRA RoboMaster AI Challenge",
      sourceIds: ["jlu2019Icra"],
    },
    stories: [
      {
        id: "first-international-event",
        date: "5 月",
        lane: "TARS-Go 战队",
        title: "第一次走上国际赛场",
        summary: "5 月 20 日至 24 日，吉林大学代表队赴加拿大蒙特利尔参加 ICRA RoboMaster 人工智能挑战赛。现场照片留下早期队旗、队服和机器人；赛事名次见赛事与荣誉档案。",
        sourceIds: ["jlu2019Icra"],
        honorIds: ["icra-2019-ai-challenge"],
      },
      {
        id: "full-robot-season",
        date: "下半年",
        lane: "TARS-Go 战队",
        title: "从 AI 挑战赛走向整机协作",
        summary: "队伍随后决定参加 RoboMaster 对抗赛，机械、电控、视觉与不同兵种开始协同推进。创队者回忆，首届夏令营也在这一年暑期开展；当时没有固定场地，成员借用不同校区的教室训练。",
        sourceIds: ["rm2019Retrospective", "oralOrigin"],
      },
    ],
  },
  {
    year: 2020,
    image: {
      src: "/assets/images/Milestone/2020-first-achievement-01.webp",
      alt: "吉甲大师梦工场与 TARS-Go 战队成员的 2020 年合影。",
      caption: "2020 年 · 吉甲大师梦工场与 TARS-Go 战队",
      sourceIds: ["jlu2020Origin"],
    },
    stories: [
      {
        id: "online-season",
        date: "赛季",
        lane: "共同发展",
        title: "在远程协作中完成全国赛道首秀",
        summary: "疫情期间，队伍用线上日报、每周例会和远程调试推进研发，并首次参加 RoboMaster 全国线上评审赛。官方报道也记录，当时机械、电控、视觉、决策等方向已经协同完成多类整机；赛事结果见赛事与荣誉档案。",
        sourceIds: ["jlu2020Origin"],
        honorIds: ["rm-2020-online-team"],
      },
    ],
  },
  {
    year: 2021,
    stories: [
      {
        id: "platform-definition",
        date: "校方报道",
        lane: "吉甲大师平台",
        title: "梦工场呈现出更宽的实践平台形态",
        summary: "吉林大学创新创业教育学院将吉甲大师梦工场描述为跨学科、以学生为主体的创新创业实践平台，并记录了工业视觉检测等校企项目。TARS-Go 是平台中的 RoboMaster 战队；两者承担的组织角色并不相同。",
        sourceIds: ["jlu2021Platform", "jlu2020Origin"],
      },
      {
        id: "electrical-summer-camp",
        date: "夏令营",
        lane: "共同发展",
        title: "训练内容开始留下可复习的公开课",
        summary: "吉甲大师公开发布 2021 电控夏令营课程，共九节，从 PCB 和 PWM 到 PID、器件与姿态解算。它把一届成员的训练内容变成后来者可以重复学习的材料。",
        sourceIds: ["bilibili2021Camp"],
      },
    ],
  },
  {
    year: 2022,
    image: {
      src: "/assets/images/Milestone/2022-inheritance-system-02.webp",
      alt: "TARS-Go 队员与 2022 赛季机器人合影，背景为 RoboMaster 2022 高校系列赛标识。",
      caption: "RoboMaster 2022 赛季团队与机器人",
      sourceIds: ["siteHistoryPhoto"],
    },
    stories: [
      {
        id: "s1-campus-practice",
        date: "10 月",
        lane: "吉甲大师平台",
        title: "机器人实践走进更多校区",
        summary: "吉甲大师创新创业实践示范基地举办 S1 机器人模拟对抗活动，面向南湖、前卫南区和南岭三个校区近百名学生。平台通过真实操控和对抗，让比赛经验转化为开放的工程实践。",
        sourceIds: ["jlu2022S1"],
      },
      {
        id: "algorithm-open-source",
        date: "赛季",
        lane: "TARS-Go 战队",
        title: "把算法方案公开，供同行继续交流",
        summary: "TARS-Go 发布 2022 赛季人工智能挑战赛算法开源资料，并说明开源是为了技术交流、共同进步。代码和说明文档成为赛季经验之外可继续使用的工程记录。",
        sourceIds: ["rm2022Algorithm"],
      },
    ],
  },
  {
    year: 2023,
    stories: [
      {
        id: "hero-mechanical-open-source",
        date: "9 月",
        lane: "TARS-Go 战队",
        title: "机器人设计过程进入公开档案",
        summary: "战队公开 2023 英雄机器人的二维图纸、三维模型、说明文档和测试视频，并沿用机械组零件与装配体命名规范。留下完整设计过程，让后来成员能从真实方案和迭代记录继续学习。",
        sourceIds: ["rm2023Hero"],
      },
    ],
  },
  {
    year: 2024,
    image: {
      src: "/assets/images/Milestone/2024-national-competition.webp",
      alt: "TARS-Go 队员与机器人在 RoboMaster 2024 赛场合影。",
      caption: "RoboMaster 2024 赛季赛场合影",
      sourceIds: ["siteHistoryPhoto"],
    },
    stories: [
      {
        id: "first-national-finals",
        date: "赛季",
        lane: "TARS-Go 战队",
        title: "第一次进入 RoboMaster 全国总决赛",
        summary: "TARS-Go 通过东部赛区晋级全国赛，首次进入全国总决赛。区域赛和全国赛的具体成绩见赛事与荣誉档案。",
        sourceIds: [],
        honorIds: ["rm-2024-east-team", "rm-2024-national-team"],
      },
    ],
  },
  {
    year: 2025,
    image: {
      src: "/assets/images/Milestone/2025-legacy.webp",
      alt: "TARS-Go 队员在 RoboMaster 2025 高校联盟赛辽宁站 3V3 对抗赛后合影。",
      caption: "RoboMaster 2025 高校联盟赛辽宁站",
      sourceIds: ["siteHistoryPhoto"],
    },
    stories: [
      {
        id: "robot-open-source",
        date: "6 月",
        lane: "TARS-Go 战队",
        title: "赛季机器人方案继续公开",
        summary: "TARS-Go 发布 2025 步兵机器人开源资料。区域赛、全国赛和机器人竞技奖的具体结果见赛事与荣誉档案。",
        sourceIds: ["rm2025OpenSource"],
        honorIds: ["rm-2025-east-team", "rm-2025-national-team", "rm-2025-infantry"],
      },
      {
        id: "history-in-newcomer-training",
        date: "培养规划",
        lane: "共同发展",
        title: "队史学习被写进新人培养设计",
        summary: "2025 赛季文化建设规划提出将队史学习和老队员分享纳入新人培养。此处记录的是规划文本，不据此推断所有活动均已执行。",
        sourceIds: ["teamCulture2025"],
      },
    ],
  },
  {
    year: 2026,
    image: {
      src: "/assets/images/Robot/2026/hero-01-1440.webp",
      alt: "TARS-Go 2026 赛季 1 号英雄机器人。",
      caption: "TARS-Go 2026 赛季 · 1 号英雄机器人",
      sourceIds: ["siteRobotArchive"],
    },
    stories: [
      {
        id: "2026-engineering-archive",
        date: "赛季",
        lane: "TARS-Go 战队",
        title: "新一代机器人与开源资料持续更新",
        summary: "官网机器人展厅已归档 2026 赛季机器人，战队公开了步兵自瞄与能量机关算法、工程机器人机械结构；赛季名次见赛事与荣誉档案。",
        sourceIds: ["siteRobotArchive", "rm2026AutoAim", "rm2026Engineering"],
        honorIds: ["rm-2026-national-team"],
      },
      {
        id: "2026-outreach",
        date: "8 月",
        lane: "吉甲大师平台",
        title: "工程实践也走进青少年科创活动",
        summary: "吉林大学报道记录了依托吉甲大师双创实践基地开展的“吉甲智创”研学活动，大学生为青少年讲解机器人并指导实际操作。平台实践延伸到校园之外。",
        sourceIds: ["jlu2026Outreach"],
      },
    ],
  },
];
