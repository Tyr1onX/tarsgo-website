import type { Route } from "./+types/home";
import { useEffect, useRef, useState } from "react";
import { Navbar } from "../components/navbar";
import { HomeVisualNavigation } from "../components/home-visual-navigation";
import { PublicFooter } from "../components/public-footer";
import { Link, useLocation, useNavigate } from "react-router";

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

const sponsorLogos = [
  { name: "YELITE", image: "/assets/images/Sponsors/yelite-9c169cab.webp" },
  { name: "长春纳丝精密机械有限公司", image: "/assets/images/Sponsors/nasi-precision.svg", caption: "长春纳丝\n精密机械" },
  { name: "AMASS", image: "/assets/images/Sponsors/amass-28a9de74.webp" },
  { name: "创芯工坊", image: "/assets/images/Sponsors/cxgf-1215c6ef.webp" },
  { name: "吉地智联", image: "/assets/images/Sponsors/jdzl-f2d699c5.webp" },
  { name: "嘉立创CNC", image: "/assets/images/Sponsors/jlc-5f293e37.webp" },
  { name: "纪元羽毛球", image: "/assets/images/Sponsors/jyymq-68f0db5c.webp" },
  { name: "快趣科技", image: "/assets/images/Sponsors/kqkj-465ae088.webp" },
  { name: "留形科技", image: "/assets/images/Sponsors/lxkj-967e1eaa.webp" },
  { name: "千将资本", image: "/assets/images/Sponsors/qjzb-4f9273c4.webp" },
  { name: "YUHESEN", image: "/assets/images/Sponsors/yeheshen-c30a1363.webp" },
];

export const groups = [
  {
    name: "机械组",
    aboutSummary: "设计结构、建模加工，把方案做成实物。",
    description: "负责机器人结构设计、建模、加工与装配，将创意变为现实",
    directions: ["结构设计", "建模", "加工与装配"],
    contribution: "把机器人需求转成可制造、可装配的结构与机构。",
    collaboration: "与电控对齐安装、走线和空间接口，并随整机联调迭代。",
    logoBlack: "/assets/images/Groups/mechanical-black.svg",
    logoWhite: "/assets/images/Groups/mechanical-white.svg",
    logoStructure: "/assets/images/Groups/mechanical-structure.svg",
  },
  {
    name: "电控组",
    aboutSummary: "电路、嵌入式与电机控制。",
    description: "嵌入式系统开发、电路设计、电机控制，让机器人\u201C动\u201D起来",
    directions: ["嵌入式系统开发", "电路设计", "电机控制"],
    contribution: "连接传感器、控制器与执行机构，让机器人按系统要求运行。",
    collaboration: "与机械确认器件和布线接口，与视觉、AI 联调数据和控制链路。",
    logoBlack: "/assets/images/Groups/electrical-control-black.svg",
    logoWhite: "/assets/images/Groups/electrical-control-white.svg",
    logoStructure: "/assets/images/Groups/electrical-control-structure.svg",
  },
  {
    name: "视觉组",
    aboutSummary: "机器视觉与目标识别。",
    description: "机器视觉、目标识别、自动瞄准，赋予机器人\u201C眼睛\u201D",
    directions: ["机器视觉", "目标识别", "自动瞄准"],
    contribution: "从图像与传感信息中提取目标和环境线索。",
    collaboration: "与电控、AI 和机器人系统联调感知信息的输入、处理与使用。",
    logoBlack: "/assets/images/Groups/vision-black.svg",
    logoWhite: "/assets/images/Groups/vision-white.svg",
    logoStructure: "/assets/images/Groups/vision-structure.svg",
  },
  {
    name: "AI组",
    aboutSummary: "算法、决策与自主控制。",
    description: "负责智能算法、决策规划与自主控制，让机器人拥有更强的判断力",
    directions: ["智能算法", "决策规划", "自主控制"],
    contribution: "把感知信息和机器人状态转化为算法判断与行动策略。",
    collaboration: "与视觉、电控和整机团队一起验证算法在机器人上的实际表现。",
    logoBlack: "/assets/images/Groups/ai-black.svg",
    logoWhite: "/assets/images/Groups/ai-white.svg",
    logoStructure: "/assets/images/Groups/ai-structure.svg",
  },
  {
    name: "运营组",
    aboutSummary: "组织协作、协调资源、记录成果。",
    description: "围绕团队运行识别需求、拆解任务、协调资源、跟进交付，并整理发布与复盘材料。",
    directions: ["组织协调", "活动与赛事运营", "资源支持", "记录与传承"],
    contribution: "让跨组工作有协同、有结果，成果也能被找到和继续使用。",
    collaboration: "贯穿技术研发、赛事和项目活动；技术判断与设备状态由技术组负责。",
    logoBlack: "/assets/images/Groups/operations-black.svg",
    logoWhite: "/assets/images/Groups/operations-white.svg",
    logoStructure: "/assets/images/Groups/operations-structure.svg",
  },
];

export type PublicPage = "home" | "about" | "robots" | "events-and-honors" | "team-history" | "join";

const topicPages: Record<Exclude<PublicPage, "home">, { title: string; eyebrow?: string; description?: string; image: string; alt: string }> = {
  about: {
    title: "认识吉甲",
    eyebrow: "TARS-GO · SINCE 2018",
    description: "2018 年底，TARS-Go 在吉林大学组队。名字取自《星际穿越》中的机器人 TARS。",
    image: "/assets/images/ContestMoment/contest-moment-04.webp",
    alt: "队员在 RoboMaster 比赛现场共同检查机器人。",
  },
  robots: {
    title: "2026 / 2025 / 2024 赛季机器人阵容",
    eyebrow: "TARSGO ROBOT COLLECTION",
    image: "/assets/images/Robot/2026/hero-01-1440.webp",
    alt: "2026 赛季 1 号英雄机器人定妆照。",
  },
  "events-and-honors": {
    title: "赛事与荣誉",
    description: "回看吉甲大师在比赛与创新实践中留下的关键成果。",
    image: "/assets/images/ContestMoment/contest-moment-02.webp",
    alt: "吉甲大师团队赛事现场记录。",
  },
  "team-history": {
    title: "团队历程",
    eyebrow: "OUR JOURNEY",
    description: "查看 2018 至 2026 年 TARS-Go 战队与吉甲大师实践平台的历史事件、真实照片和资料来源。",
    image: "/assets/images/Milestone/2019-breakthrough.webp",
    alt: "TARS-Go 队员在 2019 ICRA RoboMaster 人工智能挑战赛现场。",
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

function HomeArrowIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg>;
}

function HomeSponsorSection() {
  return (
    <section
      className="home-sponsors border-t border-[var(--theme-border-subtle)] py-8 sm:py-10"
      aria-labelledby="home-sponsors-heading"
    >
      <div className="public-home-container">
        <h2 id="home-sponsors-heading" className="mb-5 text-xl font-semibold tracking-tight text-fg-primary sm:mb-6 sm:text-2xl">
          合作与支持
        </h2>

        <div className="home-sponsor-matrix" role="group" aria-label="现有赞助商">
          <div className="home-sponsor-primary">
            <img src="/assets/images/Sponsors/dji.svg" alt="DJI 大疆创新" loading="lazy" decoding="async" />
          </div>
          <ul className="home-sponsor-featured-grid" aria-label="重点合作品牌">
            {sponsorLogos.slice(0, 2).map((sponsor) => (
              <li key={sponsor.name} className={"caption" in sponsor ? "home-sponsor-logo home-sponsor-logo--captioned" : "home-sponsor-logo"}>
                <img src={sponsor.image} alt={sponsor.name} loading="eager" />
                {"caption" in sponsor ? <span className="home-sponsor-caption">{sponsor.caption}</span> : null}
              </li>
            ))}
          </ul>
          <ul className="home-sponsor-grid" aria-label="其他合作品牌">
            {sponsorLogos.slice(2).map((sponsor) => (
              <li key={sponsor.name} className="home-sponsor-logo">
                <img src={sponsor.image} alt={sponsor.name} loading="lazy" decoding="async" />
              </li>
            ))}
          </ul>
        </div>

        <div className="home-partner-links">
          <a
            href="https://jluai.cn/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="访问 JLUAI 校园 AI 社区"
            className="home-alumni-recommendation__card"
          >
            <span className="home-alumni-recommendation__logo" aria-hidden="true">
              <img src="/assets/images/Community/jluai.png" alt="" loading="lazy" decoding="async" />
            </span>
            <span className="home-alumni-recommendation__copy">
              <span className="home-alumni-recommendation__name">JLUAI</span>
              <span className="home-alumni-recommendation__description">面向大学师生的 AI 交流社区，分享作品与实践经验，一起共创校园 AI 项目。</span>
            </span>
            <span className="home-alumni-recommendation__arrow" aria-hidden="true"><HomeArrowIcon /></span>
          </a>
          <a
            href="https://rightapi.ai/register?aff=RIGHTCODE_JLU"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="访问 RightAPI"
            className="home-alumni-recommendation__card"
          >
            <span className="home-alumni-recommendation__logo" aria-hidden="true">
              <img src="/assets/images/Partners/rightapi-f85e58d1.webp" alt="" loading="lazy" decoding="async" />
            </span>
            <span className="home-alumni-recommendation__copy">
              <span className="home-alumni-recommendation__name">RightAPI</span>
              <span className="home-alumni-recommendation__description">由吉甲学长运营，提供第三方 AI 模型 API 接入服务。</span>
            </span>
            <span className="home-alumni-recommendation__arrow" aria-hidden="true"><HomeArrowIcon /></span>
          </a>
        </div>
      </div>
    </section>
  );
}

export function PublicHomePage({ page = "home", children }: { page?: PublicPage; children?: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routePage = topicPageByPath[location.pathname] ?? page;
  const legacyDestination = location.pathname === "/"
    ? legacyHomeHashDestinations[location.hash]
    : undefined;
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const topic = routePage === "home" ? null : topicPages[routePage];

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

  return (
    <div className="public-home relative min-h-screen overflow-hidden bg-surface-primary text-fg-primary">
      <div className="relative z-10">
      <Navbar />
      <div className="public-route-content">
      {routePage === "home" ? (
      <section
        id="hero"
        className="public-home-hero relative min-h-[64svh] overflow-hidden bg-black sm:min-h-[92svh]"
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
            poster="/assets/images/Robot/hero-robot-166a7390.webp"
            aria-label="吉林大学吉甲大师双创基地宣传视频"
          >
            <source media="(min-width: 640px) and (prefers-reduced-motion: no-preference)" src="/assets/images/Video/hero-showreel-005cfe69.mp4" type="video/mp4" />
          </video>
          <div className="public-home-hero-shade absolute inset-0" />
        </div>

        <div className="relative z-10 flex min-h-[64svh] items-center sm:min-h-[92svh]">
          <div className="public-home-container mx-auto flex w-full items-center pb-12 pt-24 sm:pb-20 sm:pt-32">
            <div className="flex max-w-2xl flex-col items-center gap-3 text-center sm:items-start sm:gap-4 sm:text-left">
              <img
                src="/assets/images/Logo/tarsgo-logo-v5.svg"
                alt="TARSGO"
                className="h-16 w-auto max-w-full object-contain sm:h-24"
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--hero-accent)] sm:text-xs">
                吉林大学 · RoboMaster 战队
              </p>
              <h1 className="max-w-2xl text-[34px] font-semibold leading-[1.1] tracking-[-0.045em] text-white sm:text-6xl lg:text-[72px]">
                从构想，到<span className="text-[var(--hero-accent)]">赛场</span>
              </h1>
              <p className="max-w-lg text-sm leading-6 text-white/78 sm:text-base sm:leading-7">
                以 RoboMaster 竞赛为牵引，持续投入机器人研发与团队协作。
              </p>
              <div className="mt-2 flex w-full flex-row gap-2 sm:w-auto sm:gap-3">
                <Link
                  to="/about"
                  className="motion-button inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-accent-primary px-3 py-3 text-sm font-semibold text-fg-inverse transition-colors hover:bg-[var(--admin-accent-bright)] sm:flex-none sm:px-7"
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
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-white/35 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:flex-none sm:px-7"
                >
                  加入我们
                </Link>
              </div>
            </div>
          </div>
        </div>

      </section>
      ) : routePage === "join" ? null : (
        <section className={"public-topic-hero relative isolate overflow-hidden " + (routePage === "robots" ? "public-topic-hero--robots" : routePage === "events-and-honors" ? "public-topic-hero--events" : "")}>
          <img
            src={topic?.image}
            alt={routePage === "about" ? topic?.alt ?? "" : ""}
            aria-hidden={routePage !== "about"}
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="public-topic-hero-shade absolute inset-0" />
          <div className="public-home-container relative z-10 flex min-h-[26rem] items-end pb-12 pt-32 sm:min-h-[32rem] sm:pb-16 lg:min-h-[38rem]">
            <div className="max-w-3xl">
              <Link to="/" className="mb-8 inline-flex min-h-11 items-center text-sm font-medium text-white/80 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                ← 返回首页
              </Link>
              {topic?.eyebrow ? <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--hero-accent)] sm:text-sm">{topic.eyebrow}</p> : null}
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-7xl">{topic?.title}</h1>
              {topic?.description ? <p className="mt-5 max-w-2xl text-sm leading-7 text-white/80 sm:text-base sm:leading-8">{topic.description}</p> : null}
            </div>
          </div>
        </section>
      )}

      {routePage === "home" ? <HomeVisualNavigation imageTreatment="sand" playOnce /> : null}

      {children}

      {/* Footer */}
      {routePage === "home" ? <HomeSponsorSection /> : null}
      <PublicFooter compactMobile={routePage === "home"} />
      </div>
      </div>
    </div>
  );
}

export default function HomeRoute() {
  return <PublicHomePage />;
}

