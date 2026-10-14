import type { Route } from "./+types/home";
import { useEffect, useId, useRef, useState } from "react";
import { Navbar } from "../components/navbar";
import { JoinExperience } from "../components/join-experience";
import { RobotPhotoGallery } from "../components/robot-photo-gallery";
import { SiteLogo } from "~/components/site-logo";
import { Link, useLocation, useNavigate } from "react-router";
import {
  getCachedCurrentUser,
  getOptionalCurrentUser,
  hasKnownAnonymousSession,
  subscribeAuthStateChange,
  type AuthUser,
} from "~/lib/auth-client";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TARSGO | 吉林大学吉甲大师战队" },
    {
      name: "description",
      content:
        "吉林大学 TARSGO 战队官网：以 RoboMaster 竞赛为牵引，持续开展机器人研发与团队协作。",
    },
  ];
}

const stats = [
  { value: "2018", label: "成立年份" },
  { value: "35+", label: "团队成员" },
  { value: "5", label: "战队组别" },
  { value: "Top 16", label: "全国最佳成绩" },
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
    images: [{ src: "/assets/images/Milestone/2018-set-sail.webp", width: 660, height: 428, fit: "cover" }],
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
    images: [{ src: "/assets/images/Milestone/2019-breakthrough.webp", width: 900, height: 550, fit: "cover" }],
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
      { src: "/assets/images/Milestone/2020-first-achievement-01.webp", width: 900, height: 393, fit: "cover" },
      { src: "/assets/images/Milestone/2020-first-achievement-02.webp", width: 660, height: 933, fit: "contain" },
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
    images: [{ src: "/assets/images/Milestone/2021-technological-iteration.webp", width: 1267, height: 845, fit: "cover" }],
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
      { src: "/assets/images/Milestone/2022-inheritance-system-01.webp", width: 1080, height: 773, fit: "cover" },
      { src: "/assets/images/Milestone/2022-inheritance-system-02.webp", width: 1269, height: 845, fit: "cover" },
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
      { src: "/assets/images/Milestone/2023-cultural-development-01.webp", width: 1222, height: 862, fit: "cover" },
      { src: "/assets/images/Milestone/2023-cultural-development-02.webp", width: 1258, height: 839, fit: "cover" },
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
    images: [{ src: "/assets/images/Milestone/2024-national-competition.webp", width: 1080, height: 720, fit: "cover" }],
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
    images: [{ src: "/assets/images/Milestone/2025-legacy.webp", width: 1269, height: 714, fit: "cover" }],
  },
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
    directions: ["结构设计", "建模", "加工与装配"],
    logoBlack: "/assets/images/Groups/mechanical-black.svg",
    logoWhite: "/assets/images/Groups/mechanical-white.svg",
    logoStructure: "/assets/images/Groups/mechanical-structure.svg",
  },
  {
    name: "电控组",
    description: "嵌入式系统开发、电路设计、电机控制，让机器人\u201C动\u201D起来",
    directions: ["嵌入式系统开发", "电路设计", "电机控制"],
    logoBlack: "/assets/images/Groups/electrical-control-black.svg",
    logoWhite: "/assets/images/Groups/electrical-control-white.svg",
    logoStructure: "/assets/images/Groups/electrical-control-structure.svg",
  },
  {
    name: "视觉组",
    description: "机器视觉、目标识别、自动瞄准，赋予机器人\u201C眼睛\u201D",
    directions: ["机器视觉", "目标识别", "自动瞄准"],
    logoBlack: "/assets/images/Groups/vision-black.svg",
    logoWhite: "/assets/images/Groups/vision-white.svg",
    logoStructure: "/assets/images/Groups/vision-structure.svg",
  },
  {
    name: "AI组",
    description: "负责智能算法、决策规划与自主控制，让机器人拥有更强的判断力",
    directions: ["智能算法", "决策规划", "自主控制"],
    logoBlack: "/assets/images/Groups/ai-black.svg",
    logoWhite: "/assets/images/Groups/ai-white.svg",
    logoStructure: "/assets/images/Groups/ai-structure.svg",
  },
  {
    name: "运营组",
    description: "负责宣传、策划、赛事运营与对外联络，推动团队持续成长",
    directions: ["宣传", "策划", "赛事运营", "对外联络"],
    logoBlack: "/assets/images/Groups/operations-black.svg",
    logoWhite: "/assets/images/Groups/operations-white.svg",
    logoStructure: "/assets/images/Groups/operations-structure.svg",
  },
];

function TeamGroupMark({ group, className = "" }: { group: typeof groups[number]; className?: string }) {
  return (
    <span className={`team-group-mark ${className}`.trim()} aria-hidden="true">
      <img src={group.logoBlack} alt="" loading="lazy" decoding="async" className="team-group-mark__image team-group-mark__image--light" />
      <img src={group.logoWhite} alt="" loading="lazy" decoding="async" className="team-group-mark__image team-group-mark__image--dark" />
    </span>
  );
}

const aboutModules = [
  {
    name: "参赛",
    title: "在赛场上检验机器人与团队协作",
    description: "正式比赛让机器人表现、临场判断与团队调度得到直接检验。",
    image: "/assets/images/ContestMoment/contest-moment-04.webp",
    imageAlt: "队员在 RoboMaster 比赛现场共同检查机器人。",
  },
  {
    name: "备赛",
    title: "把上场前的细节反复磨透",
    description: "围绕机器人进行联调、测试和修正，让方案经得起赛场验证。",
    image: "/assets/images/Preparation_for_competition/preparation-02.webp",
    imageAlt: "队员围绕机器人进行赛前检查与调试。",
  },
  {
    name: "日常",
    title: "在日常训练中建立长期默契",
    description: "训练、讨论与共同生活，组成团队持续协作的日常。",
    image: "/assets/images/Daily/daily-02.webp",
    imageAlt: "队员围绕笔记本与模型进行日常讨论。",
  },
  {
    name: "创新创业",
    title: "把竞赛经验延伸到项目实践",
    description: "在双创赛事和成果展示中，继续打磨技术方案与项目表达。",
    image: "/assets/images/Innovation_and_entrepreneurship/innovation-entrepreneurship-02.webp",
    imageAlt: "团队成员在创新创业展示现场介绍项目。",
  },
  {
    name: "校企合作",
    title: "在产业现场理解真实工程需求",
    description: "通过企业走访与交流，把校园里的工程实践连接到真实场景。",
    image: "/assets/images/Industry-AcademiaCollaboration/industry-academia-collaboration-03.webp",
    imageAlt: "团队成员在交流现场共同观察一件工程样品。",
  },
];

export type PublicPage = "home" | "about" | "robots" | "events-and-honors" | "team-history" | "join";

const topicPages: Record<Exclude<PublicPage, "home">, { title: string; eyebrow: string; description: string; image: string; alt: string }> = {
  about: {
    title: "认识吉甲",
    eyebrow: "ABOUT TARSGO",
    description: "从赛场、训练和项目实践中，认识吉林大学吉甲大师双创基地。",
    image: "/assets/images/ContestMoment/contest-moment-04.webp",
    alt: "队员在 RoboMaster 比赛现场共同检查机器人。",
  },
  robots: {
    title: "2026 / 2025 / 2024 赛季机器人阵容",
    eyebrow: "TARSGO ROBOT COLLECTION",
    description: "切换赛季，浏览 2026、2025 与 2024 三季共 30 张真实机器人定妆照。",
    image: "/assets/images/Robot/2026/hero-01-1440.webp",
    alt: "2026 赛季 1 号英雄机器人定妆照。",
  },
  "events-and-honors": {
    title: "赛事与荣誉",
    eyebrow: "EVENTS & HONORS",
    description: "以真实赛事记录和证书，回看团队在竞赛与创新实践中的阶段成果。",
    image: "/assets/images/ContestMoment/contest-moment-02.webp",
    alt: "吉甲大师团队赛事现场记录。",
  },
  "team-history": {
    title: "团队历程",
    eyebrow: "OUR JOURNEY",
    description: "从 2018 年到 2025 年，按年份回看团队真实历史资料。",
    image: "/assets/images/Milestone/2025-legacy.webp",
    alt: "团队历程中的 2025 年历史图片。",
  },
  join: {
    title: "加入吉甲",
    eyebrow: "JOIN TARSGO",
    description: "了解五个组别、团队培养方式，并从现有入口进入报名流程。",
    image: "/assets/images/Daily/daily-02.webp",
    alt: "队员围绕笔记本与模型进行日常讨论。",
  },
};

const topicPageByPath: Record<string, PublicPage> = {
  "/": "home",
  "/about": "about",
  "/robots": "robots",
  "/events-and-honors": "events-and-honors",
  "/team-history": "team-history",
  "/join": "join",
};

const legacyHomeHashDestinations: Record<string, string> = {
  "#about": "/about#about",
  "#achievements": "/team-history#achievements",
  "#robots": "/robots#robots",
  "#certificates": "/events-and-honors#certificates",
  "#join": "/join#join",
};

const homeNavigationModules = [
  {
    title: "认识吉甲",
    description: "从训练日常和团队文化，认识工程实践如何走进赛场。",
    href: "/about",
    image: "/assets/images/ContestMoment/contest-moment-04.webp",
    alt: "队员在比赛现场协作检查机器人。",
    placement: "home-visual-card--about",
  },
  {
    title: "机器人展示",
    description: "浏览五类机器人影像，了解真实的团队实践。",
    href: "/robots",
    image: "/assets/images/Robot/hero-robot.webp",
    alt: "吉甲大师英雄机器人实物。",
    placement: "home-visual-card--robots",
  },
  {
    title: "加入吉甲",
    description: "从机械、电控、视觉、AI 与运营五个方向找到入口。",
    href: "/join",
    image: "/assets/images/Daily/daily-02.webp",
    alt: "队员围绕笔记本和工程模型交流。",
    placement: "home-visual-card--join",
  },
  {
    title: "赛事与荣誉",
    description: "回看真实赛事记录，浏览 25 张荣誉证书原图。",
    href: "/events-and-honors",
    image: "/assets/images/ContestMoment/contest-moment-02.webp",
    alt: "吉甲大师团队赛事现场记录。",
    placement: "home-visual-card--events",
  },
  {
    title: "团队历程",
    description: "沿着 2018—2025 年真实资料，回看团队接力。",
    href: "/team-history",
    image: "/assets/images/Milestone/2025-legacy.webp",
    alt: "团队历程中的 2025 年历史影像。",
    placement: "home-visual-card--history",
  },
  {
    title: "低空微专业",
    description: "了解低空智能感知与控制的课程和实践内容。",
    href: "/micro-specialties/low-altitude-intelligent-sensing-control",
    image: "/assets/images/Robot/aerial-robots.webp",
    alt: "吉甲大师空中机器人。",
    placement: "home-visual-card--micro",
  },
];

const competitionHighlights = timelineMilestones.map((milestone) => ({
  year: milestone.year,
  items: milestone.highlights.filter((highlight) =>
    /(RoboMaster|ICRA|ICCV|挑战赛|对抗赛|联盟赛|国赛|赛区)/i.test(highlight),
  ),
})).filter((milestone) => milestone.items.length > 0);

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
  title?: string;
  description?: string;
}) {
  const color = "var(--color-accent-primary)";

  return (
    <div className="public-section-heading mx-auto mb-9 max-w-[1440px] sm:mb-12">
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

      <h2 className="mt-4 text-center text-[32px] font-semibold leading-tight tracking-[-0.03em] text-fg-primary sm:text-left sm:text-[40px]">
        {labelZh}
      </h2>

      {title ? (
        <h3 className="mt-3 text-center text-base font-medium text-fg-primary sm:text-left sm:text-lg">
          {title}
        </h3>
      ) : null}

      {description ? (
        <p className="mx-auto mt-4 max-w-[760px] text-center text-sm leading-6 text-fg-muted sm:mx-0 sm:text-left sm:text-[15px] sm:leading-7">
          {description}
        </p>
      ) : null}
    </div>
  );
}

type AboutImageTransition = {
  baseSrc: string;
  incomingSrc: string | null;
  sequence: number;
  ready: boolean;
};

function AboutImageReveal({ src, alt }: { src: string; alt: string }) {
  const id = useId().replace(/:/g, "");
  const filterId = `${id}-ink-filter`;
  const maskId = `${id}-ink-mask`;
  const [transition, setTransition] = useState<AboutImageTransition>(() => ({
    baseSrc: src,
    incomingSrc: null,
    sequence: 0,
    ready: false,
  }));

  useEffect(() => {
    setTransition((current) => {
      if (current.incomingSrc === src) return current;
      if (current.baseSrc === src) {
        if (!current.incomingSrc) return current;
        return {
          baseSrc: src,
          incomingSrc: null,
          sequence: current.sequence + 1,
          ready: false,
        };
      }

      const sequence = current.sequence + 1;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return { baseSrc: src, incomingSrc: null, sequence, ready: false };
      }

      return { ...current, incomingSrc: src, sequence, ready: false };
    });
  }, [src]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finishForReducedMotion = () => {
      if (!preference.matches) return;
      setTransition((current) =>
        current.incomingSrc
          ? {
              baseSrc: current.incomingSrc,
              incomingSrc: null,
              sequence: current.sequence + 1,
              ready: false,
            }
          : current,
      );
    };

    preference.addEventListener("change", finishForReducedMotion);
    return () =>
      preference.removeEventListener("change", finishForReducedMotion);
  }, []);

  function markIncomingImageReady(src: string, sequence: number) {
    setTransition((current) => {
      if (current.incomingSrc !== src || current.sequence !== sequence) {
        return current;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return {
          baseSrc: src,
          incomingSrc: null,
          sequence: sequence + 1,
          ready: false,
        };
      }
      return { ...current, ready: true };
    });
  }

  function finishIncomingImage(src: string, sequence: number) {
    setTransition((current) =>
      current.incomingSrc === src && current.sequence === sequence
        ? { baseSrc: src, incomingSrc: null, sequence, ready: false }
        : current,
    );
  }

  const incomingSrc = transition.incomingSrc;

  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-surface-card">
      <img
        src={transition.baseSrc}
        alt={incomingSrc ? "" : alt}
        aria-hidden={Boolean(incomingSrc)}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {incomingSrc ? (
        <>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <filter
                id={filterId}
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
              >
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="3.5"
                  numOctaves="2"
                  seed="7"
                  result="ink-noise"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="ink-noise"
                  scale="0.03"
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
                <feGaussianBlur stdDeviation="0.0025" />
              </filter>
              <mask
                id={maskId}
                maskUnits="objectBoundingBox"
                maskContentUnits="objectBoundingBox"
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
              >
                <circle
                  cx="0.5"
                  cy="0.5"
                  r="1.5"
                  fill="white"
                  filter={`url(#${filterId})`}
                  className={
                    transition.ready
                      ? "about-ink-blot about-ink-blot-active"
                      : "about-ink-blot"
                  }
                  onAnimationEnd={() =>
                    finishIncomingImage(incomingSrc, transition.sequence)
                  }
                />
              </mask>
            </defs>
          </svg>
          <img
            key={transition.sequence}
            src={incomingSrc}
            alt={alt}
            loading="eager"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              maskImage: `url(#${maskId})`,
              WebkitMaskImage: `url(#${maskId})`,
            }}
            onLoad={() =>
              markIncomingImageReady(incomingSrc, transition.sequence)
            }
          />
        </>
      ) : null}
    </div>
  );
}

function HomeVisualNavigation() {
  return (
    <section
      id="home-navigation"
      aria-labelledby="home-navigation-heading"
      className="border-t border-white/[0.06] py-14 sm:py-16 lg:py-20"
    >
      <div className="public-home-container">
        <div className="mx-auto mb-8 max-w-3xl sm:mb-10 lg:mx-0">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-primary sm:text-left">
            探索 TARSGO
          </p>
          <h2
            id="home-navigation-heading"
            className="text-center text-3xl font-semibold tracking-[-0.035em] text-fg-primary sm:text-left sm:text-4xl"
          >
            走进吉甲的工程现场
          </h2>
          <p className="mt-3 text-center text-sm leading-6 text-fg-muted sm:text-left sm:text-base">
            从团队、机器人、赛事到成长路径，选择一个入口继续了解。
          </p>
        </div>

        <nav aria-label="吉甲专题导航" className="home-visual-grid">
          {homeNavigationModules.map((module) => (
            <Link
              key={module.href}
              to={module.href}
              className={`home-visual-card ${module.placement}`}
              aria-label={`${module.title}：${module.description}`}
            >
              <img
                src={module.image}
                alt={module.alt}
                loading="lazy"
                decoding="async"
              />
              <span className="home-visual-card-shade" aria-hidden="true" />
              <div className="home-visual-card-copy">
                <h3>{module.title}</h3>
                <p>{module.description}</p>
              </div>
              <svg
                className="home-visual-card-arrow"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}

function HomeSponsorSection() {
  return (
    <section
      className="home-sponsors border-t border-white/[0.06] py-12 sm:py-14 lg:py-16"
      aria-labelledby="home-sponsors-heading"
    >
      <div className="public-home-container">
        <div className="mb-7 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-primary">PARTNERS</p>
            <h2 id="home-sponsors-heading" className="mt-2 text-2xl font-semibold tracking-tight text-fg-primary sm:text-3xl">
              赞助商与合作伙伴
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-fg-muted">
            感谢所有支持吉甲大师团队建设与实践的合作伙伴。
          </p>
        </div>

        <ul className="home-sponsor-grid" aria-label="现有赞助商">
          {sponsorLogos.map((sponsor) => (
            <li key={sponsor.name} className="home-sponsor-logo">
              <img src={sponsor.image} alt={sponsor.name} loading="lazy" decoding="async" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PublicFooter() {
  return (
    <footer className="public-site-footer border-t border-white/[0.08] py-9 sm:py-11">
      <div className="public-home-container">
        <div className="grid gap-8 border-b border-white/[0.08] pb-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          <section aria-labelledby="footer-social-heading">
            <Link to="/" aria-label="TARSGO 首页" className="inline-flex focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary">
              <SiteLogo className="h-11 max-w-[200px]" />
            </Link>
            <h2 id="footer-social-heading" className="mt-5 text-sm font-semibold text-fg-primary">社交媒体</h2>
            <nav aria-label="官方社交账号" className="mt-3 flex flex-wrap gap-2">
              <a
                href="https://www.douyin.com/user/MS4wLjABAAAAZJcCtp6uwKt4wKUwa_STi1GadztAmwBwHKN0jjjDj2MNjgOclLsim387ZDtRPjvW"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-link"
              >
                <DouyinIcon />
                抖音
              </a>
              <a
                href="https://space.bilibili.com/488284486"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-link"
              >
                <BilibiliIcon />
                B站
              </a>
            </nav>
          </section>

          <nav aria-labelledby="footer-about-heading" className="flex flex-col items-start gap-2">
            <h2 id="footer-about-heading" className="mb-1 text-sm font-semibold text-fg-primary">关于吉甲</h2>
            <Link className="footer-link" to="/about">认识吉甲</Link>
            <Link className="footer-link" to="/team-history">团队历程</Link>
          </nav>

          <nav aria-labelledby="footer-quick-links-heading" className="flex flex-col items-start gap-2">
            <h2 id="footer-quick-links-heading" className="mb-1 text-sm font-semibold text-fg-primary">快速入口</h2>
            <Link className="footer-link" to="/robots">机器人展示</Link>
            <Link className="footer-link" to="/events-and-honors">赛事与荣誉</Link>
            <Link className="footer-link" to="/join">加入我们</Link>
            <Link className="footer-link" to="/micro-specialties/low-altitude-intelligent-sensing-control">低空微专业</Link>
          </nav>

          <section aria-labelledby="footer-contact-heading">
            <h2 id="footer-contact-heading" className="mb-3 text-sm font-semibold text-fg-primary">联系方式</h2>
            <p className="text-sm leading-6 text-fg-muted">吉林大学吉甲大师双创基地</p>
            <p className="mt-2 text-sm leading-6 text-fg-muted">请通过官方社交账号联系团队。</p>
          </section>
        </div>

        <p className="pt-5 text-xs text-fg-dim">
          &copy; {new Date().getFullYear()} TARSGO 战队 · 吉林大学吉甲大师双创基地
        </p>
      </div>
    </footer>
  );
}

function getNavbarUser(): AuthUser | null | undefined {
  return getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : undefined);
}

export default function Home({ page = "home" }: { page?: PublicPage }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routePage = topicPageByPath[location.pathname] ?? page;
  const legacyDestination = location.pathname === "/"
    ? legacyHomeHashDestinations[location.hash]
    : undefined;
  const [activeAboutModuleIndex, setActiveAboutModuleIndex] = useState(0);
  const [activeTimelineYear, setActiveTimelineYear] = useState(timelineMilestones[0].year);
  const [showAllCertificates, setShowAllCertificates] = useState(false);
  const [selectedCertificateIndex, setSelectedCertificateIndex] = useState<number | null>(null);
  const certificateDialogRef = useRef<HTMLDialogElement>(null);
  const timelineWindowRef = useRef<HTMLDivElement | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(getNavbarUser);
  const [authError, setAuthError] = useState(false);
  const topic = routePage === "home" ? null : topicPages[routePage];
  const activeAboutModule = aboutModules[activeAboutModuleIndex];
  const selectedCertificate = selectedCertificateIndex === null
    ? null
    : achievementCertificates[selectedCertificateIndex];
  const visibleCertificates = showAllCertificates
    ? achievementCertificates
    : achievementCertificates.slice(0, 6);

  useEffect(() => {
    if (legacyDestination) {
      navigate(legacyDestination, { replace: true });
    }
  }, [legacyDestination, navigate]);

  useEffect(() => {
    const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(reducedMotionPreference.matches);
    reducedMotionPreference.addEventListener("change", updatePreference);
    return () => reducedMotionPreference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) heroVideoRef.current?.pause();
  }, [prefersReducedMotion]);

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

  function openCertificate(index: number) {
    setSelectedCertificateIndex(index);
    certificateDialogRef.current?.showModal();
  }

  function moveCertificatePreview(direction: -1 | 1) {
    setSelectedCertificateIndex((current) => {
      if (current === null) return current;
      return (current + direction + achievementCertificates.length) % achievementCertificates.length;
    });
  }

  function scrollToTimelineYear(year: string) {
    const timelineWindow = timelineWindowRef.current;
    const milestone = timelineWindow?.querySelector<HTMLElement>(`[data-timeline-year="${year}"]`);
    if (!timelineWindow || !milestone) return;

    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    setActiveTimelineYear(year);

    if (window.matchMedia("(min-width: 1024px)").matches) {
      const offset = milestone.getBoundingClientRect().top - timelineWindow.getBoundingClientRect().top;
      timelineWindow.scrollTo({
        top: Math.max(0, timelineWindow.scrollTop + offset - 12),
        behavior,
      });
      return;
    }

    milestone.scrollIntoView({ behavior, block: "start" });
  }

  return (
    <div className="public-home relative min-h-screen overflow-hidden bg-surface-primary text-fg-primary">
      <div className="relative z-10">
      {routePage === "home" ? (
      <section
        id="hero"
        className="public-home-hero relative min-h-[88svh] overflow-hidden bg-black sm:min-h-[92svh]"
      >
        <div className="absolute inset-0">
          <video
            ref={heroVideoRef}
            className="h-full w-full object-cover"
            autoPlay={!prefersReducedMotion}
            muted
            loop
            playsInline
            preload={prefersReducedMotion ? "none" : "metadata"}
            poster="/assets/images/Robot/hero-robot.webp"
            aria-label="吉林大学吉甲大师双创基地宣传视频"
          >
            <source src="/assets/images/Video/hero-showreel.mp4" type="video/mp4" />
          </video>
          <div className="public-home-hero-shade absolute inset-0" />
        </div>

        <div className="relative z-10 flex min-h-[88svh] items-center sm:min-h-[92svh]">
          <div className="public-home-container mx-auto flex w-full items-center pb-20 pt-28 sm:pt-32">
            <div className="flex max-w-2xl flex-col items-center gap-4 text-center sm:items-start sm:text-left">
              <img
                src="/assets/images/Logo/tarsgo-logo-v5.svg"
                alt="TARSGO"
                className="h-20 w-auto max-w-full object-contain sm:h-24"
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--hero-accent)] sm:text-xs">
                吉林大学 · RoboMaster 战队
              </p>
              <h1 className="max-w-2xl text-[42px] font-semibold leading-[1.1] tracking-[-0.045em] text-white sm:text-6xl lg:text-[72px]">
                有秩序的<span className="text-[var(--hero-accent)]">创造力</span>
              </h1>
              <p className="max-w-lg text-sm leading-6 text-white/78 sm:text-base sm:leading-7">
                以 RoboMaster 竞赛为牵引，持续投入机器人研发与团队协作。
              </p>
              <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link
                  to="/about"
                  className="motion-button inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent-primary px-6 py-3 text-sm font-semibold text-fg-inverse transition-colors hover:bg-[var(--admin-accent-bright)] sm:px-7"
                >
                  了解吉甲
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
                <Link
                  to="/join"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/35 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:px-7"
                >
                  加入我们
                </Link>
              </div>
            </div>
          </div>
        </div>

      </section>
      ) : routePage === "join" ? null : (
        <section className={"public-topic-hero relative isolate overflow-hidden " + (routePage === "robots" ? "public-topic-hero--robots" : "")}>
          <img
            src={topic?.image}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="public-topic-hero-shade absolute inset-0" />
          <div className="public-home-container relative z-10 flex min-h-[26rem] items-end pb-12 pt-32 sm:min-h-[32rem] sm:pb-16 lg:min-h-[38rem]">
            <div className="max-w-3xl">
              <Link to="/" className="mb-8 inline-flex min-h-11 items-center text-sm font-medium text-white/80 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                ← 返回首页
              </Link>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--hero-accent)] sm:text-sm">{topic?.eyebrow}</p>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-7xl">{topic?.title}</h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/80 sm:text-base sm:leading-8">{topic?.description}</p>
            </div>
          </div>
        </section>
      )}

      <Navbar currentUser={currentUser} authError={authError} />

      {routePage === "home" ? <HomeVisualNavigation /> : null}

      {routePage === "events-and-honors" ? (
        <section id="competition-records" className="border-t border-white/[0.06] py-16 sm:py-20">
          <div className="public-home-container">
            <SectionHeading index="01" total="02" labelZh="赛事记录" labelEn="COMPETITION RECORDS" title="来自团队历程的真实赛事节点" description="以下记录整理自各届团队历程，不合并不同赛事或批次。完整年度资料可在团队历程页查看。" />
            <ol className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
              {competitionHighlights.map((record) => (
                <li key={record.year} className="border-t border-white/12 py-5">
                  <p className="font-mono text-xl font-semibold text-accent-primary">{record.year}</p>
                  <ul className="mt-3 space-y-2">
                    {record.items.map((item) => <li key={item} className="text-sm leading-6 text-fg-muted">{item}</li>)}
                  </ul>
                </li>
              ))}
            </ol>
            <Link to="/team-history" className="mt-6 inline-flex min-h-11 items-center gap-2 border-b border-accent-primary/60 pb-1 text-sm font-semibold text-accent-primary hover:border-accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary">查看完整团队历程 <span aria-hidden>→</span></Link>
          </div>
        </section>
      ) : null}

      {/* About Section */}
      {routePage === "about" && (
      <section
        id="about"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="public-home-container">
          <SectionHeading
            index="01"
            total="05"
            labelZh="关于我们"
            labelEn="ABOUT US"
            title="从赛场到日常，记录工程如何落地"
            description="五组真实影像，串起参赛、备赛、日常训练与项目实践。"
          />

          <div className="grid grid-cols-2 gap-y-5 border-y border-white/10 py-5 sm:grid-cols-4 sm:gap-y-0">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={`flex items-baseline gap-2 sm:gap-3 ${index > 0 ? "sm:border-l sm:border-white/10 sm:pl-6" : ""}`}
              >
                <span className="font-mono text-xl font-semibold tracking-tight text-fg-primary sm:text-3xl">
                  {stat.value}
                </span>
                <span className="text-xs font-medium text-fg-muted sm:text-sm">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          <section className="team-composition" aria-labelledby="team-composition-heading">
            <div className="team-composition__identity">
              <p id="team-composition-heading" className="mb-3 text-xs font-semibold tracking-[0.16em] text-accent-primary">团队组成</p>
              <SiteLogo className="h-9 max-w-[170px]" />
              <p className="mt-3 text-xs leading-5 text-fg-muted sm:text-sm">吉林大学吉甲大师双创基地</p>
            </div>
            <ul className="team-composition__groups" aria-label="五个专业组别">
              {groups.map((group) => (
                <li key={group.name} className="team-composition__group">
                  <TeamGroupMark group={group} className="team-composition__mark" />
                  <span>{group.name}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-10">
            <div
              role="group"
              aria-label="团队实践分类"
              className="flex overflow-x-auto border-b border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {aboutModules.map((module, index) => {
                const isActive = index === activeAboutModuleIndex;
                return (
                  <button
                    key={module.name}
                    type="button"
                    onClick={() => setActiveAboutModuleIndex(index)}
                    className={`inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-1.5 text-xs transition-colors sm:gap-2 sm:px-5 sm:text-sm ${
                      isActive
                        ? "border-accent-primary text-fg-primary"
                        : "border-transparent text-fg-muted hover:text-fg-primary"
                    }`}
                    aria-pressed={isActive}
                  >
                    <span className="font-mono text-[10px] text-accent-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-medium">{module.name}</span>
                  </button>
                );
              })}
            </div>

            <article className="mt-6 grid overflow-hidden lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)]">
              <figure>
                <AboutImageReveal
                  src={activeAboutModule.image}
                  alt={activeAboutModule.imageAlt}
                />
              </figure>
              <div className="flex flex-col justify-center border-t border-white/10 py-6 lg:border-l lg:border-t-0 lg:px-8 xl:px-12">
                <span className="font-mono text-xs tracking-[0.16em] text-accent-primary">
                  {String(activeAboutModuleIndex + 1).padStart(2, "0")} / {String(aboutModules.length).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-fg-primary sm:text-3xl">
                  {activeAboutModule.title}
                </h3>
                <p className="mt-4 max-w-md text-sm leading-7 text-fg-muted sm:text-[15px]">
                  {activeAboutModule.description}
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
      )}

      {/* Achievements Section */}
      {routePage === "team-history" && (
      <section
        id="achievements"
        className="relative overflow-hidden border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="public-home-container">
          <SectionHeading
            index="02"
            total="05"
            labelZh="团队历程"
            labelEn="OUR JOURNEY"
            title="以时间轴回看战队一路走来的每一步"
            description="从双创基地组建，到国际赛事历练，再到 RoboMaster 国赛突破，吉林大学吉甲大师双创基地在一届又一届成员的接力中不断完成技术积累、组织建设与文化沉淀。"
          />

          <div className="team-timeline mx-auto">
            <nav aria-label="按年份定位团队历程" className="team-timeline-years">
              {timelineMilestones.map((item) => (
                <button
                  key={item.year}
                  type="button"
                  aria-label={`跳转到${item.year}年：${item.title}`}
                  aria-pressed={activeTimelineYear === item.year}
                  onClick={() => scrollToTimelineYear(item.year)}
                  className="team-timeline-year"
                >
                  {item.year}
                </button>
              ))}
            </nav>

            <p id="team-timeline-scroll-help" className="team-timeline-help">
              <span className="team-timeline-help--desktop">滚轮、触控板或聚焦后使用方向键与 Page Up／Down 滚动</span>
              <span className="team-timeline-help--natural">完整历程随页面自然展开，可直接滚动浏览</span>
            </p>

            <div
              ref={timelineWindowRef}
              className="team-timeline-window"
              role="region"
              aria-label="团队历程内容，2018 至 2025 年"
              aria-describedby="team-timeline-scroll-help"
              tabIndex={0}
            >
              <ol className="team-timeline-list ml-2 border-l border-white/15 pl-6 sm:ml-8 sm:pl-10">
                {timelineMilestones.map((item) => {
                  const isFeatured = item.year === "2018" || item.year === "2024";

                  return (
                    <li
                      key={item.year}
                      id={`team-milestone-${item.year}`}
                      data-timeline-year={item.year}
                      className="team-timeline-milestone relative border-b border-white/10 py-8 first:pt-2 last:border-b-0 sm:py-10 lg:py-12"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -left-[29px] top-[2.15rem] h-2.5 w-2.5 rounded-full border border-accent-primary bg-surface-primary sm:-left-[45px] sm:top-[2.65rem]"
                      />
                      <article
                        className="team-timeline-entry grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(7rem,0.45fr)_minmax(0,1.2fr)_minmax(18rem,1fr)] lg:items-start"
                      >
                        <div className="flex items-baseline gap-4 lg:block">
                          <p
                            className={"font-mono leading-none tracking-[-0.08em] " + (
                              isFeatured
                                ? "text-5xl font-medium text-accent-primary sm:text-6xl lg:text-[5.5rem]"
                                : "text-4xl font-normal text-accent-primary/75 sm:text-5xl lg:text-[3.5rem]"
                            )}
                          >
                            {item.year}
                          </p>
                          <h3
                            className={"font-semibold text-fg-primary " + (
                              isFeatured
                                ? "text-xl sm:text-2xl lg:mt-4"
                                : "text-lg sm:text-xl lg:mt-3"
                            )}
                          >
                            {item.title}
                          </h3>
                        </div>

                        <div>
                          <p
                            className={"leading-7 text-fg-muted " + (
                              isFeatured
                                ? "text-sm sm:text-base"
                                : "text-sm sm:text-[15px]"
                            )}
                          >
                            {item.intro}
                          </p>
                          <ul className="mt-4 space-y-2.5">
                            {item.highlights.map((highlight) => (
                              <li
                                key={highlight}
                                className="grid grid-cols-[8px_minmax(0,1fr)] items-start gap-3 text-sm leading-6 text-fg-muted sm:text-[15px]"
                              >
                                <span
                                  aria-hidden="true"
                                  className="mt-[0.65rem] h-1.5 w-1.5 rounded-full bg-accent-primary/75"
                                />
                                <span>{highlight}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div
                          className={
                            "grid items-start gap-3 " +
                            (item.images.length > 1 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-1" : "")
                          }
                        >
                          {item.images.map((image, index) => (
                            <figure
                              key={image.src}
                              className="team-timeline-image overflow-hidden bg-surface-card"
                            >
                              <img
                                src={image.src}
                                alt={item.year + "年" + item.title + "历史图片" + (index + 1)}
                                width={image.width}
                                height={image.height}
                                loading="lazy"
                                decoding="async"
                                className={"block h-full w-full object-center " + (image.fit === "contain" ? "object-contain" : "object-cover")}
                              />
                            </figure>
                          ))}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Robot Showcase Section */}
      {routePage === "robots" && (
      <section
        id="robots"
        className="border-t border-white/[0.06] bg-transparent py-8 sm:py-10 lg:py-12"
      >
        <div className="public-home-container">
          <RobotPhotoGallery />
        </div>
      </section>
      )}

      {/* Achievement Certificates Section */}
      {routePage === "events-and-honors" && (
      <section
        id="certificates"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="public-home-container">
          <SectionHeading
            index="04"
            total="05"
            labelZh="成就展示"
            labelEn="ACHIEVEMENTS"
            title="把一路走来的成果，留在真实记录里"
            description="团队在创新创业、学科竞赛与 RoboMaster 实践中积累的阶段性荣誉。"
          />

          <div
            id="achievement-certificate-grid"
            className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {visibleCertificates.map((image, index) => {
              const number = String(index + 1).padStart(2, "0");

              return (
                <article
                  key={image}
                  className="min-w-0"
                >
                  <button
                    type="button"
                    onClick={() => openCertificate(index)}
                    aria-label={"第" + number + "张团队荣誉证书，查看原图"}
                    aria-haspopup="dialog"
                    className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary"
                  >
                    <span className="certificate-thumbnail relative block aspect-[4/3] overflow-hidden bg-[#f4f2ed]">
                      <img
                        src={image}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-contain"
                      />
                    </span>
                    <span className="mt-2 flex items-baseline justify-between gap-3 border-b border-white/10 pb-2">
                      <span className="font-mono text-xs tracking-[0.14em] text-accent-primary">
                        {number}
                      </span>
                      <span className="text-xs text-fg-dim transition-colors group-hover:text-fg-primary">
                        查看原图
                      </span>
                    </span>
                  </button>
                </article>
              );
            })}
          </div>

          <div className="certificate-gallery-controls mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm text-fg-muted" aria-live="polite">
              {showAllCertificates
                ? `已展示全部 ${achievementCertificates.length} 项荣誉`
                : `精选展示 6 项，共 ${achievementCertificates.length} 项荣誉`}
            </p>
            <button
              type="button"
              aria-expanded={showAllCertificates}
              aria-controls="achievement-certificate-grid"
              onClick={() => setShowAllCertificates((expanded) => !expanded)}
              className="inline-flex min-h-11 items-center justify-center border border-accent-primary/50 px-5 text-sm font-semibold text-accent-primary transition-colors hover:border-accent-primary hover:bg-accent-primary/8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary"
            >
              {showAllCertificates ? "收起荣誉" : "查看全部荣誉"}
            </button>
          </div>

          <dialog
            ref={certificateDialogRef}
            aria-label="团队荣誉证书预览"
            onClose={() => setSelectedCertificateIndex(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveCertificatePreview(-1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                moveCertificatePreview(1);
              } else if (event.key === "Home") {
                event.preventDefault();
                setSelectedCertificateIndex(0);
              } else if (event.key === "End") {
                event.preventDefault();
                setSelectedCertificateIndex(achievementCertificates.length - 1);
              }
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                certificateDialogRef.current?.close();
              }
            }}
            className="certificate-preview-dialog m-auto max-h-[92dvh] w-[min(94vw,76rem)] max-w-none overflow-visible border-0 bg-transparent p-0 text-white backdrop:bg-black/90"
          >
            {selectedCertificate !== null && selectedCertificateIndex !== null ? (
              <div className="certificate-preview-content mx-auto flex max-h-[92dvh] max-w-full flex-col items-center gap-3">
                <div className="flex w-full items-center justify-between gap-4">
                  <h2 className="text-sm font-medium text-white/85">
                    团队荣誉 {String(selectedCertificateIndex + 1).padStart(2, "0")} / {String(achievementCertificates.length).padStart(2, "0")}
                  </h2>
                  <button
                    type="button"
                    onClick={() => certificateDialogRef.current?.close()}
                    aria-label="关闭证书预览"
                    className="flex min-h-11 min-w-11 items-center justify-center border border-white/25 bg-black/55 px-3 text-sm text-white hover:border-accent-primary focus-visible:outline-2 focus-visible:outline-accent-primary"
                  >
                    关闭
                  </button>
                </div>
                <img
                  src={selectedCertificate}
                  alt={`第${selectedCertificateIndex + 1}张团队荣誉证书原图`}
                  className="certificate-preview-image w-auto max-w-full object-contain"
                />
                <div className="certificate-preview-controls flex w-full items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => moveCertificatePreview(-1)}
                    aria-label="查看上一张证书（键盘左方向键）"
                    className="min-h-11 min-w-11 border border-white/25 bg-black/55 px-4 text-sm text-white hover:border-accent-primary focus-visible:outline-2 focus-visible:outline-accent-primary"
                  >
                    上一张
                  </button>
                  <span className="text-sm text-white/80" aria-live="polite">
                    {String(selectedCertificateIndex + 1).padStart(2, "0")} / {String(achievementCertificates.length).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveCertificatePreview(1)}
                    aria-label="查看下一张证书（键盘右方向键）"
                    className="min-h-11 min-w-11 border border-white/25 bg-black/55 px-4 text-sm text-white hover:border-accent-primary focus-visible:outline-2 focus-visible:outline-accent-primary"
                  >
                    下一张
                  </button>
                </div>
              </div>
            ) : null}
          </dialog>
        </div>
      </section>
      )}

      {routePage === "join" ? <JoinExperience groups={groups} /> : null}

      {/* Footer */}
      {routePage === "home" ? <HomeSponsorSection /> : null}
      <PublicFooter />
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
