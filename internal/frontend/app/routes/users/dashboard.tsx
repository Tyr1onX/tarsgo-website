import { useOutletContext } from "react-router";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [
    { title: "用户主页 | TARS-GO" },
    { name: "description", content: "TARS-GO 吉甲大师战队统一工作台用户主页" },
  ];
}

const announcements = [
  {
    id: 1,
    title: "2026 RoboMaster 超级对抗赛报名已开启",
    content: "本赛季报名通道现已开放，请各位队员尽快完成报名并提交相关材料。",
    date: "2026-04-10",
    tag: "赛事通知",
    tagColor: "primary",
  },
  {
    id: 2,
    title: "本周六下午进行全队联调测试",
    content: "请机械组、电控组、视觉组于周六 14:00 在实验室集合，进行步兵机器人联调。",
    date: "2026-04-08",
    tag: "训练通知",
    tagColor: "accent",
  },
  {
    id: 3,
    title: "新赛季技术文档模板已更新",
    content: "技术文档模板已上传至共享文件夹，请各组组长通知组员按新模板撰写文档。",
    date: "2026-04-05",
    tag: "团队公告",
    tagColor: "sky",
  },
];

const schedule = [
  { time: "周一 19:00", event: "例会 & 周报", location: "南岭实验室 B201" },
  { time: "周三 19:00", event: "技术分享会", location: "南岭实验室 B201" },
  { time: "周五 14:00", event: "机器人联调", location: "工程训练中心" },
  { time: "周六 10:00", event: "对抗训练赛", location: "工程训练中心" },
];

function getQuickLinks(showRecruitmentEntry: boolean) {
  const links = [
    { label: "官方规则手册", href: "#", icon: "book" },
    { label: "技术文档库", href: "#", icon: "folder" },
    { label: "返回官网", href: "/", icon: "home" },
  ];

  if (showRecruitmentEntry) {
    links.unshift({ label: "纳新报名", href: "/dashboard/users/registrations", icon: "clipboard" });
  }

  return links;
}

const tagColorMap: Record<string, string> = {
  primary: "bg-primary-500/10 text-primary-400",
  accent: "bg-accent-500/10 text-accent-400",
  sky: "bg-sky-500/10 text-sky-400",
};

function QuickLinkIcon({ type }: { type: string }) {
  switch (type) {
    case "clipboard":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </svg>
      );
    case "book":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
      );
    case "folder":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      );
  }
}

export default function UserDashboard() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const quickLinks = getQuickLinks(Boolean(currentUser.portal?.showRecruitmentEntry));

  return (
    <div className="space-y-8">
      <div className="motion-fade-up">
        <h1 className="text-2xl font-bold">
          你好，{currentUser.nickname || "队员"} 👋
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          欢迎回到 TARS-GO 吉甲大师战队个人中心
        </p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {quickLinks.map((link, index) => (
          <div
            key={link.label}
            className="motion-fade-up"
            style={{ animationDelay: `${80 + index * 70}ms` }}
          >
            <a
              href={link.href}
              className="motion-surface group flex flex-col items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/20 text-primary-400 transition-transform duration-300 group-hover:scale-105 group-hover:bg-primary-500/30">
                <QuickLinkIcon type={link.icon} />
              </div>
              <span className="text-sm text-gray-300 transition-colors group-hover:text-white">
                {link.label}
              </span>
            </a>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Announcements */}
        <div className="motion-fade-up lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900" style={{ animationDelay: "120ms" }}>
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold">最新公告</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {announcements.map((item, index) => (
              <div
                key={item.id}
                className="motion-fade-up px-5 py-4 transition-colors hover:bg-white/[0.03]"
                style={{ animationDelay: `${160 + index * 70}ms` }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full ${tagColorMap[item.tagColor]}`}>
                    {item.tag}
                  </span>
                  <span className="text-xs text-gray-500">{item.date}</span>
                </div>
                <h3 className="text-sm font-medium text-white mb-1">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.content}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div className="motion-fade-up rounded-xl border border-gray-800 bg-gray-900" style={{ animationDelay: "180ms" }}>
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold">本周日程</h2>
          </div>
          <div className="p-5 space-y-4">
            {schedule.map((item, i) => (
              <div
                key={i}
                className="motion-fade-up flex gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.03]"
                style={{ animationDelay: `${220 + i * 70}ms` }}
              >
                <div className="w-1 rounded-full bg-primary-500/40 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-white">{item.event}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{item.time}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{item.location}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
