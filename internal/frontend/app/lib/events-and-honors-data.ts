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
  kind?: "certificate" | "project-completion";
  awardId?: string;
  relation: "certificate" | "duplicate" | "supporting" | "pending";
  note?: string;
  sources?: HonorSource[];
};

const source = (label: string, href: string): HonorSource => ({ label, href });

export const honorAwards: HonorAward[] = [
  {
    id: "challenge-cup-2026-jijiazhichuang",
    year: 2026,
    event: "2026年“挑战杯”吉林省大学生创业计划竞赛“创业在边疆”东北振兴产业升级专项赛",
    result: "特等奖",
    title: "吉甲智创——中小学轻量化机器人对抗竞技教育项目",
    category: "project",
    certificateIds: ["certificate-44"],
    sources: [
      source("吉林省政府：2026年“挑战杯”吉林省大学生创业计划竞赛", "https://www.jl.gov.cn/yaowen/202605/t20260524_3632734.html"),
      source("吉林大学：“吉甲智创”科创美育研学实践", "https://news.jlu.edu.cn/info/1211/61778.htm"),
    ],
  },
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
    id: "ican-2023-injection-vision-jilin-first",
    year: 2023,
    event: "2023年第17届 iCAN 大学生创新创业大赛吉林赛区选拔赛",
    result: "省级一等奖",
    title: "面向注塑件产业的机器视觉缺陷检测设备",
    category: "project",
    certificateIds: ["certificate-30"],
    sources: [source("吉林大学：2023年第17届 iCAN 吉林赛区选拔赛", "https://ee.jlu.edu.cn/info/1031/8111.htm")],
  },
  {
    id: "ican-2023-outstanding-instructor",
    year: 2023,
    event: "2023年第17届 iCAN 大学生创新创业大赛吉林赛区选拔赛",
    result: "优秀指导教师",
    title: "玄玉波",
    category: "instructor",
    certificateIds: ["certificate-31"],
    sources: [source("吉林大学：2023年第17届 iCAN 吉林赛区选拔赛", "https://ee.jlu.edu.cn/info/1031/8111.htm")],
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

const existingHonorMaterials: HonorMaterial[] = Array.from({ length: 25 }, (_, index) => {
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

const addedHonorMaterials: HonorMaterial[] = [
  {
    id: "certificate-26",
    src: "/assets/images/CertificateOfAchievement/certificate-26.webp",
    title: "ICCV 2019 视频目标分割挑战赛证书（第9名）",
    year: 2019,
    relation: "pending",
    note: "本证书列出第9名；现有 #24 列出同赛事、同赛项第3名，无法确认两份证书对应不同名次类别还是修订材料，均暂不计入已确认成果。",
    sources: [source("YouTube-VOS 官方 VOS 成绩榜", "https://youtube-vos.org/challenge/2019/leaderboard/")],
  },
  {
    id: "certificate-27",
    src: "/assets/images/CertificateOfAchievement/certificate-27.webp",
    title: "大视场相位显微镜——光学元件高精度质检成像领跑者",
    year: 2021,
    awardId: "internet-plus-2021-phase-microscope",
    relation: "duplicate",
    note: "与 #14 是同届赛事、同一作品和同一奖项的另一份扫描，不重复计奖。",
  },
  {
    id: "certificate-28",
    src: "/assets/images/CertificateOfAchievement/certificate-28.webp",
    title: "子母机器人集群空地一体联合消防救援系统",
    year: 2022,
    awardId: "challenge-cup-2022-fire-rescue",
    relation: "duplicate",
    note: "与 #06 内容相同，为同一奖项的另一份扫描，不重复计奖。",
  },
  {
    id: "certificate-29",
    src: "/assets/images/CertificateOfAchievement/certificate-29.webp",
    title: "子母机器人集群空地一体联合消防救援系统 · 证书封套",
    year: 2022,
    awardId: "challenge-cup-2022-fire-rescue",
    relation: "supporting",
    note: "与 #22 属于同一奖项的关联封套材料，不单独计奖。",
  },
  {
    id: "certificate-30",
    src: "/assets/images/CertificateOfAchievement/certificate-30.webp",
    title: "面向注塑件产业的机器视觉缺陷检测设备",
    year: 2023,
    awardId: "ican-2023-injection-vision-jilin-first",
    relation: "certificate",
  },
  {
    id: "certificate-31",
    src: "/assets/images/CertificateOfAchievement/certificate-31.webp",
    title: "玄玉波",
    year: 2023,
    awardId: "ican-2023-outstanding-instructor",
    relation: "certificate",
  },
  {
    id: "certificate-32",
    src: "/assets/images/CertificateOfAchievement/certificate-32.webp",
    title: "面向注塑件产业的机器视觉缺陷检测设备",
    year: 2023,
    awardId: "ican-2023-injection-vision",
    relation: "duplicate",
    note: "与 #21 内容相同，为同一全国总决赛奖项的另一份扫描，不重复计奖。",
  },
  {
    id: "certificate-33",
    src: "/assets/images/CertificateOfAchievement/certificate-33.webp",
    title: "智能活细胞检测与分析系统",
    year: 2024,
    relation: "pending",
    note: "证书显示该项目获第18届 iCAN 全国总决赛三等奖；目前没有材料确认其与 TARSGO 的项目归属，暂不计入正式荣誉。",
  },
  {
    id: "certificate-34",
    src: "/assets/images/CertificateOfAchievement/certificate-34.webp",
    title: "吉林大学 TARS_Go 战队",
    year: 2024,
    awardId: "rm-2024-east-team",
    relation: "duplicate",
    note: "与 #04 是同一届 RoboMaster 东部赛区一等奖的另一份扫描，不重复计奖。",
  },
  {
    id: "certificate-35",
    src: "/assets/images/CertificateOfAchievement/certificate-35.webp",
    title: "高通量在线式干细胞培养测控系统 · 结题证明",
    year: 2024,
    kind: "project-completion",
    relation: "supporting",
    note: "证书明确列出吉甲大师创新创业实践示范基地为承担基地。这是双创实践重点项目结题材料，不属于竞赛获奖。",
  },
  {
    id: "certificate-36",
    src: "/assets/images/CertificateOfAchievement/certificate-36.webp",
    title: "面向 PCB 产业的 AOI 缺陷检测设备 · 结题证明",
    year: 2024,
    kind: "project-completion",
    relation: "pending",
    note: "这是国家级大学生创新创业训练计划项目结题材料，不属于竞赛获奖；与 TARSGO 的归属尚未确认。",
  },
  {
    id: "certificate-37",
    src: "/assets/images/CertificateOfAchievement/certificate-37.webp",
    title: "数字病理显微成像系统 · 结题证明",
    year: 2024,
    kind: "project-completion",
    relation: "pending",
    note: "这是国家级大学生创新训练项目结题材料，不属于竞赛获奖；与 TARSGO 的归属尚未确认。",
  },
  {
    id: "certificate-38",
    src: "/assets/images/CertificateOfAchievement/certificate-38.webp",
    title: "精准智检：华为云 AI 驱动的工业残次识别专家",
    year: 2024,
    relation: "pending",
    note: "证书显示该作品获第19届“挑战杯”全国大学生课外学术科技作品竞赛“揭榜挂帅”专项赛三等奖；与 TARSGO 的项目归属尚未确认。",
  },
  {
    id: "certificate-39",
    src: "/assets/images/CertificateOfAchievement/certificate-39.webp",
    title: "英雄机器人组",
    year: 2024,
    awardId: "rm-2024-hero",
    relation: "duplicate",
    note: "与 #12 是同一届 RoboMaster 英雄机器人竞技奖一等奖的另一份扫描，不重复计奖。",
  },
  {
    id: "certificate-40",
    src: "/assets/images/CertificateOfAchievement/certificate-40.webp",
    title: "面向活细胞的自适应监测装置 · 结题证明",
    year: 2025,
    kind: "project-completion",
    relation: "pending",
    note: "这是省级大学生创新创业训练计划项目结题材料，不属于竞赛获奖；与 TARSGO 的归属尚未确认。",
  },
  {
    id: "certificate-41",
    src: "/assets/images/CertificateOfAchievement/certificate-41.webp",
    title: "工程机器人组",
    year: 2025,
    awardId: "rm-2025-engineer",
    relation: "duplicate",
    note: "与 #23 内容相同，为同一届 RoboMaster 工程机器人竞技奖一等奖的另一份扫描，不重复计奖。",
  },
  {
    id: "certificate-42",
    src: "/assets/images/CertificateOfAchievement/certificate-42.webp",
    title: "微斑慧眼——基于无人机的玉米病害智能预警领航者",
    year: 2026,
    relation: "pending",
    note: "证书显示该项目获 2026 年“挑战杯”吉林省大学生创业计划竞赛东北振兴产业升级专项赛三等奖；项目与 TARSGO 的归属尚未确认。",
  },
  {
    id: "certificate-43",
    src: "/assets/images/CertificateOfAchievement/certificate-43.webp",
    title: "智海算法调优赛项 · 全国总决赛二等奖",
    year: 2026,
    relation: "pending",
    note: "证书显示该项目获 2026 睿抗机器人开发者大赛全国总决赛二等奖；与 TARSGO 的归属尚未确认。",
  },
  {
    id: "certificate-44",
    src: "/assets/images/CertificateOfAchievement/certificate-44.webp",
    title: "吉甲智创——中小学轻量化机器人对抗竞技教育项目",
    year: 2026,
    awardId: "challenge-cup-2026-jijiazhichuang",
    relation: "certificate",
  },
];

export const honorMaterials: HonorMaterial[] = [...existingHonorMaterials, ...addedHonorMaterials];

export const honorCategoryLabels: Record<HonorCategory, string> = {
  team: "战队团体奖",
  robot: "机器人专项奖",
  project: "项目作品奖",
  instructor: "指导教师奖",
};
