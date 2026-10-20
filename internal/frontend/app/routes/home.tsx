import type { Route } from "./+types/home";
import { useEffect, useRef, useState } from "react";
import { Navbar } from "../components/navbar";
import { JoinExperience } from "../components/join-experience";
import { AboutTeamPage } from "../components/about-team-page";
import { EventsAndHonorsArchive } from "../components/events-and-honors-archive";
import { RobotPhotoGallery } from "../components/robot-photo-gallery";
import { TeamHistoryArchive } from "../components/team-history-archive";
import { HomeVisualNavigation } from "../components/home-visual-navigation";
import { FooterCoordinateSandTrace } from "../components/footer-coordinate-sand-trace";
import { SiteLogo } from "~/components/site-logo";
import { Link, useLocation, useNavigate } from "react-router";
import {
  getCachedCurrentUser,
  getOptionalCurrentUser,
  hasKnownAnonymousSession,
  subscribeAccountSessionChange,
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

const sponsorLogos = [
  { name: "YELITE", image: "/assets/images/Sponsors/yelite.webp" },
  { name: "AMASS", image: "/assets/images/Sponsors/amass.webp" },
  { name: "创芯工坊", image: "/assets/images/Sponsors/cxgf.webp" },
  { name: "吉地智联", image: "/assets/images/Sponsors/jdzl.webp" },
  { name: "嘉立创CNC", image: "/assets/images/Sponsors/jlc.webp" },
  { name: "纪元羽毛球", image: "/assets/images/Sponsors/jyymq.webp" },
  { name: "快趣科技", image: "/assets/images/Sponsors/kqkj.webp" },
  { name: "留形科技", image: "/assets/images/Sponsors/lxkj.webp" },
  { name: "千将资本", image: "/assets/images/Sponsors/qjzb.webp" },
  { name: "YUHESEN", image: "/assets/images/Sponsors/yeheshen.webp" },
  { name: "长春纳丝精密机械有限公司", image: "/assets/images/Sponsors/nasi-precision.svg" },
];

const groups = [
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

        <aside className="home-alumni-recommendation" aria-labelledby="home-alumni-recommendation-heading">
          <div className="home-alumni-recommendation__label">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-primary">ALUMNI PROJECT</p>
            <h3 id="home-alumni-recommendation-heading" className="mt-2 text-base font-semibold tracking-tight text-fg-primary sm:text-lg">
              校友项目推荐
            </h3>
          </div>
          <a
            href="https://rightapi.ai/register?aff=RIGHTCODE_JLU"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="访问 RightAPI"
            className="home-alumni-recommendation__card"
          >
            <span className="home-alumni-recommendation__logo" aria-hidden="true">
              <img src="/assets/images/Partners/rightapi.jpg" alt="" loading="lazy" decoding="async" />
            </span>
            <span className="home-alumni-recommendation__copy">
              <span className="home-alumni-recommendation__name">RightAPI</span>
              <span className="home-alumni-recommendation__description">由吉甲学长运营，提供第三方 AI 模型 API 接入服务。</span>
            </span>
            <span className="home-alumni-recommendation__arrow" aria-hidden="true"><HomeArrowIcon /></span>
          </a>
        </aside>
      </div>
    </section>
  );
}

export function PublicFooter() {
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

        <div className="public-footer-signature">
          <p className="text-xs text-fg-dim">
            &copy; {new Date().getFullYear()} TARSGO 战队 · 吉林大学吉甲大师双创基地
          </p>
          <FooterCoordinateSandTrace />
        </div>
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
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(getNavbarUser);
  const [authError, setAuthError] = useState(false);
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

  useEffect(() => {
    let disposed = false;
    let identityGeneration = 0;
    const unsubscribeAuth = subscribeAuthStateChange((user) => {
      identityGeneration += 1;
      if (!disposed) {
        setCurrentUser(user);
        setAuthError(false);
      }
    });
    const unsubscribeAccount = subscribeAccountSessionChange(() => {
      const requestGeneration = ++identityGeneration;
      setCurrentUser(undefined);
      setAuthError(false);
      void getOptionalCurrentUser({ force: true })
        .then((user) => {
          if (!disposed && requestGeneration === identityGeneration) setCurrentUser(user);
        })
        .catch(() => {
          if (!disposed && requestGeneration === identityGeneration) setAuthError(true);
        });
    });

    const initialGeneration = identityGeneration;
    void getOptionalCurrentUser()
      .then((user) => {
        if (!disposed && initialGeneration === identityGeneration) {
          setCurrentUser(user);
          setAuthError(false);
        }
      })
      .catch(() => {
        if (!disposed && initialGeneration === identityGeneration) {
          setAuthError(true);
        }
      });

    return () => {
      disposed = true;
      unsubscribeAuth();
      unsubscribeAccount();
    };
  }, []);



  return (
    <div className="public-home relative min-h-screen overflow-hidden bg-surface-primary text-fg-primary">
      <div className="relative z-10">
      <Navbar currentUser={currentUser} authError={authError} />
      <div className="public-route-content">
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
            <source src="/assets/images/Video/hero-showreel-005cfe69.mp4" type="video/mp4" />
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
                从构想，到<span className="text-[var(--hero-accent)]">赛场</span>
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

      {routePage === "home" ? <HomeVisualNavigation imageTreatment="sand" /> : null}

      {routePage === "events-and-honors" ? <EventsAndHonorsArchive /> : null}

      {routePage === "about" ? <AboutTeamPage groups={groups} /> : null}

      {routePage === "team-history" ? <TeamHistoryArchive /> : null}

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

      {routePage === "join" ? <JoinExperience groups={groups} /> : null}

      {/* Footer */}
      {routePage === "home" ? <HomeSponsorSection /> : null}
      <PublicFooter />
      </div>
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
