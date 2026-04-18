import type { Route } from "./+types/home";
import { Navbar } from "../components/navbar";
import { Link } from "react-router";

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
    color: "bg-accent-primary",
  },
  {
    icon: "users",
    value: "35+",
    label: "团队成员",
    color: "bg-accent-secondary",
  },
  {
    icon: "layers",
    value: "7",
    label: "技术组别",
    color: "bg-accent-tertiary",
  },
  {
    icon: "award",
    value: "Top 16",
    label: "全国最佳成绩",
    color: "bg-accent-gold",
  },
];

const achievements = [
  {
    year: "2020",
    title: "首次参赛即获一等奖",
    description:
      "RoboMaster 2020 机甲大师赛全国线上评审赛一等奖，进入全国前 16 强",
  },
  {
    year: "2023",
    title: "校内赛事品牌创立",
    description:
      "成功举办吉甲大师 RoboMaster 校内赛，吸引更多同学参与机器人竞技",
  },
  {
    year: "2024",
    title: "晋级全国总决赛",
    description:
      "在 RoboMaster 2024 东部赛区对抗赛中五战三胜，入围八强晋级全国总决赛",
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
  "/assets/images/HeroRobot.jpg",
  "/assets/images/InfantryRobot.jpg",
  "/assets/images/EngineeringRobot.jpg",
  "/assets/images/SentinelRobot.jpg",
];

const groups = [
  {
    name: "机械组",
    description: "负责机器人结构设计、建模、加工与装配，将创意变为现实",
    icon: "cog",
    gradient: "from-[#0062FF] to-[#4F46E5]",
  },
  {
    name: "电控组",
    description: "嵌入式系统开发、电路设计、电机控制，让机器人\u201C动\u201D起来",
    icon: "cpu",
    gradient: "from-[#10B981] to-[#059669]",
  },
  {
    name: "视觉组",
    description: "机器视觉、目标识别、自动瞄准，赋予机器人\u201C眼睛\u201D",
    icon: "eye",
    gradient: "from-[#F59E0B] to-[#D97706]",
  },
  {
    name: "决策组",
    description: "战术策略、自主决策、AI 算法，机器人的\u201C大脑\u201D",
    icon: "brain",
    gradient: "from-[#EF4444] to-[#DC2626]",
  },
];

const photoCells = [
  {
    title: "北部赛区对抗现场",
    tag: "参赛",
    image: "/media/team/competition-01.jpg",
    description: "战车高速穿梭、火力交错，是 TARS-Go 最直接的赛场表情。",
    className: "md:col-span-2 md:row-span-2",
  },
  {
    title: "校内备赛与展示",
    tag: "日常",
    image: "/media/team/daily-01.jpg",
    description: "在基地里完成联调、展示和复盘，是每个赛季的常态。",
    className: "md:col-span-2",
  },
  {
    title: "战术联动瞬间",
    tag: "参赛",
    image: "/media/team/competition-02.jpg",
    description: "从调度到执行，协同是比赛强度的一部分。",
    className: "",
  },
  {
    title: "团队协作日常",
    tag: "日常",
    image: "/media/team/daily-02.jpg",
    description: "深夜车间、会议桌和工位，组成了真正的训练场。",
    className: "",
  },
  {
    title: "实验室研发场景",
    tag: "研发",
    image: "/media/team/workshop-01.png",
    description: "从结构、控制到视觉，所有模块都在这里并行推进。",
    className: "md:col-span-2",
  },
  {
    title: "比赛中的机动压制",
    tag: "参赛",
    image: "/media/team/competition-03.jpg",
    description: "速度、判断和执行力，最终都会体现在场上的推进里。",
    className: "md:col-span-2",
  },
];

function StatIcon({ icon, className }: { icon: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    calendar: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
      </svg>
    ),
    users: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    layers: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
      </svg>
    ),
    award: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" /><circle cx="12" cy="8" r="6" />
      </svg>
    ),
  };
  return <>{icons[icon]}</>;
}

function GroupIcon({ icon, className }: { icon: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    cog: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
    cpu: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" /><path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" />
      </svg>
    ),
    eye: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
    brain: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" /><path d="M17.599 6.5a3 3 0 0 0 .399-1.375" /><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" /><path d="M3.477 10.896a4 4 0 0 1 .585-.396" /><path d="M19.938 10.5a4 4 0 0 1 .585.396" /><path d="M6 18a4 4 0 0 1-1.967-.516" /><path d="M19.967 17.484A4 4 0 0 1 18 18" />
      </svg>
    ),
  };
  return <>{icons[icon]}</>;
}

function TeamLogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-surface-primary text-fg-primary">
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
            poster="/media/team/competition-01.jpg"
            aria-label="吉林大学 TARS-Go 战队比赛视频"
          >
            <source src="/media/team/tarsgo-match-hero.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,98,255,0.24),transparent_42%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.78)_0%,rgba(2,6,23,0.24)_36%,rgba(2,6,23,0.7)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.88)_0%,rgba(2,6,23,0.28)_45%,rgba(2,6,23,0.68)_100%)]" />
        </div>

        <div className="absolute inset-x-0 top-0 z-20">
          <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-4 px-6 pb-10 pt-28 text-center sm:px-10 sm:pt-32 lg:px-20">
            <div className="motion-fade-down inline-flex items-center gap-3 rounded-full border border-white/18 bg-black/28 px-5 py-3 text-white backdrop-blur-xl">
              <TeamLogoMark className="h-7 w-7 text-accent-gold" />
              <span className="font-display text-2xl tracking-[0.18em] sm:text-3xl">
                TARS-Go
              </span>
            </div>
            <p className="motion-fade-down max-w-2xl text-sm font-medium tracking-[0.42em] text-white/80 sm:text-base">
              吉林大学机甲大师双创基地
            </p>
            <Link
              to="/register"
              className="motion-button inline-flex items-center gap-2 rounded-full border border-white/18 bg-white px-7 py-3 text-sm font-semibold text-slate-950 shadow-[0_20px_60px_-28px_rgba(255,255,255,0.78)] sm:text-base"
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

        <div className="relative z-10 flex min-h-[100svh] items-end">
          <div className="mx-auto w-full max-w-[1440px] px-6 pb-14 pt-40 sm:px-10 sm:pb-18 lg:px-20">
            <div className="motion-fade-up max-w-3xl">
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-white/76 backdrop-blur-md">
                RoboMaster 2023
              </span>
              <h1 className="max-w-4xl font-display text-[clamp(4rem,14vw,10rem)] leading-none tracking-[0.12em] text-white">
                TARS-Go
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
                以 RoboMaster 官方赛事实拍为首页背景，在赛场动态里直接看到吉林大学吉甲大师战队的速度、协同与压制力。
              </p>
            </div>

            <div className="mt-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="motion-fade-up max-w-lg rounded-3xl border border-white/12 bg-black/22 p-5 backdrop-blur-md">
                <p className="text-xs uppercase tracking-[0.34em] text-white/48">
                  Video Source
                </p>
                <p className="mt-2 text-sm leading-6 text-white/74">
                  吉林大学 TARS_Go 战队 vs 哈尔滨工程大学 创梦之翼战队
                  <br />
                  RoboMaster 2023 超级对抗赛北部赛区公开比赛画面
                </p>
              </div>

              <a
                href="#about"
                className="motion-button inline-flex items-center gap-2 self-start rounded-full border border-white/14 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md hover:bg-white/16"
              >
                下滑查看更多
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14" />
                  <path d="m19 12-7 7-7-7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      <Navbar />

      {/* About Section */}
      <section id="about" className="py-16 sm:py-20 bg-surface-primary">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <div className="flex flex-col items-center gap-3 mb-12">
            <span className="inline-block px-4 py-1 text-[13px] font-semibold text-accent-primary bg-surface-light rounded-full">
              关于我们
            </span>
            <h2 className="font-display text-3xl sm:text-[40px] text-fg-primary text-center">
              一支跨校区、跨学科的机器人战队
            </h2>
            <p className="max-w-[700px] text-base text-fg-muted leading-relaxed text-center">
              TARS-Go 战队成立于 2018
              年，取名自电影《星际穿越》中的机器人
              TARS。战队依托吉林大学吉甲大师双创基地，汇聚了来自不同学院、不同校区的优秀同学，共同在
              RoboMaster 机甲大师赛中竞技拼搏。
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-3 p-7 bg-surface-light rounded-2xl"
              >
                <div
                  className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center`}
                >
                  <StatIcon
                    icon={stat.icon}
                    className="w-6 h-6 text-fg-inverse"
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

          <div className="mt-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="motion-panel-soft rounded-[28px] border border-white/8 bg-surface-light/80 p-7 sm:p-8">
              <span className="inline-flex rounded-full border border-accent-primary/20 bg-accent-primary/10 px-4 py-1 text-[13px] font-semibold text-accent-primary">
                竞赛与日常
              </span>
              <h3 className="mt-5 font-display text-3xl text-fg-primary sm:text-4xl">
                在赛场冲锋，也在车间里把细节磨到极致
              </h3>
              <p className="mt-5 text-sm leading-7 text-fg-muted sm:text-base">
                从区域赛高强度对抗，到实验室调试、校内展示和跨组协同，TARS-Go 的日常并不是单一工位，而是一整套围绕比赛目标持续运转的工程现场。
              </p>
              <p className="mt-4 text-sm leading-7 text-fg-muted sm:text-base">
                这里新增展示的都是吉林大学公开报道中的吉甲大师相关照片，用单元格的方式并排呈现参赛、研发和基地生活的不同切面。
              </p>
            </div>

            <div className="grid auto-rows-[160px] grid-cols-2 gap-4 md:auto-rows-[152px] md:grid-cols-4">
              {photoCells.map((photo) => (
                <article
                  key={photo.title}
                  className={`motion-surface group relative overflow-hidden rounded-[28px] border border-white/10 bg-surface-light ${photo.className}`}
                >
                  <img
                    src={photo.image}
                    alt={photo.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.06)_0%,rgba(2,6,23,0.22)_45%,rgba(2,6,23,0.86)_100%)]" />
                  <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                    <span className="inline-flex rounded-full border border-white/12 bg-black/30 px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-white/78 backdrop-blur-sm">
                      {photo.tag}
                    </span>
                    <h4 className="mt-3 text-base font-bold text-white sm:text-lg">
                      {photo.title}
                    </h4>
                    <p className="mt-2 text-xs leading-5 text-white/72 sm:text-sm">
                      {photo.description}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Achievements Section */}
      <section
        id="achievements"
        className="py-16 sm:py-20 bg-gradient-to-b from-[#0052D4] to-[#0062FF]"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <div className="flex flex-col items-center gap-3 mb-12">
            <span className="inline-block px-4 py-1 text-[13px] font-semibold text-fg-inverse bg-white/[0.13] rounded-full">
              赛事成就
            </span>
            <h2 className="font-display text-3xl sm:text-[40px] text-fg-inverse text-center">
              征战机甲大师，一路拼搏前行
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {achievements.map((item) => (
              <div
                key={item.year}
                className="flex flex-col gap-4 p-7 bg-white/[0.08] rounded-2xl"
              >
                <span className="text-sm font-semibold font-mono text-[#FFD700]">
                  {item.year}
                </span>
                <h3 className="text-lg font-bold text-fg-inverse">
                  {item.title}
                </h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Robot Showcase Section */}
      <section id="robots" className="py-16 sm:py-20 bg-surface-primary">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <div className="flex flex-col items-center gap-3 mb-12">
            <span className="inline-block px-4 py-1 text-[13px] font-semibold text-accent-primary bg-surface-light rounded-full">
              机器人展示
            </span>
            <h2 className="font-display text-3xl sm:text-[40px] text-fg-primary text-center">
              我们的战旗机甲
            </h2>
            <p className="max-w-[600px] text-base text-fg-muted leading-relaxed text-center">
              每一台机器人都是团队智慧的结晶，融合机械设计、嵌入式系统、机器视觉、人工智能等多项技术
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
            {robots.map((robot, index) => (
              <div
                key={robot.name}
                className="overflow-hidden bg-surface-light rounded-2xl"
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

      {/* Join Us Section */}
      <section id="join" className="py-16 sm:py-20 bg-surface-light">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20 flex flex-col items-center">
          <div className="flex flex-col items-center gap-3 mb-12">
            <span className="inline-block px-4 py-1 text-[13px] font-semibold text-fg-inverse bg-accent-primary rounded-full">
              加入我们
            </span>
            <h2 className="font-display text-3xl sm:text-[40px] text-fg-primary text-center">
              找到你的战位，一起征服星辰大海
            </h2>
            <p className="max-w-[600px] text-base text-fg-muted leading-relaxed text-center">
              我们欢迎来自各个专业的同学加入，无论你是零基础还是大佬，这里都有你的位置
            </p>
          </div>

          <div className="w-full grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {groups.map((group) => (
              <div
                key={group.name}
                className="flex flex-col gap-4 p-7 bg-surface-primary rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
              >
                <div
                  className={`w-[52px] h-[52px] bg-gradient-to-br ${group.gradient} rounded-[14px] flex items-center justify-center`}
                >
                  <GroupIcon
                    icon={group.icon}
                    className="w-[26px] h-[26px] text-fg-inverse"
                  />
                </div>
                <h3 className="text-lg font-bold text-fg-primary">
                  {group.name}
                </h3>
                <p className="text-sm text-fg-muted leading-relaxed">
                  {group.description}
                </p>
              </div>
            ))}
          </div>

          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-10 py-4 bg-accent-primary text-fg-inverse text-lg font-semibold rounded-full transition-opacity hover:opacity-90"
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
      <footer className="bg-surface-dark py-12 px-6 sm:px-10 lg:px-20">
        <div className="max-w-[1440px] mx-auto">
          {/* Footer top */}
          <div className="flex flex-col md:flex-row gap-10 md:gap-[60px] mb-8">
            {/* Brand */}
            <div className="w-full md:w-[320px] flex flex-col gap-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <svg
                  className="w-7 h-7 text-accent-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
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
                <span className="font-display text-fg-inverse text-[22px]">
                  TARS-Go
                </span>
              </div>
              <p className="text-[13px] text-fg-muted leading-relaxed max-w-[280px]">
                吉林大学吉甲大师双创基地
                <br />
                外在做事沉稳有序，内在思维活跃创新
              </p>
            </div>

            {/* Quick nav */}
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-bold text-fg-inverse">快速导航</h4>
              <a href="/#hero" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">首页</a>
              <a href="/#about" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">关于我们</a>
              <a href="/#achievements" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">赛事成就</a>
              <a href="/#join" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">加入我们</a>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-bold text-fg-inverse">联系我们</h4>
              <span className="text-[13px] text-fg-muted">吉林大学南湖校区</span>
              <span className="text-[13px] text-fg-muted">吉甲大师双创基地</span>
              <span className="text-[13px] text-fg-muted">tarsgo@jlu.edu.cn</span>
            </div>

            {/* Social */}
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-bold text-fg-inverse">关注我们</h4>
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
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.08] mb-8" />

          {/* Copyright */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-white/[0.27]">
              &copy; {new Date().getFullYear()} TARS-Go 战队 · 吉林大学吉甲大师双创基地
            </span>
            <span className="text-xs text-white/[0.27]">
              Powered by RoboMaster
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
