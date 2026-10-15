export type HonorCategory = "team" | "robot" | "project" | "instructor";

export type HonorSource = {
  label: string;
  href: string;
};

export type HonorAward = {
  id: string;
  year: number;
  event: string;
  result: string;
  title: string;
  category: HonorCategory;
  certificateIds: string[];
  sources: HonorSource[];
  featured?: boolean;
};

export type HonorMaterial = {
  id: string;
  src: string;
  title: string;
  year: number;
  awardId?: string;
  relation: "certificate" | "duplicate" | "supporting" | "pending";
  note?: string;
  sources?: HonorSource[];
};

const source = (label: string, href: string): HonorSource => ({ label, href });

export const honorAwards: HonorAward[] = [
  {
    id: "rm-2026-national-team",
    year: 2026,
    event: "RoboMaster 2026 机甲大师超级对抗赛全国赛",
    result: "全国三等奖",
    title: "吉林大学 TARS Go 战队",
    category: "team",
    certificateIds: [],
    sources: [source("RoboMaster 2026 全国赛获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1925")],
    featured: true,
  },
  {
    id: "rm-2025-national-team",
    year: 2025,
    event: "RoboMaster 2025 全国赛",
    result: "全国二等奖",
    title: "吉林大学 TARS_Go 战队",
    category: "team",
    certificateIds: [],
    sources: [source("RoboMaster 2025 全国赛获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1856")],
    featured: true,
  },
  {
    id: "rm-2025-east-team",
    year: 2025,
    event: "RoboMaster 2025 区域赛（东部赛区）",
    result: "一等奖",
    title: "吉林大学 TARS_Go 战队",
    category: "team",
    certificateIds: ["certificate-16"],
    sources: [source("RoboMaster 2025 区域赛获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1847")],
  },
  {
    id: "rm-2025-aerial",
    year: 2025,
    event: "RoboMaster 2025 机甲大师超级对抗赛",
    result: "机器人竞技奖 · 二等奖",
    title: "空中机器人组",
    category: "robot",
    certificateIds: ["certificate-02", "certificate-10"],
    sources: [source("RoboMaster 2025 机器人竞技奖获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1853")],
  },
  {
    id: "rm-2025-hero",
    year: 2025,
    event: "RoboMaster 2025 机甲大师超级对抗赛",
    result: "机器人竞技奖 · 一等奖",
    title: "英雄机器人组",
    category: "robot",
    certificateIds: ["certificate-17"],
    sources: [source("RoboMaster 2025 机器人竞技奖获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1853")],
  },
  {
    id: "rm-2025-infantry",
    year: 2025,
    event: "RoboMaster 2025 机甲大师超级对抗赛",
    result: "机器人竞技奖 · 二等奖",
    title: "步兵机器人组",
    category: "robot",
    certificateIds: [],
    sources: [source("RoboMaster 2025 机器人竞技奖获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1853")],
  },
  {
    id: "rm-2025-engineer",
    year: 2025,
    event: "RoboMaster 2025 机甲大师超级对抗赛",
    result: "机器人竞技奖 · 一等奖",
    title: "工程机器人组",
    category: "robot",
    certificateIds: ["certificate-23"],
    sources: [source("RoboMaster 2025 机器人竞技奖获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1853")],
  },
  {
    id: "rm-2024-national-team",
    year: 2024,
    event: "RoboMaster 2024 全国赛",
    result: "全国二等奖",
    title: "吉林大学 TARS_Go 战队",
    category: "team",
    certificateIds: ["certificate-18"],
    sources: [source("RoboMaster 2024 全国赛获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1759")],
    featured: true,
  },
  {
    id: "rm-2024-east-team",
    year: 2024,
    event: "RoboMaster 2024 区域赛（东部赛区）",
    result: "一等奖",
    title: "吉林大学 TARS_Go 战队",
    category: "team",
    certificateIds: ["certificate-04"],
    sources: [source("RoboMaster 2024 区域赛获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1736")],
  },
  {
    id: "rm-2024-hero",
    year: 2024,
    event: "RoboMaster 2024 机甲大师超级对抗赛",
    result: "机器人竞技奖 · 一等奖",
    title: "英雄机器人组",
    category: "robot",
    certificateIds: ["certificate-12"],
    sources: [],
  },
  {
    id: "rm-2024-aerial",
    year: 2024,
    event: "RoboMaster 2024 机甲大师超级对抗赛",
    result: "机器人竞技奖 · 三等奖",
    title: "空中机器人组",
    category: "robot",
    certificateIds: ["certificate-08"],
    sources: [],
  },
  {
    id: "rm-2024-instructor",
    year: 2024,
    event: "RoboMaster 2024 高校系列赛综合类奖项",
    result: "优秀指导老师",
    title: "玄玉波",
    category: "instructor",
    certificateIds: [],
    sources: [source("RoboMaster 2024 高校系列赛综合类奖项名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1766")],
  },
  {
    id: "computer-design-2024-yukari",
    year: 2024,
    event: "第17届中国大学生计算机设计大赛",
    result: "一等奖",
    title: "Yukari：驭光智检缺陷检测框架",
    category: "project",
    certificateIds: ["certificate-13"],
    sources: [],
  },
  {
    id: "innovation-2023-surface",
    year: 2023,
    event: "中国国际大学生创新大赛（2023）",
    result: "铜奖",
    title: "基于视觉感知的复杂高光亮曲面的高精度瑕疵检测技术与方法",
    category: "project",
    certificateIds: ["certificate-05"],
    sources: [],
    featured: true,
  },
  {
    id: "ican-2023-injection-vision",
    year: 2023,
    event: "第17届 iCAN 大学生创新创业大赛全国总决赛",
    result: "三等奖",
    title: "面向注塑件产业的机器视觉缺陷检测设备",
    category: "project",
    certificateIds: ["certificate-21"],
    sources: [],
  },
  {
    id: "computer-design-2023-smartql",
    year: 2023,
    event: "第16届中国大学生计算机设计大赛",
    result: "二等奖",
    title: "SmartQL：智云双创基地管理系统",
    category: "project",
    certificateIds: ["certificate-01"],
    sources: [source("大赛组委会发布的2023年获奖名单", "https://jsjds.blcu.edu.cn/2023congratulations.pdf")],
  },
  {
    id: "challenge-cup-2022-fire-rescue",
    year: 2022,
    event: "第17届“挑战杯”全国大学生课外学术科技作品竞赛",
    result: "二等奖",
    title: "子母机器人集群空地一体联合消防救援系统",
    category: "project",
    certificateIds: ["certificate-06", "certificate-22"],
    sources: [source("第17届“挑战杯”授奖名单（高校存档）", "https://www.ahjzu.edu.cn/_upload/article/files/19/df/9dce0c9749f6bf6096849457ac43/60ffe8f8-d25d-46a5-993f-1a30d3a8e941.pdf")],
  },
  {
    id: "rm-2022-national-team",
    year: 2022,
    event: "RoboMaster 2022 全国赛",
    result: "三等奖",
    title: "吉林大学 TARS_Go 战队",
    category: "team",
    certificateIds: ["certificate-07"],
    sources: [],
  },
  {
    id: "rm-2022-central-team",
    year: 2022,
    event: "RoboMaster 2022 区域赛（中部赛区）",
    result: "二等奖",
    title: "吉林大学 TARS_Go 战队",
    category: "team",
    certificateIds: ["certificate-25"],
    sources: [],
  },
  {
    id: "internet-plus-2022-vision",
    year: 2022,
    event: "第8届中国国际“互联网+”大学生创新创业大赛",
    result: "铜奖",
    title: "基于视觉感知的复杂高光亮曲面的高精度瑕疵检测技术与方法",
    category: "project",
    certificateIds: ["certificate-03", "certificate-20"],
    sources: [],
  },
  {
    id: "internet-plus-2021-phase-microscope",
    year: 2021,
    event: "第7届中国国际“互联网+”大学生创新创业大赛",
    result: "银奖",
    title: "大视场相位显微镜——光学元件高精度质检成像领跑者",
    category: "project",
    certificateIds: ["certificate-14"],
    sources: [],
  },
  {
    id: "rm-2020-online-team",
    year: 2020,
    event: "RoboMaster 2020 机甲大师对抗赛（线上）",
    result: "一等奖",
    title: "吉林大学 TARS_Go 战队",
    category: "team",
    certificateIds: ["certificate-15"],
    sources: [source("吉林大学：吉甲大师与 TARS-Go 起源报道", "https://news.jlu.edu.cn/info/1306/52000.htm")],
  },
  {
    id: "challenge-cup-2020-bottle-vision",
    year: 2020,
    event: "第12届“挑战杯”中国大学生创业计划竞赛",
    result: "金奖",
    title: "360°“瓶中瑕影”视觉检测系统",
    category: "project",
    certificateIds: ["certificate-09", "certificate-11"],
    sources: [source("吉林大学：第十二届“挑战杯”获奖情况", "https://www.jlu.edu.cn/info/1339/48781.htm")],
  },
  {
    id: "icra-2019-ai-challenge",
    year: 2019,
    event: "ICRA 2019 RoboMaster AI Challenge",
    result: "三等奖",
    title: "TARS_Go · 吉林大学",
    category: "team",
    certificateIds: ["certificate-19"],
    sources: [source("RoboMaster 组委会：ICRA 2019 获奖名单", "https://www.robomaster.com/zh-CN/resource/pages/announcement/1026")],
    featured: true,
  },
];

export const honorMaterials: HonorMaterial[] = Array.from({ length: 25 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  const id = "certificate-" + number;
  const award = honorAwards.find((item) => item.certificateIds.includes(id));
  return {
    id,
    src: "/assets/images/CertificateOfAchievement/" + id + ".webp",
    title: award?.title ?? "ICCV 2019 视频目标分割挑战赛证书",
    year: award?.year ?? 2019,
    awardId: award?.id,
    relation: id === "certificate-10" || id === "certificate-20"
      ? "duplicate"
      : id === "certificate-11" || id === "certificate-22"
        ? "supporting"
        : id === "certificate-24"
          ? "pending"
          : "certificate",
    note: id === "certificate-10"
      ? "与 #02 内容相同，为同一份证书的重复扫描，不重复计奖。"
      : id === "certificate-20"
        ? "与 #03 对应同届赛事、同一作品和同一奖项的另一份扫描，不重复计奖。"
        : id === "certificate-11"
          ? "第12届“挑战杯”金奖对应的奖杯影像。"
          : id === "certificate-22"
            ? "第17届“挑战杯”二等奖对应的证书封套。"
            : id === "certificate-24"
              ? "证书显示 VOS 挑战赛第三名，但收件人与 TARSGO 的关联尚未核实；暂不计入团队成果。"
              : undefined,
    sources: id === "certificate-24"
      ? [source("YouTube-VOS 官方 VOS 成绩榜", "https://youtube-vos.org/challenge/2019/leaderboard/")]
      : undefined,
  };
});

export const honorCategoryLabels: Record<HonorCategory, string> = {
  team: "战队团体奖",
  robot: "机器人专项奖",
  project: "项目作品奖",
  instructor: "指导教师奖",
};
