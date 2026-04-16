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

export default function Home() {
  return (
    <div className="min-h-screen bg-surface-primary text-fg-primary">
      <Navbar />

      {/* Hero Section */}
      <section
        id="hero"
        className="relative flex items-center min-h-[580px] bg-gradient-to-b from-[#0052D4] via-[#0062FF] to-[#4F46E5] overflow-hidden"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20 w-full flex flex-col lg:flex-row items-center gap-10 lg:gap-[60px] py-16 lg:py-0">
          {/* Left content */}
          <div className="flex-1 flex flex-col gap-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 self-start px-4 py-1.5 rounded-full bg-white/[0.13]">
              <svg
                className="w-4 h-4 text-[#FFD700]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
              <span className="text-fg-inverse text-[13px] font-medium">
                吉林大学吉甲大师双创基地
              </span>
            </div>

            {/* Title */}
            <h1 className="font-display text-6xl sm:text-7xl lg:text-[80px] text-fg-inverse tracking-wide">
              TARS-Go
            </h1>

            {/* Subtitle */}
            <p className="text-[22px] font-medium text-white/80">
              外在做事沉稳有序，内在思维活跃创新
            </p>

            {/* Description */}
            <p className="max-w-[520px] text-base text-white/60 leading-relaxed">
              我们是吉林大学 RoboMaster
              机甲大师赛战队，致力于机器人研发与竞技对抗，培养具有工程思维的综合素质人才。
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4 mt-2">
              <a
                href="#about"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-fg-inverse text-accent-primary font-semibold rounded-full transition-opacity hover:opacity-90"
              >
                了解更多
                <svg
                  className="w-[18px] h-[18px]"
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
              </a>
              <a
                href="#join"
                className="inline-flex items-center px-8 py-3.5 border-2 border-fg-inverse text-fg-inverse font-semibold rounded-full transition-colors hover:bg-white/10"
              >
                加入我们
              </a>
            </div>
          </div>

          {/* Right image */}
          <div className="w-full max-w-[480px] h-[320px] lg:h-[420px] rounded-[20px] bg-surface-light/50 overflow-hidden shrink-0">
            <div className="w-full h-full bg-gradient-to-br from-accent-primary/30 to-accent-secondary/30 flex items-center justify-center">
              <svg
                className="w-24 h-24 text-white/20"
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
          </div>
        </div>
      </section>

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
            {robots.map((robot) => (
              <div
                key={robot.name}
                className="overflow-hidden bg-surface-light rounded-2xl"
              >
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
