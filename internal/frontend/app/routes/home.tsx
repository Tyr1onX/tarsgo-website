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
  getCachedCurrentUser,
  getOptionalCurrentUser,
  hasKnownAnonymousSession,
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
    tint: "#D0AD69",
  },
  {
    icon: "users",
    value: "35+",
    label: "团队成员",
    tint: "#D0AD69",
  },
  {
    icon: "layers",
    value: "5",
    label: "战队组别",
    tint: "#D0AD69",
  },
  {
    icon: "award",
    value: "Top 16",
    label: "全国最佳成绩",
    tint: "#D0AD69",
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
  },
  {
    name: "电控组",
    description: "嵌入式系统开发、电路设计、电机控制，让机器人\u201C动\u201D起来",
    logo: "/assets/images/Logo/electrical-control.webp",
  },
  {
    name: "视觉组",
    description: "机器视觉、目标识别、自动瞄准，赋予机器人\u201C眼睛\u201D",
    logo: "/assets/images/Logo/vision.webp",
  },
  {
    name: "AI组",
    description: "负责智能算法、决策规划与自主控制，让机器人拥有更强的判断力",
    logo: "/assets/images/Logo/ai.webp",
  },
  {
    name: "运营组",
    description: "负责宣传、策划、赛事运营与对外联络，推动团队持续成长",
    logo: "/assets/images/Logo/operations.webp",
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
      "备赛阶段是团队最密集的联调周期。机械、电控、视觉、AI 与运营需要围绕同一目标协同推进，把设计、加工、联调、测试和复盘压缩进有限时间内。",
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

function SectionHeading({
  index,
  total,
  labelZh,
  labelEn,
  title,
  description,
}: {
  index: string;
  total: string;
  labelZh: string;
  labelEn: string;
  title: string;
  description: string;
}) {
  const color = "#D0AD69";

  return (
    <div className="public-section-heading mx-auto mb-9 max-w-[900px] sm:mb-11">
      <div className="flex items-center justify-center gap-3 sm:justify-start sm:gap-4">
        <span
          className="font-mono text-[11px] font-semibold tracking-[0.18em] sm:text-xs"
          style={{ color }}
        >
          {index} / {total}
        </span>
        <span
          className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] sm:text-[11px]"
          style={{ color }}
        >
          {labelEn}
        </span>
      </div>

      <h2 className="mt-3 text-center text-[32px] font-semibold leading-tight tracking-[-0.03em] text-fg-primary sm:text-left sm:text-[40px]">
        {labelZh}
      </h2>

      <h3 className="mt-2 text-center text-base font-medium text-fg-primary sm:text-left sm:text-lg">
        {title}
      </h3>

      <p className="mx-auto mt-3 max-w-[760px] text-center text-sm leading-6 text-fg-muted sm:mx-0 sm:text-left sm:text-[15px] sm:leading-7">
        {description}
      </p>
    </div>
  );
}

function getNavbarUser(): AuthUser | null | undefined {
  return getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : undefined);
}

export default function Home() {
  const [activeAboutModuleIndex, setActiveAboutModuleIndex] = useState(0);
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(0);
  const [showAllCertificates, setShowAllCertificates] = useState(false);

  const toggleAllCertificates = () => {
    setShowAllCertificates((current) => !current);
  };
  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(getNavbarUser);
  const [authError, setAuthError] = useState(false);
  const aboutPanelRef = useRef<HTMLDivElement | null>(null);
  const aboutPhotoWallRef = useRef<HTMLDivElement | null>(null);
  const activeAboutModule = aboutModules[activeAboutModuleIndex];
  const activeMilestone = timelineMilestones[activeMilestoneIndex];

  useEffect(() => {
    let disposed = false;
    const unsubscribe = subscribeAuthStateChange(() => {
      if (!disposed) {
        setCurrentUser(getNavbarUser());
        setAuthError(false);
      }
    });

    void getOptionalCurrentUser()
      .then(() => {
        if (!disposed) {
          setCurrentUser(getNavbarUser());
          setAuthError(false);
        }
      })
      .catch(() => {
        if (!disposed) {
          setCurrentUser(getNavbarUser());
          setAuthError(true);
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
    <div className="public-home relative min-h-screen overflow-hidden bg-[#101516] text-fg-primary">
      <div className="relative z-10">
      {/* Hero Section */}
      <section
        id="hero"
        className="public-home-hero relative min-h-[88svh] overflow-hidden bg-black sm:min-h-[92svh]"
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
          <div className="public-home-hero-shade absolute inset-0" />
        </div>

        <div className="relative z-10 flex min-h-[88svh] items-center sm:min-h-[92svh]">
          <div className="mx-auto flex w-full max-w-[1440px] items-center px-6 pb-20 pt-28 sm:px-10 sm:pt-32 lg:px-20">
            <div className="flex max-w-2xl flex-col items-center gap-4 text-center sm:items-start sm:text-left">
              <img
                src="/assets/images/Logo/tarsgo-logo-v5.svg"
                alt="TARSGO"
                className="h-20 w-auto max-w-full object-contain sm:h-24"
              />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e0c790] sm:text-sm">
                吉林大学 · RoboMaster 机甲大师赛
              </p>
              <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-5xl sm:leading-[1.12] lg:text-[56px]">
                吉林大学吉甲大师
                <br className="hidden sm:block" />
                机器人战队
              </h1>
              <p className="max-w-lg text-sm leading-6 text-white/78 sm:text-base sm:leading-7">
                自 2018 年起持续投入机器人研发与 RoboMaster 竞赛，2024 年首次晋级全国总决赛。
              </p>
              <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link
                  to="/register"
                  className="motion-button inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#d0ad69] px-6 py-3 text-sm font-semibold text-[#171915] transition-colors hover:bg-[#dfbd7c] sm:px-7"
                >
                  立即报名
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
                <a
                  href="#robots"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/35 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:px-7"
                >
                  认识我们的机器人
                </a>
              </div>
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
              <span className="inline-flex items-center gap-2 text-xs font-medium text-white/70">
                向下了解吉甲大师
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </a>
          </div>
        </div>
      </section>

      <Navbar currentUser={currentUser} authError={authError} />

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
                  <StatIcon
                    icon={stat.icon}
                    className="relative h-9 w-9"
                    style={{
                      color: stat.tint,
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
                              ? "motion-module-tab-active border-[#dfbd7c] bg-[#d0ad69] text-[#171915]"
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
                    className="absolute left-0 top-0 h-full rounded-full bg-accent-primary"
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
                      <span className="inline-flex rounded-full border border-white/12 bg-black/70 px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-white/90">
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
                  <span className="inline-flex items-center gap-2 rounded-full border border-accent-primary/30 bg-accent-primary/10 px-4 py-1.5 text-[13px] font-semibold tracking-[0.22em] text-accent-primary">
                    <span className="inline-flex h-2 w-2 rounded-full bg-accent-primary" />
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

                  <div className="relative mt-4 overflow-hidden rounded-[24px] border border-accent-gold/15 bg-surface-primary p-4 sm:mt-5 sm:p-5">
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
                            className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent-gold/25 bg-accent-gold/10 font-mono text-[11px] font-bold text-accent-gold"
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
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <SectionHeading
            index="02"
            total="05"
            labelZh="团队历程"
            labelEn="OUR JOURNEY"
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
                          className="pointer-events-none absolute top-[44px] h-[2px] rounded-full bg-[#D0AD69]"
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
                            className={`font-mono text-[13px] font-semibold tracking-[0.08em] ${
                              isActive
                                ? "text-[#D0AD69]"
                                : isPast
                                  ? "text-[#D0AD69]/70"
                                  : "text-fg-dim group-hover:text-fg-muted"
                            }`}
                          >
                            {item.year}
                          </span>

                          <span className="h-5" />

                          <span
                            className={`relative z-10 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                              isActive
                                ? "h-5 w-5 border-[#D0AD69] bg-[#D0AD69]"
                                : isPast
                                ? "h-4 w-4 border-[#D0AD69]/65 bg-[#D0AD69]/30"
                                : "h-4 w-4 border-white/20 bg-surface-primary group-hover:border-[#D0AD69]/55 group-hover:bg-[#D0AD69]/10"
                            }`}
                          >
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
                <span className="font-mono text-sm font-bold tracking-[0.18em] text-[#D0AD69]">
                  {String(activeMilestoneIndex + 1).padStart(2, "0")}
                </span>
                <span className="h-px w-10 bg-gradient-to-r from-[#D0AD69]/45 to-transparent sm:w-14" />
                <span className="font-mono text-sm text-fg-dim">
                  / {String(timelineMilestones.length).padStart(2, "0")}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={showPreviousMilestone}
                  className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-[#D0AD69]/40 hover:text-[#D0AD69]"
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
                  className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-[#D0AD69]/40 hover:text-[#D0AD69]"
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
              <article
                key={activeMilestone.year}
                className="motion-fade-up relative z-10 grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start"
              >
                <div className="flex flex-col gap-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#D0AD69]/35 bg-[#D0AD69]/10 shadow-[inset_0_0_10px_rgba(255,215,0,0.22)]"
                      >
                        <svg
                          className="h-3.5 w-3.5 text-[#D0AD69]"
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
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#D0AD69]">
                        Team Timeline
                      </p>
                      <span
                        aria-hidden
                        className="h-px flex-1 bg-gradient-to-r from-[#D0AD69]/40 via-[#D0AD69]/10 to-transparent"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                      <span
                        className="font-display text-[56px] font-semibold leading-none tracking-tight text-[#D0AD69] sm:text-[72px] lg:text-[84px]"
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

                  <div className="relative overflow-hidden rounded-[24px] border border-[#D0AD69]/18 bg-surface-primary p-5">
                    <div className="relative flex items-center gap-3">
                      <span
                        aria-hidden
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#D0AD69]/35 bg-[#D0AD69]/12 shadow-[inset_0_0_10px_rgba(255,215,0,0.25)]"
                      >
                        <svg
                          className="h-3.5 w-3.5 text-[#D0AD69]"
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
                      <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-[#D0AD69]">
                        关键节点
                      </h4>
                      <span
                        aria-hidden
                        className="h-px flex-1 bg-gradient-to-r from-[#D0AD69]/45 via-[#D0AD69]/10 to-transparent"
                      />
                    </div>
                    <ul className="relative mt-5 space-y-4 pl-1">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-[#D0AD69]/50 via-[#D0AD69]/20 to-transparent"
                      />
                      {activeMilestone.highlights.map((highlight) => (
                        <li
                          key={highlight}
                          className="group relative flex items-start gap-4 text-sm leading-7 text-fg-muted transition-colors duration-300 hover:text-fg-primary sm:text-[15px]"
                        >
                          <span
                            aria-hidden
                            className="relative z-10 mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-[#D0AD69]/45 bg-surface-primary shadow-[0_0_14px_rgba(255,215,0,0.32)] transition-all duration-300 group-hover:border-[#D0AD69] group-hover:shadow-[0_0_18px_rgba(255,215,0,0.55)]"
                          >
                            <span className="relative h-2 w-2 rounded-full bg-[#D0AD69]" />
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
            title="团队荣誉证书与阶段成果陈列"
            description="这里集中展示团队在创新创业、学科竞赛与 RoboMaster 相关实践中获得的阶段性荣誉。整体采用规整的矩形照片墙陈列，便于更直接地浏览不同阶段的获奖成果。"
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {achievementCertificates.map((image, index) => {
              const breakpointClass =
                showAllCertificates ? "" : getCertificateVisibilityClass(index);
              return (
                <article
                  key={image}
                  className={`motion-surface group relative aspect-[4/3] overflow-hidden rounded-[24px] border border-white/8 bg-surface-light/86 p-3 sm:p-4 ${breakpointClass}`}
                >
                  <span className="absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-accent-gold">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="h-full overflow-hidden rounded-[18px] bg-surface-primary">
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
                className="motion-button inline-flex items-center gap-2 rounded-full border border-white/12 bg-surface-light px-7 py-3 text-sm font-semibold tracking-[0.18em] text-fg-primary hover:border-accent-gold/40 hover:text-accent-gold"
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
            title="加入一支持续做机器人、参加比赛的团队"
            description="了解战队各组别，选择感兴趣的方向并提交报名。"
          />

          <div className="mb-12 grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <div
                key={group.name}
                className="motion-surface relative overflow-hidden rounded-[28px] border border-white/8 bg-surface-primary p-6"
              >
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
      <footer className="border-t border-white/[0.08] bg-transparent px-5 py-10 sm:px-10 lg:px-20">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex flex-col gap-6 border-b border-white/[0.08] pb-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-start gap-3">
              <img
                src="/assets/images/Logo/tarsgo-logo-v5.svg"
                alt="TARSGO"
                loading="lazy"
                className="h-12 w-auto max-w-[220px] object-contain"
              />
              <p className="text-sm text-fg-muted">吉林大学吉甲大师双创基地</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <nav aria-label="官方社交账号" className="flex flex-wrap items-center gap-2">
                <a
                  href="https://www.douyin.com/user/MS4wLjABAAAAZJcCtp6uwKt4wKUwa_STi1GadztAmwBwHKN0jjjDj2MNjgOclLsim387ZDtRPjvW"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="抖音：吉甲大师TARS-GO（在新标签页打开）"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.12] px-3 py-2 text-fg-muted transition-colors hover:border-accent-primary/50 hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary"
                >
                  <DouyinIcon />
                  <span className="flex flex-col leading-tight">
                    <span className="text-xs font-medium text-fg-primary">抖音</span>
                    <span className="text-xs">吉甲大师TARS-GO</span>
                  </span>
                </a>
                <a
                  href="https://space.bilibili.com/488284486"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="B站：吉甲大师TARS-GO（在新标签页打开）"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.12] px-3 py-2 text-fg-muted transition-colors hover:border-accent-primary/50 hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary"
                >
                  <BilibiliIcon />
                  <span className="flex flex-col leading-tight">
                    <span className="text-xs font-medium text-fg-primary">B站</span>
                    <span className="text-xs">吉甲大师TARS-GO</span>
                  </span>
                </a>
              </nav>
            </div>
          </div>

          <section className="py-8" aria-label="赞助商">
            <h2 className="mb-4 text-sm font-semibold text-fg-primary">赞助商支持</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {sponsorLogos.map((sponsor) => (
                <div
                  key={sponsor.name}
                  className="flex h-16 items-center justify-center overflow-hidden rounded-md bg-white p-2 sm:h-20 sm:p-3"
                >
                  <img
                    src={sponsor.image}
                    alt={sponsor.name}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </div>
              ))}
            </div>
          </section>

          <p className="border-t border-white/[0.08] pt-5 text-xs text-fg-dim">
            &copy; {new Date().getFullYear()} TARS-Go 战队 · 吉林大学吉甲大师双创基地
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}

function DouyinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function BilibiliIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.391.129-.707.4-.96.249-.249.56-.373.933-.373z" />
    </svg>
  );
}
