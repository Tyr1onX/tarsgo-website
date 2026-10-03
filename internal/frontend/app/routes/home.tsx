import type { Route } from "./+types/home";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Navbar } from "../components/navbar";
import { Link } from "react-router";
import {
  getOptionalCurrentUser,
  subscribeAuthStateChange,
  type AuthUser,
} from "~/lib/auth-client";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TARS-Go | 吉林大学吉甲大师战队" },
    {
      name: "description",
      content:
        "吉林大学TARS-Go战队官网 - RoboMaster机甲大师赛参赛战队，外在做事沉稳有序，内在思维活跃创新",
    },
  ];
}

const stats = [
  {
    icon: "calendar",
    value: "2018",
    label: "成立年份",
    tint: "#0062FF",
    tintSoft: "#3B82F6",
  },
  {
    icon: "users",
    value: "35+",
    label: "团队成员",
    tint: "#4F46E5",
    tintSoft: "#7C3AED",
  },
  {
    icon: "layers",
    value: "6",
    label: "技术组别",
    tint: "#10B981",
    tintSoft: "#14B8A6",
  },
  {
    icon: "award",
    value: "Top 16",
    label: "全国最佳成绩",
    tint: "#F59E0B",
    tintSoft: "#FBBF24",
  },
];

const timelineMilestones = [
  {
    year: "2018",
    title: "启航",
    intro: "吉林大学吉甲大师双创基地正式组建，团队开始以机器人竞赛与人工智能挑战为核心方向持续推进。",
    highlights: [
      "正式组建吉林大学吉甲大师双创基地。",
      "搭建机械、电控、视觉核心团队。",
      "开启 ICRA 人工智能挑战赛征程。",
    ],
    images: ["/assets/images/Milestone/2018-set-sail.webp"],
  },
  {
    year: "2019",
    title: "突破",
    intro: "团队在国际挑战赛和 RoboMaster 赛场同步迈出关键一步，招新与培养体系也开始快速铺开。",
    highlights: [
      "首次出征 ICRA 人工智能挑战赛（蒙特利尔），获得三等奖。",
      "参加 ICCV 计算机视觉挑战赛（首尔）。",
      "开启全国大学生 RoboMaster 对抗赛征程。",
      "开展暑期夏令营和冬令营，跨南岭、南湖、南区，参与学院多达 12 个。",
    ],
    images: ["/assets/images/Milestone/2019-breakthrough.webp"],
  },
  {
    year: "2020",
    title: "全国佳绩",
    intro: "创业实践与竞赛成绩同步拉升，团队在全国与国际赛场都拿到了阶段性成果。",
    highlights: [
      "开展创业实践项目，获得挑战杯中国大学生创业计划竞赛全国金奖。",
      "首次参赛全国大学生 RoboMaster 对抗赛，获 2020 线上赛全国一等奖。",
      "ICRA 人工智能挑战赛获二等奖。",
    ],
    images: [
      "/assets/images/Milestone/2020-first-achievement-01.webp",
      "/assets/images/Milestone/2020-first-achievement-02.webp",
    ],
  },
  {
    year: "2021",
    title: "技术迭代",
    intro: "这一年完成了从竞赛经验积累到组织体系升级的关键过渡，六大组别逐步成型。",
    highlights: [
      "创业实践获得互联网+国际大学生创新创业大赛国家级银奖。",
      "建立机械、视觉、电控、AI、软件、运营 6 个组别。",
      "ICRA 人工智能挑战赛获二等奖。",
      "全国大学生 RoboMaster 对抗赛三等奖。",
      "高校联盟赛·黑龙江站八强。",
    ],
    images: ["/assets/images/Milestone/2021-technological-iteration.webp"],
  },
  {
    year: "2022",
    title: "传承体系",
    intro: "团队继续把人才培养和项目训练机制制度化，逐步形成更稳定的传帮带节奏。",
    highlights: [
      "创业实践获得互联网+国际大学生创新创业大赛国家级铜奖。",
      "完善培育体系，继续开展冬夏令营。",
      "全国大学生 RoboMaster 对抗赛三等奖。",
    ],
    images: [
      "/assets/images/Milestone/2022-inheritance-system-01.webp",
      "/assets/images/Milestone/2022-inheritance-system-02.webp",
    ],
  },
  {
    year: "2023",
    title: "文化建设",
    intro: "在竞赛之外，团队的品牌、文化和学术成果也进一步沉淀，开始形成更完整的外部影响力。",
    highlights: [
      "创业实践获得国际大学生创新大赛国家级铜奖。",
      "中国大学生计算机大赛国家级二等奖。",
      "全国大学生 RoboMaster 对抗赛三等奖。",
    ],
    images: [
      "/assets/images/Milestone/2023-cultural-development-01.webp",
      "/assets/images/Milestone/2023-cultural-development-02.webp",
    ],
  },
  {
    year: "2024",
    title: "首进国赛",
    intro: "团队在 RoboMaster 主赛道实现关键突破，首次挺进全国总决赛，完成阶段性里程碑。",
    highlights: [
      "全国大学生 RoboMaster 对抗赛东部赛区八强。",
      "晋级全国总决赛。",
      "获国家级二等奖、英雄一等奖。",
    ],
    images: ["/assets/images/Milestone/2024-national-competition.webp"],
  },
  {
    year: "2025",
    title: "薪火相传",
    intro: "在新老交替中继续完成机器人体系升级，团队在联盟赛和全国赛中稳定输出成绩。",
    highlights: [
      "新老传承持续推进，机器人全面升级。",
      "RM 高校联盟赛·辽宁站季军。",
      "全国大学生 RoboMaster 对抗赛国家级二等奖。",
      "工程一等奖、英雄一等奖等。",
    ],
    images: ["/assets/images/Milestone/2025-legacy.webp"],
  },
];

const robots = [
  {
    name: "英雄机器人",
    description: "火力担当，42mm 弹丸发射，打击效率最高",
  },
  {
    name: "步兵机器人",
    description: "灵活机动，17mm 弹丸射击，场上主力输出",
  },
  {
    name: "工程机器人",
    description: "资源采集与弹药补给，战场后勤保障",
  },
  {
    name: "哨兵机器人",
    description: "自主决策与自动瞄准，AI 驱动防御",
  },
  {
    name: "空中机器人",
    description: "空中侦察与空地协同，空中打击威胁",
  },
];

const robotImages = [
  "/assets/images/Robot/hero-robot.webp",
  "/assets/images/Robot/infantry-robot.webp",
  "/assets/images/Robot/engineering-robot.webp",
  "/assets/images/Robot/sentinel-robot.webp",
  "/assets/images/Robot/aerial-robots.webp",
];

const achievementCertificates = [
  "/assets/images/CertificateOfAchievement/certificate-01.webp",
  "/assets/images/CertificateOfAchievement/certificate-02.webp",
  "/assets/images/CertificateOfAchievement/certificate-03.webp",
  "/assets/images/CertificateOfAchievement/certificate-04.webp",
  "/assets/images/CertificateOfAchievement/certificate-05.webp",
  "/assets/images/CertificateOfAchievement/certificate-06.webp",
  "/assets/images/CertificateOfAchievement/certificate-07.webp",
  "/assets/images/CertificateOfAchievement/certificate-08.webp",
  "/assets/images/CertificateOfAchievement/certificate-09.webp",
  "/assets/images/CertificateOfAchievement/certificate-10.webp",
  "/assets/images/CertificateOfAchievement/certificate-11.webp",
  "/assets/images/CertificateOfAchievement/certificate-12.webp",
  "/assets/images/CertificateOfAchievement/certificate-13.webp",
  "/assets/images/CertificateOfAchievement/certificate-14.webp",
  "/assets/images/CertificateOfAchievement/certificate-15.webp",
  "/assets/images/CertificateOfAchievement/certificate-16.webp",
  "/assets/images/CertificateOfAchievement/certificate-17.webp",
  "/assets/images/CertificateOfAchievement/certificate-18.webp",
  "/assets/images/CertificateOfAchievement/certificate-19.webp",
  "/assets/images/CertificateOfAchievement/certificate-20.webp",
  "/assets/images/CertificateOfAchievement/certificate-21.webp",
  "/assets/images/CertificateOfAchievement/certificate-22.webp",
  "/assets/images/CertificateOfAchievement/certificate-23.webp",
  "/assets/images/CertificateOfAchievement/certificate-24.webp",
  "/assets/images/CertificateOfAchievement/certificate-25.webp",
];

const sponsorLogos = [
  { name: "YELITE", image: "/assets/images/Sponsors/yelite.webp" },
  { name: "AMASS", image: "/assets/images/Sponsors/amass.webp" },
  { name: "驰翔股份", image: "/assets/images/Sponsors/cxgf.webp" },
  { name: "金地卓立", image: "/assets/images/Sponsors/jdzl.webp" },
  { name: "吉利汽车", image: "/assets/images/Sponsors/jlc.webp" },
  { name: "吉运模压器", image: "/assets/images/Sponsors/jyymq.webp" },
  { name: "坤乾科技", image: "/assets/images/Sponsors/kqkj.webp" },
  { name: "联讯科技", image: "/assets/images/Sponsors/lxkj.webp" },
  { name: "强基装备", image: "/assets/images/Sponsors/qjzb.webp" },
  { name: "夜河神", image: "/assets/images/Sponsors/yeheshen.webp" },
];

const groups = [
  {
    name: "机械组",
    description: "负责机器人结构设计、建模、加工与装配，将创意变为现实",
    logo: "/assets/images/Logo/mechanical.webp",
    accent: "from-[#0062FF]/24 via-[#2563EB]/14 to-transparent",
  },
  {
    name: "电控组",
    description: "嵌入式系统开发、电路设计、电机控制，让机器人\u201C动\u201D起来",
    logo: "/assets/images/Logo/electrical-control.webp",
    accent: "from-[#10B981]/22 via-[#14B8A6]/12 to-transparent",
  },
  {
    name: "视觉组",
    description: "机器视觉、目标识别、自动瞄准，赋予机器人\u201C眼睛\u201D",
    logo: "/assets/images/Logo/vision.webp",
    accent: "from-[#F59E0B]/22 via-[#F97316]/12 to-transparent",
  },
  {
    name: "AI组",
    description: "负责智能算法、决策规划与自主控制，让机器人拥有更强的判断力",
    logo: "/assets/images/Logo/ai.webp",
    accent: "from-[#EF4444]/22 via-[#EC4899]/12 to-transparent",
  },
  {
    name: "软件组",
    description: "负责上位机、工具链与平台开发，支撑整队协同与数据流转",
    logo: "/assets/images/Logo/software.webp",
    accent: "from-[#8B5CF6]/22 via-[#6366F1]/12 to-transparent",
  },
  {
    name: "运营组",
    description: "负责宣传、策划、赛事运营与对外联络，推动团队持续成长",
    logo: "/assets/images/Logo/operations.webp",
    accent: "from-[#22C55E]/22 via-[#84CC16]/12 to-transparent",
  },
];

const aboutModules = [
  {
    name: "参赛",
    title: "在真实对抗中验证整队协同与执行力",
    description: [
      "参赛模块记录的是吉甲大师最直接的赛场表达。从区域赛、公开赛到更高强度的对抗场景，机器人性能、临场判断和团队调度都会在瞬间被放大。",
      "每一次上场都是一次完整的系统检验，检验的不只是硬件和算法，更是队伍在高压环境下的反应速度、复盘效率与战术默契。",
    ],
    highlights: [
      "高强度攻防与临场协同",
      "区域赛与公开赛的实战记录",
      "在赛场上完成技术方案的闭环验证",
    ],
    images: [
      "/assets/images/ContestMoment/contest-moment-01.webp",
      "/assets/images/ContestMoment/contest-moment-02.webp",
      "/assets/images/ContestMoment/contest-moment-03.webp",
      "/assets/images/ContestMoment/contest-moment-04.webp",
      "/assets/images/ContestMoment/contest-moment-05.webp",
      "/assets/images/ContestMoment/contest-moment-06.webp",
      "/assets/images/ContestMoment/contest-moment-07.webp",
      "/assets/images/ContestMoment/contest-moment-08.webp",
    ],
  },
  {
    name: "备赛",
    title: "把每一场正式上场前的细节反复磨透",
    description: [
      "备赛阶段是团队最密集的联调周期。机械、电控、视觉、AI、软件与运营需要围绕同一目标协同推进，把设计、加工、联调、测试和复盘压缩进有限时间内。",
      "从实验室里的调试，到赛前节奏的演练，真正支撑赛场稳定发挥的，往往正是这些看似重复却必须做到极致的准备过程。",
    ],
    highlights: [
      "赛前联调、整机测试与快速修正",
      "围绕比赛目标进行跨组协同推进",
      "通过反复演练降低上场不确定性",
    ],
    images: [
      "/assets/images/Preparation_for_competition/preparation-01.webp",
      "/assets/images/Preparation_for_competition/preparation-02.webp",
      "/assets/images/Preparation_for_competition/preparation-03.webp",
      "/assets/images/Preparation_for_competition/preparation-04.webp",
      "/assets/images/Preparation_for_competition/preparation-05.webp",
      "/assets/images/Preparation_for_competition/preparation-06.webp",
      "/assets/images/Preparation_for_competition/preparation-07.webp",
      "/assets/images/Preparation_for_competition/preparation-08.webp",
    ],
  },
  {
    name: "日常",
    title: "训练、例会与基地生活共同构成团队肌理",
    description: [
      "日常模块展示的是竞赛之外的团队状态。例会、讨论、展示、夜间调试和工位协作，组成了吉甲大师最真实也最持久的运转方式。",
      "正是这些看似平常的日常训练，让成员在长期协作中建立信任，也让整个团队能够在关键节点迅速进入战斗状态。",
    ],
    highlights: [
      "基地训练、例会沟通与日常协作",
      "长期积累形成稳定的团队节奏",
      "从日常磨合中沉淀执行习惯与协同方式",
    ],
    images: [
      "/assets/images/Daily/daily-01.webp",
      "/assets/images/Daily/daily-02.webp",
      "/assets/images/Daily/daily-03.webp",
      "/assets/images/Daily/daily-04.webp",
      "/assets/images/Daily/daily-05.webp",
      "/assets/images/Daily/daily-06.webp",
      "/assets/images/Daily/daily-07.webp",
      "/assets/images/Daily/daily-08.webp",
    ],
  },
  {
    name: "创新创业",
    title: "把竞赛能力延伸到项目孵化与双创实践",
    description: [
      "创新创业模块记录的是团队把技术能力转化为项目成果的过程。从方案打磨、导师指导到双创竞赛与设备开发，团队持续尝试把赛场经验沉淀为更具延展性的实践能力。",
      "这不仅拓宽了成员的技术边界，也让吉甲大师在机器人之外建立起更完整的项目组织与成果表达能力。",
    ],
    highlights: [
      "双创赛事、项目答辩与导师指导",
      "将竞赛经验转化为工程项目与设备开发",
      "持续拓展团队的成果沉淀与对外表达能力",
    ],
    images: [
      "/assets/images/Innovation_and_entrepreneurship/innovation-entrepreneurship-01.webp",
      "/assets/images/Innovation_and_entrepreneurship/innovation-entrepreneurship-02.webp",
      "/assets/images/Innovation_and_entrepreneurship/innovation-entrepreneurship-03.webp",
      "/assets/images/Innovation_and_entrepreneurship/innovation-entrepreneurship-04.webp",
      "/assets/images/Innovation_and_entrepreneurship/innovation-entrepreneurship-05.webp",
      "/assets/images/Innovation_and_entrepreneurship/innovation-entrepreneurship-06.webp",
      "/assets/images/Innovation_and_entrepreneurship/innovation-entrepreneurship-07.webp",
      "/assets/images/Innovation_and_entrepreneurship/innovation-entrepreneurship-08.webp",
    ],
  },
  {
    name: "校企合作",
    title: "在交流、调研与合作中拓宽团队的真实场景",
    description: [
      "校企合作模块展示的是团队走出实验室后的另一种成长路径。通过企业参访、科创营、合作调研和校园展示，成员得以把课堂、竞赛和产业场景连接起来。",
      "这些实践一方面帮助团队理解更真实的工程需求，另一方面也让吉甲大师能够在更广泛的合作中持续吸收外部经验。",
    ],
    highlights: [
      "企业走访、合作调研与科创交流",
      "把校园项目与产业需求连接起来",
      "在外部合作中拓宽团队视野与实践边界",
    ],
    images: [
      "/assets/images/Industry-AcademiaCollaboration/industry-academia-collaboration-01.webp",
      "/assets/images/Industry-AcademiaCollaboration/industry-academia-collaboration-02.webp",
      "/assets/images/Industry-AcademiaCollaboration/industry-academia-collaboration-03.webp",
      "/assets/images/Industry-AcademiaCollaboration/industry-academia-collaboration-04.webp",
      "/assets/images/Industry-AcademiaCollaboration/industry-academia-collaboration-05.webp",
      "/assets/images/Industry-AcademiaCollaboration/industry-academia-collaboration-06.webp",
      "/assets/images/Industry-AcademiaCollaboration/industry-academia-collaboration-07.webp",
      "/assets/images/Industry-AcademiaCollaboration/industry-academia-collaboration-08.webp",
    ],
  },
];

const preloadedAboutImages = new Set<string>();

function getAboutModuleLayoutClass(imageCount: number) {
  if (imageCount >= 8) {
    return "lg:grid-cols-[1.28fr_0.72fr]";
  }

  if (imageCount >= 6) {
    return "lg:grid-cols-[1.18fr_0.82fr]";
  }

  if (imageCount >= 4) {
    return "lg:grid-cols-[1.08fr_0.92fr]";
  }

  return "lg:grid-cols-[0.96fr_1.04fr]";
}

function getAboutPhotoWallClass(imageCount: number) {
  if (imageCount === 1) {
    return "grid-cols-1 auto-rows-[228px] sm:auto-rows-[248px]";
  }

  if (imageCount === 2) {
    return "grid-cols-2 auto-rows-[156px] sm:auto-rows-[176px]";
  }

  if (imageCount <= 4) {
    return "grid-cols-2 auto-rows-[128px] sm:auto-rows-[144px]";
  }

  if (imageCount <= 6) {
    return "grid-cols-2 md:grid-cols-3 auto-rows-[88px] sm:auto-rows-[100px]";
  }

  return "grid-cols-2 md:grid-cols-3 auto-rows-[80px] sm:auto-rows-[90px]";
}

function getAboutPhotoWallRowCount(imageCount: number) {
  if (imageCount <= 2) {
    return 1;
  }

  if (imageCount === 3) {
    return 2;
  }

  if (imageCount <= 6) {
    return 3;
  }

  return 4;
}

function getAboutPhotoCellClass(imageCount: number, index: number) {
  if (imageCount <= 2) {
    return "";
  }

  if (imageCount === 3) {
    return index === 0 ? "sm:col-span-2" : "";
  }

  if (imageCount === 4) {
    return index === 0 ? "sm:col-span-2" : "";
  }

  if (index === 0) {
    return "md:col-span-2 md:row-span-2";
  }

  if (index === imageCount - 1 && imageCount % 2 === 1) {
    return "md:col-span-2";
  }

  if (imageCount >= 8 && index === 4) {
    return "md:col-span-2";
  }

  return "";
}

function getCertificateVisibilityClass(index: number) {
  if (index < 4) {
    return "";
  }

  if (index < 6) {
    return "hidden sm:block";
  }

  if (index < 8) {
    return "hidden lg:block";
  }

  if (index < 10) {
    return "hidden xl:block";
  }

  return "hidden";
}

function StatIcon({
  icon,
  className,
  style,
}: {
  icon: string;
  className?: string;
  style?: CSSProperties;
}) {
  const icons: Record<string, React.ReactNode> = {
    calendar: (
      <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
      </svg>
    ),
    users: (
      <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    layers: (
      <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
      </svg>
    ),
    award: (
      <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" /><circle cx="12" cy="8" r="6" />
      </svg>
    ),
  };
  return <>{icons[icon]}</>;
}

type SectionTone = "blue" | "gold" | "teal" | "amber" | "indigo";

const sectionToneColor: Record<SectionTone, string> = {
  blue: "#0062FF",
  gold: "#F59E0B",
  teal: "#10B981",
  amber: "#FFB547",
  indigo: "#6366F1",
};

function SectionHeading({
  index,
  total,
  labelZh,
  labelEn,
  title,
  description,
  tone,
}: {
  index: string;
  total: string;
  labelZh: string;
  labelEn: string;
  title: string;
  description: string;
  tone: SectionTone;
}) {
  const color = sectionToneColor[tone];
  const lineGradient = `linear-gradient(90deg, transparent, ${color}66, transparent)`;
  const titleGradient = `linear-gradient(180deg, #F1F5F9 0%, #F1F5F9 48%, ${color}66 100%)`;
  const glowGradient = `radial-gradient(ellipse 560px 220px at 50% 50%, ${color}3d, transparent 70%)`;

  return (
    <div className="relative mx-auto mb-12 max-w-[900px] sm:mb-14">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[260px] w-[640px] -translate-x-1/2 -translate-y-1/2 opacity-80 blur-[24px]"
        style={{ backgroundImage: glowGradient }}
      />

      <div className="flex items-center justify-center gap-3 sm:gap-4">
        <span
          className="font-mono text-[11px] font-bold tracking-[0.3em] sm:text-xs"
          style={{ color }}
        >
          {index}
        </span>
        <span
          className="h-px w-10 sm:w-14"
          style={{ backgroundImage: lineGradient }}
        />
        <span
          className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.42em] sm:text-[11px]"
          style={{ color }}
        >
          {labelEn}
        </span>
        <span
          className="h-px w-10 sm:w-14"
          style={{ backgroundImage: lineGradient }}
        />
        <span className="font-mono text-[11px] font-bold tracking-[0.3em] text-fg-dim sm:text-xs">
          / {total}
        </span>
      </div>

      <h2 className="mt-5 text-center font-black leading-[0.98] tracking-[0.04em]">
        <span
          className="inline-block bg-clip-text text-[48px] text-transparent sm:text-[72px] lg:text-[92px]"
          style={{ backgroundImage: titleGradient }}
        >
          {labelZh}
        </span>
      </h2>

      <div
        aria-hidden
        className="mt-5 flex items-center justify-center gap-2.5"
      >
        <span
          className="h-px w-12"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent, ${color}cc)`,
          }}
        />
        <span
          className="h-1.5 w-1.5 rotate-45"
          style={{ backgroundColor: color }}
        />
        <span
          className="h-px w-12"
          style={{
            backgroundImage: `linear-gradient(-90deg, transparent, ${color}cc)`,
          }}
        />
      </div>

      <h3 className="mt-5 text-center text-xl font-bold text-fg-primary sm:text-[26px] lg:text-[30px]">
        {title}
      </h3>

      <p className="mx-auto mt-4 max-w-[720px] text-center text-[15px] leading-relaxed text-fg-muted sm:text-base">
        {description}
      </p>
    </div>
  );
}

export default function Home() {
  const [activeAboutModuleIndex, setActiveAboutModuleIndex] = useState(0);
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(0);
  const [showAllCertificates, setShowAllCertificates] = useState(false);
  const [certAnimPhase, setCertAnimPhase] = useState<"idle" | "entering" | "exiting">("idle");
  const certAnimTimerRef = useRef<number | null>(null);

  const toggleAllCertificates = () => {
    if (certAnimTimerRef.current) {
      window.clearTimeout(certAnimTimerRef.current);
      certAnimTimerRef.current = null;
    }
    if (showAllCertificates) {
      setCertAnimPhase("exiting");
      certAnimTimerRef.current = window.setTimeout(() => {
        setShowAllCertificates(false);
        setCertAnimPhase("idle");
        certAnimTimerRef.current = null;
      }, 420);
    } else {
      setShowAllCertificates(true);
      setCertAnimPhase("entering");
      certAnimTimerRef.current = window.setTimeout(() => {
        setCertAnimPhase("idle");
        certAnimTimerRef.current = null;
      }, 720);
    }
  };

  useEffect(() => {
    return () => {
      if (certAnimTimerRef.current) {
        window.clearTimeout(certAnimTimerRef.current);
      }
    };
  }, []);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const aboutPanelRef = useRef<HTMLDivElement | null>(null);
  const aboutPhotoWallRef = useRef<HTMLDivElement | null>(null);
  const activeAboutModule = aboutModules[activeAboutModuleIndex];
  const activeMilestone = timelineMilestones[activeMilestoneIndex];

  useEffect(() => {
    let disposed = false;
    const unsubscribe = subscribeAuthStateChange((user) => {
      if (!disposed) {
        setCurrentUser(user);
      }
    });

    void getOptionalCurrentUser()
      .then((user) => {
        if (!disposed) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        if (!disposed) {
          setCurrentUser(null);
        }
      });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const panel = aboutPanelRef.current;
    const photoWall = aboutPhotoWallRef.current;

    if (!panel || !photoWall) {
      return;
    }

    let frameId = 0;

    const syncAboutPanelHeight = () => {
      const nextHeight = `${Math.ceil(panel.getBoundingClientRect().height)}px`;
      if (photoWall.style.getPropertyValue("--about-photo-wall-height") !== nextHeight) {
        photoWall.style.setProperty("--about-photo-wall-height", nextHeight);
      }
    };

    const scheduleSync = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(syncAboutPanelHeight);
    };

    syncAboutPanelHeight();

    if (typeof ResizeObserver === "undefined") {
      return () => {
        if (frameId) {
          window.cancelAnimationFrame(frameId);
        }
      };
    }

    const observer = new ResizeObserver(() => {
      scheduleSync();
    });

    observer.observe(panel);

    return () => {
      observer.disconnect();

      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [activeAboutModuleIndex]);

  useEffect(() => {
    const preloadModuleImages = (moduleIndex: number) => {
      for (const image of aboutModules[moduleIndex].images) {
        if (preloadedAboutImages.has(image)) {
          continue;
        }

        preloadedAboutImages.add(image);
        const nextImage = new Image();
        nextImage.decoding = "async";
        nextImage.src = image;
      }
    };

    const timerId = window.setTimeout(() => {
      preloadModuleImages(activeAboutModuleIndex);
      preloadModuleImages((activeAboutModuleIndex + 1) % aboutModules.length);
      preloadModuleImages(
        (activeAboutModuleIndex + aboutModules.length - 1) % aboutModules.length,
      );
    }, 120);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [activeAboutModuleIndex]);

  function activateAboutModule(index: number) {
    startTransition(() => {
      setActiveAboutModuleIndex(index);
    });
  }

  function showPreviousAboutModule() {
    startTransition(() => {
      setActiveAboutModuleIndex((current) =>
        current === 0 ? aboutModules.length - 1 : current - 1,
      );
    });
  }

  function showNextAboutModule() {
    startTransition(() => {
      setActiveAboutModuleIndex((current) =>
        current === aboutModules.length - 1 ? 0 : current + 1,
      );
    });
  }

  function showPreviousMilestone() {
    setActiveMilestoneIndex((current) =>
      current === 0 ? timelineMilestones.length - 1 : current - 1,
    );
  }

  function showNextMilestone() {
    setActiveMilestoneIndex((current) =>
      current === timelineMilestones.length - 1 ? 0 : current + 1,
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030303] text-fg-primary">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="bg-obsidian-base absolute inset-0" />
        <div className="bg-obsidian-grid absolute inset-[-15%]" />
      </div>

      <div className="relative z-10">
      {/* Hero Section */}
      <section
        id="hero"
        className="relative min-h-[100svh] overflow-hidden bg-black"
      >
        <div className="absolute inset-0">
          <video
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/assets/images/Robot/hero-robot.webp"
            aria-label="吉林大学吉甲大师双创基地宣传视频"
          >
            <source src="/assets/images/Video/hero-showreel.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,98,255,0.24),transparent_42%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.18)_0%,rgba(2,6,23,0.78)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.62)_0%,rgba(2,6,23,0.16)_38%,rgba(2,6,23,0.78)_100%)]" />
        </div>

        <div className="relative z-10 flex min-h-[100svh] items-center justify-center">
          <div className="mx-auto flex w-full max-w-[1440px] items-center justify-center px-6 pb-16 pt-28 sm:px-10 sm:pt-32 lg:px-20">
            <div className="flex max-w-2xl flex-col items-center gap-6 text-center sm:gap-8">
              <img
                src="/assets/images/Logo/jijia-master.webp"
                alt="吉甲大师"
                className="motion-fade-down h-48 w-auto max-w-full object-contain sm:h-56 md:h-64"
              />
              <p className="motion-fade-up text-lg font-semibold tracking-[0.22em] text-white sm:text-2xl">
                吉林大学吉甲大师双创基地
              </p>
              <Link
                to="/register"
                className="motion-button inline-flex items-center gap-2 rounded-full border border-white/16 bg-white px-8 py-3 text-sm font-semibold text-slate-950 shadow-[0_20px_60px_-28px_rgba(255,255,255,0.78)] sm:px-10 sm:py-4 sm:text-base"
              >
                加入我们
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 sm:bottom-8">
          <div className="mx-auto flex max-w-[1440px] justify-center px-6 sm:px-10 lg:px-20">
            <a
              href="#about"
              aria-label="下滑查看更多"
              className="pointer-events-auto group relative flex flex-col items-center gap-2 sm:gap-3"
            >
              {/* Scroll hint line with falling dot */}
              <span className="relative flex h-5 w-px items-start overflow-hidden sm:h-6">
                <span className="absolute inset-0 bg-gradient-to-b from-transparent via-white/12 to-transparent" />
                <span className="animate-scroll-hint-trail h-2/5 w-full bg-gradient-to-b from-white/0 via-white/80 to-white/0" />
              </span>

              {/* Button */}
              <span className="motion-button relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-white/[0.08] text-white shadow-[0_14px_36px_-24px_rgba(255,255,255,0.7)] backdrop-blur-md transition-all duration-300 group-hover:border-white/30 group-hover:bg-white/[0.16] sm:h-10 sm:w-10">
                {/* Ambient pulsing ring */}
                <span className="animate-scroll-pulse-ring pointer-events-none absolute inset-0 rounded-full border border-white/25" />
                {/* Chevron icon with gentle bounce */}
                <svg
                  className="animate-scroll-chevron-bounce h-[14px] w-[14px] sm:h-4 sm:w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>

              {/* Label */}
              <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45 transition-colors duration-300 group-hover:text-white/80 sm:text-[11px]">
                Scroll
              </span>
            </a>
          </div>
        </div>
      </section>

      <Navbar currentUser={currentUser} />

      {/* About Section */}
      <section
        id="about"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <SectionHeading
            index="01"
            total="05"
            labelZh="关于我们"
            labelEn="ABOUT US"
            tone="blue"
            title="一支跨校区、跨学科的机器人战队"
            description="TARS-Go 战队成立于 2018 年，取名自电影《星际穿越》中的机器人 TARS。战队依托吉林大学吉甲大师双创基地，汇聚了来自不同学院、不同校区的优秀同学，共同在 RoboMaster 机甲大师赛中竞技拼搏。"
          />

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="motion-stat-surface flex flex-col items-center gap-3 rounded-2xl border border-white/8 bg-surface-light/92 p-7"
              >
                <div className="motion-stat-icon relative flex h-14 w-14 items-center justify-center">
                  <span
                    aria-hidden
                    className="motion-stat-icon-glow pointer-events-none absolute inset-0 opacity-60"
                    style={{
                      backgroundImage: `radial-gradient(circle, ${stat.tint}55 0%, transparent 66%)`,
                      filter: "blur(10px)",
                    }}
                  />
                  <StatIcon
                    icon={stat.icon}
                    className="relative h-9 w-9"
                    style={{
                      color: stat.tint,
                      filter: `drop-shadow(0 6px 16px ${stat.tint}66)`,
                    }}
                  />
                </div>
                <span className="font-mono text-4xl font-bold text-fg-primary">
                  {stat.value}
                </span>
                <span className="text-sm font-medium text-fg-muted">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-12">
            <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="relative overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="relative flex min-w-max gap-3 pr-4">
                    {aboutModules.map((module, index) => {
                      const isActive = index === activeAboutModuleIndex;
                      return (
                        <button
                          key={module.name}
                          type="button"
                          onClick={() => activateAboutModule(index)}
                          className={`motion-button relative flex min-w-[148px] flex-col gap-2 overflow-hidden rounded-2xl border px-4 py-3.5 text-left ${
                            isActive
                              ? "motion-module-tab-active border-accent-primary/70 bg-gradient-to-br from-accent-primary via-accent-primary to-accent-secondary text-fg-inverse shadow-[0_22px_48px_-22px_rgba(0,98,255,0.9)]"
                              : "border-white/10 bg-surface-light text-fg-muted hover:border-accent-primary/35 hover:text-fg-primary"
                          }`}
                          aria-pressed={isActive}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-mono text-[11px] font-bold tracking-[0.22em] ${
                                isActive ? "text-white/85" : "text-fg-dim"
                              }`}
                            >
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                                isActive
                                  ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)]"
                                  : "bg-white/15"
                              }`}
                            />
                          </div>

                          <span className="text-base font-bold tracking-[0.18em]">
                            {module.name}
                          </span>

                          {isActive ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-white/85 to-transparent"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Progress rail */}
                <div
                  aria-hidden
                  className="relative mt-3 h-[2px] overflow-hidden rounded-full bg-white/[0.06]"
                >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-accent-primary/70 via-accent-primary to-accent-secondary shadow-[0_0_10px_rgba(0,98,255,0.55)]"
                    style={{
                      width: `${((activeAboutModuleIndex + 1) / aboutModules.length) * 100}%`,
                      transition:
                        "width 520ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 lg:justify-end">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold tracking-[0.18em] text-accent-primary">
                    {String(activeAboutModuleIndex + 1).padStart(2, "0")}
                  </span>
                  <span className="h-px w-10 bg-gradient-to-r from-accent-primary/45 to-transparent sm:w-14" />
                  <span className="font-mono text-sm text-fg-dim">
                    / {String(aboutModules.length).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={showPreviousAboutModule}
                    className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-accent-primary/30 hover:text-accent-primary"
                    aria-label="查看上一模块"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={showNextAboutModule}
                    className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-accent-primary/30 hover:text-accent-primary"
                    aria-label="查看下一模块"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`grid gap-6 ${getAboutModuleLayoutClass(activeAboutModule.images.length)} lg:items-start`}
            >
              <div
                ref={aboutPhotoWallRef}
                className={`grid ${getAboutPhotoWallClass(activeAboutModule.images.length)} gap-3 lg:h-[var(--about-photo-wall-height)] lg:[grid-template-rows:repeat(var(--about-photo-rows),minmax(0,1fr))]`}
                style={
                  {
                    "--about-photo-rows": String(
                      getAboutPhotoWallRowCount(activeAboutModule.images.length),
                    ),
                  } as CSSProperties
                }
              >
                {activeAboutModule.images.map((image, index) => (
                  <article
                    key={image}
                    style={{ animationDelay: `${index * 55}ms` }}
                    className={`motion-photo-tile-in motion-surface group relative overflow-hidden rounded-[28px] border border-white/10 bg-surface-light ${getAboutPhotoCellClass(activeAboutModule.images.length, index)}`}
                  >
                    <img
                      src={image}
                      alt={`${activeAboutModule.name}模块图片${index + 1}`}
                      decoding="async"
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.05)_0%,rgba(2,6,23,0.18)_42%,rgba(2,6,23,0.84)_100%)]" />
                    <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-8">
                      <span className="inline-flex rounded-full border border-white/12 bg-black/30 px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-white/78 backdrop-blur-sm">
                        {activeAboutModule.name}
                      </span>
                    </div>
                  </article>
                ))}
              </div>

              <div
                ref={aboutPanelRef}
                className="motion-panel-soft rounded-[28px] border border-white/8 bg-surface-light/80 p-5 sm:p-6"
              >
                <div
                  key={activeAboutModuleIndex}
                  style={{ animationDelay: "80ms" }}
                  className="motion-info-panel-in"
                >
                  <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-accent-primary/30 bg-gradient-to-r from-accent-primary/20 via-accent-primary/12 to-accent-primary/5 px-4 py-1.5 text-[13px] font-semibold tracking-[0.22em] text-accent-primary shadow-[0_8px_24px_-10px_rgba(0,98,255,0.55)] backdrop-blur-sm">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 -left-1/4 w-1/3 -skew-x-[24deg] bg-gradient-to-r from-transparent via-white/18 to-transparent motion-tag-shine"
                    />
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-primary/70 opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-primary shadow-[0_0_8px_rgba(0,98,255,0.9)]" />
                    </span>
                    <span className="relative">{activeAboutModule.name}</span>
                  </span>
                  <div className="mt-3.5 flex items-start gap-3 sm:mt-4">
                    <span
                      aria-hidden
                      className="mt-2 h-9 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-accent-primary via-accent-primary/70 to-transparent shadow-[0_0_10px_rgba(0,98,255,0.55)] sm:h-10"
                    />
                    <h3 className="font-display text-3xl text-fg-primary sm:text-4xl">
                      {activeAboutModule.title}
                    </h3>
                  </div>
                  <div className="mt-3.5 space-y-2.5 sm:mt-4">
                    {activeAboutModule.description.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="text-sm leading-6 text-fg-muted sm:text-base sm:leading-7"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>

                  <div className="relative mt-4 overflow-hidden rounded-[24px] border border-accent-gold/15 bg-gradient-to-br from-accent-gold/[0.06] via-surface-primary/68 to-surface-primary/68 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:mt-5 sm:p-5">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent-gold/12 blur-3xl"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -left-6 -bottom-6 h-24 w-24 rounded-full bg-accent-gold/8 blur-2xl"
                    />
                    <div className="relative flex items-center gap-3">
                      <span
                        aria-hidden
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-accent-gold/30 bg-accent-gold/10 shadow-[inset_0_0_10px_rgba(245,158,11,0.18)]"
                      >
                        <svg
                          className="h-3.5 w-3.5 text-accent-gold"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <circle cx="12" cy="12" r="5" />
                          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                        </svg>
                      </span>
                      <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-gold">
                        模块聚焦
                      </h4>
                      <span
                        aria-hidden
                        className="h-px flex-1 bg-gradient-to-r from-accent-gold/40 via-accent-gold/10 to-transparent"
                      />
                    </div>
                    <ul className="relative mt-4 space-y-2">
                      {activeAboutModule.highlights.map((highlight, idx) => (
                        <li
                          key={highlight}
                          className="group relative flex items-start gap-3 rounded-xl border border-transparent px-2 py-1.5 text-sm leading-6 text-fg-muted transition-all duration-300 hover:border-accent-gold/15 hover:bg-accent-gold/[0.05] hover:text-fg-primary sm:text-[15px] sm:leading-7"
                        >
                          <span
                            aria-hidden
                            className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent-gold/25 bg-gradient-to-br from-accent-gold/15 to-accent-gold/5 font-mono text-[11px] font-bold text-accent-gold shadow-[inset_0_0_10px_rgba(245,158,11,0.18)] transition-all duration-300 group-hover:border-accent-gold/45 group-hover:shadow-[0_0_12px_rgba(245,158,11,0.4),inset_0_0_10px_rgba(245,158,11,0.25)]"
                          >
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Achievements Section */}
      <section
        id="achievements"
        className="relative overflow-hidden border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,98,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(79,70,229,0.12),transparent_26%)]" />
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <SectionHeading
            index="02"
            total="05"
            labelZh="团队历程"
            labelEn="OUR JOURNEY"
            tone="gold"
            title="以时间轴回看战队一路走来的每一步"
            description="从双创基地组建，到国际赛事历练，再到 RoboMaster 国赛突破，吉林大学吉甲大师双创基地在一届又一届成员的接力中不断完成技术积累、组织建设与文化沉淀。"
          />

          <div className="relative mx-auto max-w-[1240px]">
            {/* Timeline rail navigation */}
            <div className="mb-8 sm:mb-10">
              <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="relative min-w-[760px] px-2 pt-2 lg:min-w-0">
                  {(() => {
                    const total = timelineMilestones.length;
                    const railInsetPercent = 100 / (total * 2);
                    const progressWidth =
                      total > 1
                        ? (activeMilestoneIndex / (total - 1)) *
                          (100 - 2 * railInsetPercent)
                        : 0;
                    return (
                      <>
                        <div
                          aria-hidden
                          className="pointer-events-none absolute top-[44px] h-[2px] rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
                          style={{
                            left: `${railInsetPercent}%`,
                            right: `${railInsetPercent}%`,
                          }}
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute top-[44px] h-[2px] rounded-full bg-gradient-to-r from-[#FFD700]/50 via-[#FFD700] to-[#FFB547] shadow-[0_0_12px_rgba(255,215,0,0.55)]"
                          style={{
                            left: `${railInsetPercent}%`,
                            width: `${progressWidth}%`,
                            transition:
                              "width 640ms cubic-bezier(0.22, 1, 0.36, 1)",
                          }}
                        />
                      </>
                    );
                  })()}

                  <div
                    className="relative grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${timelineMilestones.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {timelineMilestones.map((item, index) => {
                      const isActive = index === activeMilestoneIndex;
                      const isPast = index < activeMilestoneIndex;
                      return (
                        <button
                          key={item.year}
                          type="button"
                          onClick={() => setActiveMilestoneIndex(index)}
                          className="group relative flex flex-col items-center focus:outline-none"
                          aria-pressed={isActive}
                          aria-label={`${item.year}年 ${item.title}`}
                        >
                          <span
                            className={`font-mono text-[13px] font-bold tracking-[0.08em] transition-all duration-300 ${
                              isActive
                                ? "scale-110 text-[#FFD700] [text-shadow:0_0_12px_rgba(255,215,0,0.55)]"
                                : isPast
                                  ? "text-[#FFD700]/70"
                                  : "text-fg-dim group-hover:text-fg-muted"
                            }`}
                          >
                            {item.year}
                          </span>

                          <span className="h-5" />

                          <span
                            className={`relative z-10 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                              isActive
                                ? "h-5 w-5 border-[#FFD700] bg-gradient-to-br from-[#FFE56B] to-[#FFB800] shadow-[0_0_18px_rgba(255,215,0,0.75)]"
                                : isPast
                                  ? "h-4 w-4 border-[#FFD700]/65 bg-[#FFD700]/30"
                                  : "h-4 w-4 border-white/20 bg-surface-primary group-hover:border-[#FFD700]/55 group-hover:bg-[#FFD700]/10"
                            }`}
                          >
                            {isActive ? (
                              <>
                                <span
                                  aria-hidden
                                  className="pointer-events-none absolute inset-[-6px] animate-ping rounded-full border border-[#FFD700]/45"
                                />
                                <span
                                  aria-hidden
                                  className="pointer-events-none absolute inset-[-4px] rounded-full bg-[#FFD700]/10 blur-[4px]"
                                />
                              </>
                            ) : null}
                          </span>

                          <span
                            className={`mt-3 text-center text-xs font-semibold transition-all duration-300 sm:text-[13px] ${
                              isActive
                                ? "text-fg-primary"
                                : "text-fg-muted group-hover:text-fg-primary"
                            }`}
                          >
                            {item.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Counter + arrow navigation */}
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold tracking-[0.18em] text-[#FFD700]">
                  {String(activeMilestoneIndex + 1).padStart(2, "0")}
                </span>
                <span className="h-px w-10 bg-gradient-to-r from-[#FFD700]/45 to-transparent sm:w-14" />
                <span className="font-mono text-sm text-fg-dim">
                  / {String(timelineMilestones.length).padStart(2, "0")}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={showPreviousMilestone}
                  className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-[#FFD700]/40 hover:text-[#FFD700]"
                  aria-label="查看上一段历程"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={showNextMilestone}
                  className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-[#FFD700]/40 hover:text-[#FFD700]"
                  aria-label="查看下一段历程"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[32px] border border-white/8 bg-surface-light/86 p-6 shadow-[0_24px_70px_-40px_rgba(2,6,23,0.9)] sm:p-8">
              {/* Year watermark */}
              <div
                key={`watermark-${activeMilestone.year}`}
                aria-hidden
                className="motion-year-watermark pointer-events-none absolute -right-4 -top-12 z-0 select-none font-display leading-[0.82] sm:-right-8 sm:-top-20"
                style={{
                  fontSize: "clamp(180px, 28vw, 360px)",
                  background:
                    "linear-gradient(180deg, rgba(255,215,0,0.09) 0%, rgba(255,215,0,0.025) 62%, transparent 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  WebkitTextStroke: "1px rgba(255, 215, 0, 0.06)",
                }}
              >
                {activeMilestone.year}
              </div>

              {/* Ambient gold glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-32 -top-32 z-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,215,0,0.08),transparent_62%)]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -left-24 -bottom-24 z-0 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(255,181,71,0.06),transparent_62%)]"
              />

              <article
                key={activeMilestone.year}
                className="motion-fade-up relative z-10 grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start"
              >
                <div className="flex flex-col gap-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#FFD700]/35 bg-[#FFD700]/10 shadow-[inset_0_0_10px_rgba(255,215,0,0.22)]"
                      >
                        <svg
                          className="h-3.5 w-3.5 text-[#FFD700]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      </span>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#FFD700]">
                        Team Timeline
                      </p>
                      <span
                        aria-hidden
                        className="h-px flex-1 bg-gradient-to-r from-[#FFD700]/40 via-[#FFD700]/10 to-transparent"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                      <span
                        className="font-display text-[56px] leading-none tracking-tight sm:text-[72px] lg:text-[84px]"
                        style={{
                          background:
                            "linear-gradient(180deg, #FFE56B 0%, #FFD700 52%, #FFB547 100%)",
                          WebkitBackgroundClip: "text",
                          backgroundClip: "text",
                          color: "transparent",
                          filter:
                            "drop-shadow(0 8px 24px rgba(255, 215, 0, 0.28))",
                        }}
                      >
                        {activeMilestone.year}
                      </span>
                      <h3 className="font-display text-2xl text-fg-primary sm:text-3xl lg:text-[34px]">
                        · {activeMilestone.title}
                      </h3>
                    </div>
                  </div>

                  <p className="text-sm leading-7 text-fg-muted sm:text-base">
                    {activeMilestone.intro}
                  </p>

                  <div className="relative overflow-hidden rounded-[24px] border border-[#FFD700]/18 bg-gradient-to-br from-[#FFD700]/[0.07] via-surface-primary/72 to-surface-primary/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[#FFD700]/12 blur-3xl"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -left-8 -bottom-10 h-32 w-32 rounded-full bg-[#FFB547]/10 blur-3xl"
                    />
                    <div className="relative flex items-center gap-3">
                      <span
                        aria-hidden
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#FFD700]/35 bg-[#FFD700]/12 shadow-[inset_0_0_10px_rgba(255,215,0,0.25)]"
                      >
                        <svg
                          className="h-3.5 w-3.5 text-[#FFD700]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m12 2 2.39 6.96h7.32l-5.92 4.3 2.26 6.96L12 15.9l-6.05 4.32 2.26-6.96-5.92-4.3h7.32Z" />
                        </svg>
                      </span>
                      <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-[#FFD700]">
                        关键节点
                      </h4>
                      <span
                        aria-hidden
                        className="h-px flex-1 bg-gradient-to-r from-[#FFD700]/45 via-[#FFD700]/10 to-transparent"
                      />
                    </div>
                    <ul className="relative mt-5 space-y-4 pl-1">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-[#FFD700]/50 via-[#FFD700]/20 to-transparent"
                      />
                      {activeMilestone.highlights.map((highlight) => (
                        <li
                          key={highlight}
                          className="group relative flex items-start gap-4 text-sm leading-7 text-fg-muted transition-colors duration-300 hover:text-fg-primary sm:text-[15px]"
                        >
                          <span
                            aria-hidden
                            className="relative z-10 mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-[#FFD700]/45 bg-surface-primary shadow-[0_0_14px_rgba(255,215,0,0.32)] transition-all duration-300 group-hover:border-[#FFD700] group-hover:shadow-[0_0_18px_rgba(255,215,0,0.55)]"
                          >
                            <span
                              aria-hidden
                              className="absolute inline-flex h-full w-full rounded-full bg-[#FFD700]/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-hover:animate-ping"
                            />
                            <span className="relative h-2 w-2 rounded-full bg-gradient-to-br from-[#FFE56B] to-[#FFB800] shadow-[0_0_6px_rgba(255,215,0,0.8)]" />
                          </span>
                          <span className="pt-0.5">{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div
                  className={`grid gap-4 ${
                    activeMilestone.images.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"
                  }`}
                >
                  {activeMilestone.images.map((image, index) => (
                    <figure
                      key={image}
                      className={`overflow-hidden rounded-[24px] border border-white/8 bg-surface-primary ${
                        activeMilestone.images.length === 1 ? "sm:max-w-[760px]" : ""
                      }`}
                    >
                      <img
                        src={image}
                        alt={`${activeMilestone.year}年${activeMilestone.title}历史图片${index + 1}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </figure>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* Robot Showcase Section */}
      <section
        id="robots"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <SectionHeading
            index="03"
            total="05"
            labelZh="机器人展示"
            labelEn="OUR ROBOTS"
            tone="teal"
            title="我们的战旗机甲"
            description="每一台机器人都是团队智慧的结晶，融合机械设计、嵌入式系统、机器视觉、人工智能等多项技术。"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
            {robots.map((robot, index) => (
              <div
                key={robot.name}
                className="motion-surface overflow-hidden rounded-2xl border border-white/8 bg-surface-light/92"
              >
                {robotImages[index] ? (
                  <img
                    src={robotImages[index]}
                    alt={robot.name}
                    loading="lazy"
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="w-full h-40 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 flex items-center justify-center">
                    <svg
                      className="w-12 h-12 text-fg-muted/30"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 8V4H8" />
                      <rect width="16" height="12" x="4" y="8" rx="2" />
                      <path d="M2 14h2" />
                      <path d="M20 14h2" />
                      <path d="M15 13v2" />
                      <path d="M9 13v2" />
                    </svg>
                  </div>
                )}
                <div className="p-5 flex flex-col gap-2">
                  <h3 className="text-base font-bold text-fg-primary">
                    {robot.name}
                  </h3>
                  <p className="text-[13px] text-fg-muted leading-relaxed">
                    {robot.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Achievement Certificates Section */}
      <section
        id="certificates"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="mx-auto max-w-[1440px] px-6 sm:px-10 lg:px-20">
          <SectionHeading
            index="04"
            total="05"
            labelZh="成就展示"
            labelEn="ACHIEVEMENTS"
            tone="amber"
            title="团队荣誉证书与阶段成果陈列"
            description="这里集中展示团队在创新创业、学科竞赛与 RoboMaster 相关实践中获得的阶段性荣誉。整体采用规整的矩形照片墙陈列，便于更直接地浏览不同阶段的获奖成果。"
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {achievementCertificates.map((image, index) => {
              const isBreakpointHidden = index >= 4;
              const breakpointClass =
                showAllCertificates || certAnimPhase === "exiting"
                  ? ""
                  : getCertificateVisibilityClass(index);
              const animClass =
                isBreakpointHidden && certAnimPhase === "entering"
                  ? "animate-cert-reveal"
                  : isBreakpointHidden && certAnimPhase === "exiting"
                    ? "animate-cert-collapse"
                    : "";
              const staggerDelay =
                isBreakpointHidden && certAnimPhase !== "idle"
                  ? `${Math.min((index - 4) * 28, 320)}ms`
                  : undefined;
              return (
                <article
                  key={image}
                  className={`motion-surface group relative aspect-[4/3] overflow-hidden rounded-[24px] border border-white/8 bg-surface-light/86 p-3 sm:p-4 ${breakpointClass} ${animClass}`}
                  style={staggerDelay ? { animationDelay: staggerDelay } : undefined}
                >
                  <span className="absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-black/28 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-accent-gold backdrop-blur-sm">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="h-full overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_56%)]">
                    <img
                      src={image}
                      alt={`团队荣誉证书${index + 1}`}
                      loading="lazy"
                      className="h-full w-full object-fill transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                    />
                  </div>
                </article>
              );
            })}
          </div>

          {achievementCertificates.length > 10 ? (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={toggleAllCertificates}
                disabled={certAnimPhase !== "idle"}
                className="motion-button inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.08] px-7 py-3 text-sm font-semibold tracking-[0.18em] text-fg-primary backdrop-blur-md hover:border-accent-gold/40 hover:text-accent-gold disabled:cursor-not-allowed"
                aria-expanded={showAllCertificates}
              >
                More
                <svg
                  className={`h-4 w-4 transition-transform duration-300 ${
                    showAllCertificates ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Join Us Section */}
      <section
        id="join"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20 flex flex-col items-center">
          <SectionHeading
            index="05"
            total="05"
            labelZh="加入我们"
            labelEn="JOIN US"
            tone="indigo"
            title="找到你的战位，一起征服星辰大海"
            description="我们欢迎来自各个专业的同学加入，无论你是零基础还是大佬，这里都有你的位置。"
          />

          <div className="mb-12 grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <div
                key={group.name}
                className="motion-surface relative overflow-hidden rounded-[28px] border border-white/8 bg-surface-primary p-7 shadow-[0_18px_40px_-32px_rgba(2,6,23,0.68)]"
              >
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${group.accent}`}
                />
                <div className="relative flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[22px] border border-white/12 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                      <img
                        src={group.logo}
                        alt={`${group.name} logo`}
                        loading="lazy"
                        className="h-12 w-12 object-contain"
                      />
                    </div>
                    <h3 className="text-lg font-bold text-fg-primary">
                      {group.name}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-fg-muted">
                    {group.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/register"
            className="motion-button inline-flex items-center gap-2 rounded-full bg-accent-primary px-10 py-4 text-lg font-semibold text-fg-inverse shadow-[0_18px_40px_-24px_rgba(0,98,255,0.78)] transition-opacity hover:opacity-90"
          >
            立即报名
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-transparent px-5 py-10 sm:px-10 sm:py-12 lg:px-20">
        <div className="max-w-[1440px] mx-auto">
          {/* Footer top */}
          <div className="mb-6 grid grid-cols-2 gap-x-5 gap-y-7 sm:mb-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-[320px_120px_170px_140px] xl:grid-cols-[320px_120px_170px_130px_minmax(280px,1fr)]">
            {/* Brand */}
            <div className="col-span-2 flex w-full flex-col items-center gap-3 text-center md:col-span-1 md:w-[320px] md:items-start md:gap-4 md:text-left shrink-0">
              <img
                src="/assets/images/Logo/jijia-master.webp"
                alt="吉甲大师"
                loading="lazy"
                className="h-12 w-fit max-w-[200px] object-contain sm:h-14 sm:max-w-[220px]"
              />
              <p className="text-[12.5px] text-fg-muted leading-relaxed max-w-[280px] sm:text-[13px]">
                吉林大学吉甲大师双创基地
                <br />
                外在做事沉稳有序，内在思维活跃创新
              </p>
            </div>

            {/* Quick nav */}
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <h4 className="text-[13px] font-bold text-fg-inverse sm:text-sm">快速导航</h4>
              <a href="/#hero" className="text-[12.5px] text-fg-muted hover:text-fg-primary transition-colors sm:text-[13px]">首页</a>
              <a href="/#about" className="text-[12.5px] text-fg-muted hover:text-fg-primary transition-colors sm:text-[13px]">关于我们</a>
              <a href="/#achievements" className="text-[12.5px] text-fg-muted hover:text-fg-primary transition-colors sm:text-[13px]">团队历程</a>
              <a href="/#robots" className="text-[12.5px] text-fg-muted hover:text-fg-primary transition-colors sm:text-[13px]">机器人展示</a>
              <a href="/#certificates" className="text-[12.5px] text-fg-muted hover:text-fg-primary transition-colors sm:text-[13px]">成就展示</a>
              <a href="/#join" className="text-[12.5px] text-fg-muted hover:text-fg-primary transition-colors sm:text-[13px]">加入我们</a>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <h4 className="text-[13px] font-bold text-fg-inverse sm:text-sm">联系我们</h4>
              <span className="text-[12.5px] text-fg-muted sm:text-[13px]">吉林大学南湖校区</span>
              <span className="text-[12.5px] text-fg-muted sm:text-[13px]">吉甲大师双创基地</span>
              <span className="text-[12.5px] break-all text-fg-muted sm:text-[13px]">tarsgo@jlu.edu.cn</span>
            </div>

            {/* Social */}
            <div className="col-span-2 flex flex-col items-center gap-3 md:col-span-1 md:items-start">
              <h4 className="text-[13px] font-bold text-fg-inverse sm:text-sm">关注我们</h4>
              <div className="flex gap-3">
                <div className="w-9 h-9 bg-white/[0.08] rounded-lg flex items-center justify-center">
                  <svg className="w-[18px] h-[18px] text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" />
                  </svg>
                </div>
                <div className="w-9 h-9 bg-white/[0.08] rounded-lg flex items-center justify-center">
                  <svg className="w-[18px] h-[18px] text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  </svg>
                </div>
                <div className="w-9 h-9 bg-white/[0.08] rounded-lg flex items-center justify-center">
                  <svg className="w-[18px] h-[18px] text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Sponsors */}
            <div className="col-span-2 flex flex-col gap-3 md:col-span-2 lg:col-span-4 xl:col-span-1">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-[13px] font-bold text-fg-inverse sm:text-sm">赞助商支持</h4>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-gold sm:text-[11px]">
                  Sponsors
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3 sm:gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                {sponsorLogos.map((sponsor) => (
                  <div
                    key={sponsor.name}
                    className="motion-surface flex h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06] p-1.5 sm:h-12"
                  >
                    <img
                      src={sponsor.image}
                      alt={sponsor.name}
                      loading="lazy"
                      className="h-full w-full object-fill"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.08] mb-6 sm:mb-8" />

          {/* Copyright */}
          <div className="flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:gap-4 sm:text-left">
            <span className="text-[11px] text-white/[0.27] sm:text-xs">
              &copy; {new Date().getFullYear()} TARS-Go 战队 · 吉林大学吉甲大师双创基地
            </span>
            <span className="text-[11px] text-white/[0.27] sm:text-xs">
              Powered by RoboMaster
            </span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
