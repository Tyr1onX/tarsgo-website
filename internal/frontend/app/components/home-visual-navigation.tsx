import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { HomeSandRevealLayer } from "./home-sand-reveal-layer";
import type { HomeImageTreatment, SandRevealPhase } from "./home-sand-reveal-layer";
import { claimHomeSandPlayback, hasHomeSandPlayed, HOME_SAND_PLAYED_KEY } from "~/lib/home-sand-playback";

const responsiveHomeImage = (
  name: string,
  width640Hash: string,
  width1280Hash: string,
  cardSize: "standard" | "wide" = "standard",
) => ({
  imageSrcSet: `/assets/images/Home/Responsive/${name}-640-${width640Hash}.webp 640w, /assets/images/Home/Responsive/${name}-1280-${width1280Hash}.webp 1280w`,
  imageSizes:
    cardSize === "wide"
      ? "(min-width: 1280px) 608px, (min-width: 1024px) 50vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, calc(100vw - 2rem)"
      : "(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, calc(100vw - 2rem)",
});

const noResponsiveHomeImage = {
  imageSrcSet: undefined as string | undefined,
  imageSizes: undefined as string | undefined,
};

type HomeNavigationModule = {
  title: string;
  description: string;
  href: string;
  placement: string;
  image?: string;
  imageSrcSet?: string;
  imageSizes?: string;
  alt?: string;
};

const homeNavigationModules: HomeNavigationModule[] = [
  {
    title: "认识吉甲",
    description: "从训练日常和团队文化，认识工程实践如何走进赛场。",
    href: "/about",
    image: "/assets/images/ContestMoment/contest-moment-04.webp",
    ...responsiveHomeImage("about", "381e0fa8", "8e5963df"),
    alt: "队员在比赛现场协作检查机器人。",
    placement: "home-visual-card--about",
  },
  {
    title: "机器人展示",
    description: "浏览五类机器人影像，了解真实的团队实践。",
    href: "/robots",
    image: "/assets/images/Robot/hero-robot.webp",
    // This image is also the hero video's poster; keep one shared request instead of downloading a second responsive copy.
    ...noResponsiveHomeImage,
    alt: "吉甲大师英雄机器人实物。",
    placement: "home-visual-card--robots",
  },
  {
    title: "加入吉甲",
    description: "从机械、电控、视觉、AI 与运营五个方向找到入口。",
    href: "/join",
    image: "/assets/images/Daily/daily-02.webp",
    ...noResponsiveHomeImage,
    alt: "队员围绕笔记本和工程模型交流。",
    placement: "home-visual-card--join",
  },
  {
    title: "吉甲社区",
    description: "分享想法，交流经验，找到同行的人。",
    href: "/dashboard",
    placement: "home-visual-card--cocreation home-visual-card--community",
  },
  {
    title: "AI 沙龙",
    description: "从一个想法开始，一起做出作品。",
    href: "/programs/ai-salon",
    placement: "home-visual-card--cocreation home-visual-card--salon",
  },
  {
    title: "赛事与荣誉",
    description: "回看真实赛事记录，浏览荣誉证书原图。",
    href: "/events-and-honors",
    image: "/assets/images/ContestMoment/contest-moment-02.webp",
    ...responsiveHomeImage("events", "a0240c86", "0a9ecfa8", "wide"),
    alt: "吉甲大师团队赛事现场记录。",
    placement: "home-visual-card--events",
  },
  {
    title: "团队历程",
    description: "沿着 2018—2026 年真实资料，回看战队与平台的接力。",
    href: "/team-history",
    image: "/assets/images/Milestone/2019-breakthrough.webp",
    ...noResponsiveHomeImage,
    alt: "TARS-Go 在 2019 ICRA RoboMaster 人工智能挑战赛的队伍合影。",
    placement: "home-visual-card--history",
  },
  {
    title: "低空微专业",
    description: "了解低空智能感知与控制的课程和实践内容。",
    href: "/micro-specialties/low-altitude-intelligent-sensing-control",
    image: "/assets/images/Robot/aerial-robots.webp",
    ...responsiveHomeImage("micro", "9613d89c", "d641915f"),
    alt: "吉甲大师空中机器人。",
    placement: "home-visual-card--micro",
  },
];

type HomeVisualNavigationProps = {
  imageTreatment?: HomeImageTreatment;
  replayToken?: number;
  showHeading?: boolean;
  frameOverride?: number;
  playOnce?: boolean;
};

function HomeVisualCard({
  module,
  imageTreatment,
  started,
  replayToken,
  staggerMs,
  frameOverride,
  showFinalImage,
}: {
  module: (typeof homeNavigationModules)[number];
  imageTreatment?: HomeImageTreatment;
  started: boolean;
  replayToken: number;
  staggerMs: number;
  frameOverride?: number;
  showFinalImage: boolean;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [phase, setPhase] = useState<SandRevealPhase>(imageTreatment ? "idle" : "done");

  return (
    <Link
      to={module.href}
      prefetch={module.image ? "viewport" : "intent"}
      className={`home-visual-card ${module.placement}`}
      aria-label={`${module.title}：${module.description}`}
      data-sand-mode={module.image ? imageTreatment : undefined}
      data-sand-phase={module.image && imageTreatment ? (showFinalImage ? "done" : phase) : undefined}
      onPointerDown={(event) => {
        if (module.image || event.button !== 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const card = event.currentTarget;
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--home-ripple-x", `${event.clientX - rect.left}px`);
        card.style.setProperty("--home-ripple-y", `${event.clientY - rect.top}px`);
        card.classList.remove("home-visual-card--ripple");
        void card.offsetWidth;
        card.classList.add("home-visual-card--ripple");
      }}
      onAnimationEnd={(event) => {
        if (event.animationName === "home-card-ripple") event.currentTarget.classList.remove("home-visual-card--ripple");
      }}
    >
      {module.image ? (
        <>
          <img
            ref={imageRef}
            src={module.image}
            srcSet={module.imageSrcSet}
            sizes={module.imageSizes}
            alt={module.alt}
            loading="lazy"
            decoding="async"
          />
          {imageTreatment && !showFinalImage ? (
            <HomeSandRevealLayer
              imageRef={imageRef}
              mode={imageTreatment}
              started={started}
              replayToken={replayToken}
              staggerMs={staggerMs}
              frameOverride={frameOverride}
              onPhaseChange={setPhase}
            />
          ) : null}
          <span className="home-visual-card-shade" aria-hidden="true" />
        </>
      ) : null}
      <div className="home-visual-card-copy">
        <h3>{module.title}</h3>
        <p>{module.description}</p>
      </div>
      <svg className="home-visual-card-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </svg>
    </Link>
  );
}

export function HomeVisualNavigation({
  imageTreatment,
  replayToken = 0,
  showHeading = true,
  frameOverride,
  playOnce = false,
}: HomeVisualNavigationProps = {}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [playbackStatus, setPlaybackStatus] = useState<"checking" | "ready" | "skipped">("checking");

  useEffect(() => {
    if (!playOnce || imageTreatment !== "sand") return;
    try {
      setPlaybackStatus(hasHomeSandPlayed(window.localStorage) ? "skipped" : "ready");
    } catch {
      setPlaybackStatus("ready");
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === HOME_SAND_PLAYED_KEY && event.newValue === "1") setPlaybackStatus("skipped");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [imageTreatment, playOnce]);

  useEffect(() => {
    if (!imageTreatment || hasEntered || (playOnce && playbackStatus !== "ready")) return;
    const startReveal = () => {
      if (playOnce) {
        try {
          if (!claimHomeSandPlayback(window.localStorage)) {
            setPlaybackStatus("skipped");
            return;
          }
        } catch {
          // Storage may be disabled; keep the existing animation available.
        }
      }
      setHasEntered(true);
    };
    if (!("IntersectionObserver" in window)) {
      startReveal();
      return;
    }
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          startReveal();
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -5% 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [hasEntered, imageTreatment, playOnce, playbackStatus]);

  return (
    <>
      {playOnce ? (
        <section
          className="home-mobile-navigation border-t border-[var(--theme-border-subtle)] py-8 sm:hidden"
          aria-labelledby="home-mobile-navigation-heading"
        >
          <div className="public-home-container">
            <h2 id="home-mobile-navigation-heading" className="mb-4 text-xl font-semibold tracking-tight text-fg-primary">
              探索吉甲
            </h2>
            <nav aria-label="吉甲手机端专题导航" className="home-mobile-grid">
              {homeNavigationModules
                .filter((module) => module.href !== "/about" && module.href !== "/join")
                .map((module) => {
                  const kind = module.href === "/robots" ? "featured" : module.image ? "compact" : "action";
                  return (
                    <Link
                      key={module.href}
                      to={module.href}
                      prefetch="intent"
                      className={`home-mobile-link home-mobile-link--${kind}`}
                      aria-label={`${module.title}：${module.description}`}
                    >
                      {kind === "featured" ? (
                        <img src={module.image} alt={module.alt ?? ""} loading="lazy" decoding="async" />
                      ) : null}
                      <span className="home-mobile-link__copy">
                        <strong>{module.title}</strong>
                        {kind === "action" ? <span>{module.description}</span> : null}
                      </span>
                      <svg className="home-mobile-link__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 12h14m-6-6 6 6-6 6" />
                      </svg>
                    </Link>
                  );
                })}
            </nav>
          </div>
        </section>
      ) : null}
      <section
      ref={sectionRef}
      id="home-navigation"
      aria-labelledby={showHeading ? "home-navigation-heading" : undefined}
      aria-label={showHeading ? undefined : "吉甲专题导航预览"}
      className={`${playOnce ? "hidden sm:block " : ""}border-t border-[var(--theme-border-subtle)] py-14 sm:py-16 lg:py-20`}
    >
      <div className="public-home-container">
        {showHeading ? (
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
        ) : null}

        <nav aria-label="吉甲专题导航" className="home-visual-grid">
          {homeNavigationModules.map((module, index) => (
            <HomeVisualCard
              key={module.href}
              module={module}
              imageTreatment={imageTreatment}
              started={hasEntered || frameOverride !== undefined}
              replayToken={replayToken}
              staggerMs={(index > 4 ? index - 2 : index) * 105}
              frameOverride={frameOverride}
              showFinalImage={playOnce && playbackStatus !== "ready"}
            />
          ))}
        </nav>
      </div>
      </section>
    </>
  );
}
