import type { Route } from "./+types/home";
import { useEffect, useId, useState } from "react";
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
        "吉林大学 TARS-Go 战队官网：以 RoboMaster 竞赛为牵引，持续开展机器人研发与团队协作。",
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
    image: "/assets/images/Robot/hero-robot.webp",
  },
  {
    name: "步兵机器人",
    image: "/assets/images/Robot/infantry-robot.webp",
  },
  {
    name: "工程机器人",
    image: "/assets/images/Robot/engineering-robot.webp",
  },
  {
    name: "哨兵机器人",
    image: "/assets/images/Robot/sentinel-robot.webp",
  },
  {
    name: "空中机器人",
    image: "/assets/images/Robot/aerial-robots.webp",
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
  const color = "#D0AD69";

  return (
    <div className="public-section-heading mx-auto mb-8 max-w-[1440px] sm:mb-10">
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

      {title ? (
        <h3 className="mt-2 text-center text-base font-medium text-fg-primary sm:text-left sm:text-lg">
          {title}
        </h3>
      ) : null}

      {description ? (
        <p className="mx-auto mt-3 max-w-[760px] text-center text-sm leading-6 text-fg-muted sm:mx-0 sm:text-left sm:text-[15px] sm:leading-7">
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
    <div className="relative aspect-[4/3] overflow-hidden bg-[#171b1a] md:aspect-auto md:min-h-[420px]">
      <img
        src={transition.baseSrc}
        alt={incomingSrc ? "" : alt}
        aria-hidden={Boolean(incomingSrc)}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {incomingSrc ? (
        <svg
          key={transition.sequence}
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label={alt}
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <filter
              id={filterId}
              x="-12%"
              y="-12%"
              width="124%"
              height="124%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.035"
                numOctaves="2"
                seed="7"
                result="ink-noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="ink-noise"
                scale="3"
                xChannelSelector="R"
                yChannelSelector="G"
              />
              <feGaussianBlur stdDeviation="0.25" />
            </filter>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="100"
              height="100"
            >
              <rect width="100" height="100" fill="black" />
              <g filter={`url(#${filterId})`}>
                <circle
                  cx="50"
                  cy="50"
                  r="88"
                  fill="white"
                  className={
                    transition.ready ? "about-ink-blot about-ink-blot-active" : "about-ink-blot"
                  }
                  onAnimationEnd={() =>
                    finishIncomingImage(incomingSrc, transition.sequence)
                  }
                />
              </g>
            </mask>
          </defs>
          <image
            href={incomingSrc}
            x="0"
            y="0"
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid slice"
            mask={`url(#${maskId})`}
            onLoad={() =>
              markIncomingImageReady(incomingSrc, transition.sequence)
            }
          />
        </svg>
      ) : null}
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e0c790] sm:text-xs">
                吉林大学 · RoboMaster 战队
              </p>
              <h1 className="max-w-2xl text-[42px] font-semibold leading-[1.1] tracking-[-0.045em] text-white sm:text-6xl lg:text-[72px]">
                有秩序的<span className="text-[#dfbd7c]">创造力</span>
              </h1>
              <p className="max-w-lg text-sm leading-6 text-white/78 sm:text-base sm:leading-7">
                以 RoboMaster 竞赛为牵引，持续投入机器人研发与团队协作。
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
                        ? "border-[#D0AD69] text-fg-primary"
                        : "border-transparent text-fg-muted hover:text-fg-primary"
                    }`}
                    aria-pressed={isActive}
                  >
                    <span className="font-mono text-[10px] text-[#D0AD69]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-medium">{module.name}</span>
                  </button>
                );
              })}
            </div>

            <article className="mt-6 grid overflow-hidden md:grid-cols-[1.28fr_0.72fr]">
              <figure>
                <AboutImageReveal
                  src={activeAboutModule.image}
                  alt={activeAboutModule.imageAlt}
                />
              </figure>
              <div className="flex flex-col justify-center border-t border-white/10 py-6 md:border-l md:border-t-0 md:px-8 lg:px-12">
                <span className="font-mono text-xs tracking-[0.16em] text-[#D0AD69]">
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
          />

          <div className="grid gap-7 lg:grid-cols-[1.3fr_0.7fr] lg:gap-10">
            <figure className="overflow-hidden bg-[#171b1a]">
              <div className="relative aspect-[4/3] min-h-[320px] overflow-hidden bg-[#171b1a] sm:min-h-[420px] lg:min-h-0">
                <img
                  src={robots[0].image}
                  alt={robots[0].name}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-contain object-center"
                />
              </div>
              <figcaption className="flex items-center justify-between gap-4 border-t border-white/10 px-5 py-4 sm:px-7">
                <span className="font-mono text-xs tracking-[0.14em] text-[#D0AD69]">
                  01 / 主展示
                </span>
                <h3 className="text-lg font-semibold text-fg-primary sm:text-xl">
                  {robots[0].name}
                </h3>
              </figcaption>
            </figure>

            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-1 lg:gap-0">
              {robots.slice(1).map((robot, index) => (
                <article
                  key={robot.name}
                  className="min-w-0 lg:grid lg:grid-cols-[120px_1fr] lg:items-center lg:gap-4 lg:border-b lg:border-white/10 lg:py-3.5"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-[#171b1a] lg:aspect-[5/3]">
                    <img
                      src={robot.image}
                      alt={robot.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2 lg:mt-0">
                    <span className="font-mono text-[10px] text-[#D0AD69]">
                      {String(index + 2).padStart(2, "0")}
                    </span>
                    <h3 className="text-sm font-semibold text-fg-primary sm:text-base">
                      {robot.name}
                    </h3>
                  </div>
                </article>
              ))}
            </div>
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
