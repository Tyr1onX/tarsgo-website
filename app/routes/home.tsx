import type { Route } from "./+types/home";
import { Navbar } from "../components/navbar";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TARS-GO | 吉林大学吉甲大师战队" },
    {
      name: "description",
      content:
        "吉林大学TARS-GO战队官网 - RoboMaster机甲大师赛参赛战队，枕戈坐甲，奋勇前行",
    },
  ];
}

const robots = [
  {
    name: "英雄机器人",
    id: "1号",
    description: "重火力单位，发射42mm大弹丸，伤害最高的战场核心输出角色。",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <rect
          x="12"
          y="8"
          width="24"
          height="32"
          rx="4"
          className="stroke-primary-400"
          strokeWidth="2"
        />
        <circle cx="20" cy="18" r="3" className="fill-primary-400" />
        <circle cx="28" cy="18" r="3" className="fill-primary-400" />
        <rect
          x="18"
          y="26"
          width="12"
          height="6"
          rx="2"
          className="fill-primary-500/30 stroke-primary-400"
          strokeWidth="1.5"
        />
        <line
          x1="8"
          y1="20"
          x2="12"
          y2="20"
          className="stroke-primary-400"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="36"
          y1="20"
          x2="40"
          y2="20"
          className="stroke-primary-400"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    name: "步兵机器人",
    id: "3/4/5号",
    description: "轻火力机动单位，使用17mm弹丸，灵活穿梭战场执行战术任务。",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <rect
          x="14"
          y="12"
          width="20"
          height="24"
          rx="3"
          className="stroke-accent-400"
          strokeWidth="2"
        />
        <circle cx="20" cy="20" r="2.5" className="fill-accent-400" />
        <circle cx="28" cy="20" r="2.5" className="fill-accent-400" />
        <rect
          x="10"
          y="36"
          width="8"
          height="4"
          rx="2"
          className="fill-accent-400/30 stroke-accent-400"
          strokeWidth="1.5"
        />
        <rect
          x="30"
          y="36"
          width="8"
          height="4"
          rx="2"
          className="fill-accent-400/30 stroke-accent-400"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    name: "哨兵机器人",
    id: "7号",
    description: "完全自主运行的AI机器人，无需操作手，独立巡逻与防御。",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <circle
          cx="24"
          cy="20"
          r="10"
          className="stroke-sky-400"
          strokeWidth="2"
        />
        <circle cx="24" cy="20" r="4" className="fill-sky-400" />
        <line
          x1="24"
          y1="30"
          x2="24"
          y2="40"
          className="stroke-sky-400"
          strokeWidth="2"
        />
        <line
          x1="16"
          y1="40"
          x2="32"
          y2="40"
          className="stroke-sky-400"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M18 12 L24 6 L30 12"
          className="stroke-sky-400"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "工程机器人",
    id: "2号",
    description: "无武装辅助单位，负责收集矿石兑换资源，为团队提供战略支援。",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <rect
          x="12"
          y="16"
          width="24"
          height="20"
          rx="3"
          className="stroke-amber-400"
          strokeWidth="2"
        />
        <path
          d="M18 16 V10 H30 V16"
          className="stroke-amber-400"
          strokeWidth="2"
          fill="none"
        />
        <rect
          x="18"
          y="22"
          width="12"
          height="8"
          rx="1"
          className="fill-amber-400/20 stroke-amber-400"
          strokeWidth="1.5"
        />
        <line
          x1="24"
          y1="24"
          x2="24"
          y2="28"
          className="stroke-amber-400"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="22"
          y1="26"
          x2="26"
          y2="26"
          className="stroke-amber-400"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    name: "空中机器人",
    id: "6号",
    description: "多轴飞行器，拥有空中视野和攻击优势，执行空中侦察与打击任务。",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <circle
          cx="24"
          cy="24"
          r="6"
          className="stroke-violet-400"
          strokeWidth="2"
        />
        <line
          x1="24"
          y1="18"
          x2="24"
          y2="8"
          className="stroke-violet-400"
          strokeWidth="1.5"
        />
        <line
          x1="24"
          y1="30"
          x2="24"
          y2="40"
          className="stroke-violet-400"
          strokeWidth="1.5"
        />
        <line
          x1="18"
          y1="24"
          x2="8"
          y2="24"
          className="stroke-violet-400"
          strokeWidth="1.5"
        />
        <line
          x1="30"
          y1="24"
          x2="40"
          y2="24"
          className="stroke-violet-400"
          strokeWidth="1.5"
        />
        <ellipse
          cx="24"
          cy="8"
          rx="6"
          ry="2"
          className="stroke-violet-400"
          strokeWidth="1.5"
        />
        <ellipse
          cx="24"
          cy="40"
          rx="6"
          ry="2"
          className="stroke-violet-400"
          strokeWidth="1.5"
        />
        <ellipse
          cx="8"
          cy="24"
          rx="2"
          ry="6"
          className="stroke-violet-400"
          strokeWidth="1.5"
        />
        <ellipse
          cx="40"
          cy="24"
          rx="2"
          ry="6"
          className="stroke-violet-400"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    name: "飞镖系统",
    id: "8号",
    description: "远程打击系统，可对敌方前哨站和基地发动精确远程攻击。",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12">
        <path
          d="M8 40 L40 8"
          className="stroke-rose-400"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M40 8 L32 10 L38 16 Z"
          className="fill-rose-400/30 stroke-rose-400"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle
          cx="18"
          cy="30"
          r="8"
          className="stroke-rose-400/50"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle
          cx="18"
          cy="30"
          r="4"
          className="stroke-rose-400/50"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle cx="18" cy="30" r="1.5" className="fill-rose-400" />
      </svg>
    ),
  },
];

const achievements = [
  { year: "2018", title: "战队成立", detail: "吉林大学通信工程学院组建TARS-GO战队" },
  {
    year: "2020",
    title: "全国赛一等奖",
    detail: "首次参赛即获RoboMaster全国赛一等奖",
  },
  { year: "2022", title: "全国赛三等奖", detail: "RoboMaster全国赛三等奖" },
  {
    year: "2024",
    title: "晋级全国总决赛",
    detail: "高校联盟赛东部赛区五战三胜，入围八强晋级国赛",
  },
];

const teamGroups = [
  { name: "机械组", description: "机器人结构设计与制造", color: "text-primary-400" },
  { name: "电控组", description: "嵌入式系统与电路设计", color: "text-accent-400" },
  { name: "视觉组", description: "机器视觉与自动瞄准", color: "text-sky-400" },
  { name: "决策组", description: "战术决策与AI算法", color: "text-violet-400" },
  { name: "软件组", description: "上位机软件开发", color: "text-amber-400" },
  { name: "AI组", description: "人工智能算法研究", color: "text-rose-400" },
  { name: "运营组", description: "团队管理与品牌宣传", color: "text-emerald-400" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero Section */}
      <section
        id="hero"
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
      >
        {/* Background grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,91,172,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,91,172,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-transparent to-gray-950" />

        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[128px]" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary-500/30 bg-primary-500/10 text-primary-300 text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse" />
            RoboMaster 机甲大师赛参赛战队
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-r from-primary-300 via-primary-400 to-primary-500 bg-clip-text text-transparent">
              TARS-GO
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-gray-400 mb-4">
            吉林大学 吉甲大师战队
          </p>

          <p className="text-lg text-primary-300/80 font-medium tracking-widest mb-12">
            枕戈坐甲 奋勇前行
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#about"
              className="px-8 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors"
            >
              了解更多
            </a>
            <a
              href="#robots"
              className="px-8 py-3 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium rounded-lg transition-colors"
            >
              查看机器人
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg
            className="w-6 h-6 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"
            />
          </svg>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">关于我们</h2>
            <div className="w-16 h-1 bg-primary-500 mx-auto mb-8 rounded-full" />
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <p className="text-gray-300 leading-relaxed text-lg">
                <strong className="text-white">TARS-GO战队</strong>
                成立于2018年底，由吉林大学通信工程学院组建，是吉林大学RoboMaster机甲大师赛的正式参赛战队。
              </p>
              <p className="text-gray-300 leading-relaxed">
                队名源自电影《星际穿越》中的机器人TARS，寓意
                <span className="text-primary-300">
                  "外在做事沉稳有序，内在思维活跃创新"
                </span>
                。战队依托吉甲大师双创基地，汇聚来自不同校区、院系和专业的约35名成员。
              </p>
              <p className="text-gray-300 leading-relaxed">
                战队始终秉持"学生是主角"的核心理念，鼓励成员自主探索、勇于创新，在机器人设计、制造与竞技中不断突破自我。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800">
                <div className="text-3xl font-bold text-primary-400 mb-2">
                  2018
                </div>
                <div className="text-sm text-gray-400">建队年份</div>
              </div>
              <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800">
                <div className="text-3xl font-bold text-accent-400 mb-2">
                  35+
                </div>
                <div className="text-sm text-gray-400">团队成员</div>
              </div>
              <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800">
                <div className="text-3xl font-bold text-sky-400 mb-2">7</div>
                <div className="text-sm text-gray-400">技术组别</div>
              </div>
              <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800">
                <div className="text-3xl font-bold text-amber-400 mb-2">
                  5+
                </div>
                <div className="text-sm text-gray-400">机器人兵种</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Robots Section */}
      <section id="robots" className="py-24 sm:py-32 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">战斗兵种</h2>
            <div className="w-16 h-1 bg-primary-500 mx-auto mb-8 rounded-full" />
            <p className="text-gray-400 text-lg">
              多兵种协同作战，每个机器人都承担着独特的战场使命
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {robots.map((robot) => (
              <div
                key={robot.name}
                className="group p-6 rounded-2xl bg-gray-900 border border-gray-800 hover:border-primary-500/50 transition-all duration-300"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="shrink-0">{robot.icon}</div>
                  <div>
                    <h3 className="text-lg font-semibold">{robot.name}</h3>
                    <span className="text-xs text-gray-500">{robot.id}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {robot.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Achievements Section */}
      <section id="achievements" className="py-24 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">荣誉成就</h2>
            <div className="w-16 h-1 bg-primary-500 mx-auto mb-8 rounded-full" />
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[23px] top-2 bottom-2 w-px bg-gray-800" />

              <div className="space-y-8">
                {achievements.map((item, index) => (
                  <div key={item.year} className="relative flex gap-6">
                    {/* Dot */}
                    <div className="shrink-0 w-12 flex items-start justify-center pt-1">
                      <div
                        className={`w-3 h-3 rounded-full border-2 ${
                          index === achievements.length - 1
                            ? "bg-primary-500 border-primary-400"
                            : "bg-gray-950 border-gray-600"
                        }`}
                      />
                    </div>

                    <div className="pb-2">
                      <div className="text-sm text-primary-400 font-mono mb-1">
                        {item.year}
                      </div>
                      <h3 className="text-lg font-semibold mb-1">
                        {item.title}
                      </h3>
                      <p className="text-sm text-gray-400">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section id="team" className="py-24 sm:py-32 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">团队架构</h2>
            <div className="w-16 h-1 bg-primary-500 mx-auto mb-8 rounded-full" />
            <p className="text-gray-400 text-lg">
              七大技术组别，跨学科协同作战
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {teamGroups.map((group) => (
              <div
                key={group.name}
                className="p-5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <h3 className={`text-lg font-semibold mb-2 ${group.color}`}>
                  {group.name}
                </h3>
                <p className="text-sm text-gray-400">{group.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <span className="text-white font-bold tracking-wide">
                TARS-GO
              </span>
              <span className="text-gray-500 text-sm">
                吉林大学 吉甲大师战队
              </span>
            </div>

            <div className="flex items-center gap-6 text-sm text-gray-500">
              <span>吉甲大师梦工场</span>
              <span>吉林大学南湖校区</span>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-800/50 text-center text-sm text-gray-600">
            &copy; {new Date().getFullYear()} TARS-GO 吉林大学吉甲大师战队
          </div>
        </div>
      </footer>
    </div>
  );
}
