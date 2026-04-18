export function meta() {
  return [
    { title: "数据面板 | TARS-GO" },
    { name: "description", content: "TARS-GO 吉甲大师战队统一工作台数据面板" },
  ];
}

const stats = [
  { label: "总用户数", value: "128", change: "+12", icon: "users", color: "primary" },
  { label: "本月新增", value: "23", change: "+5", icon: "user-plus", color: "accent" },
  { label: "待审核报名", value: "7", change: "", icon: "clipboard", color: "amber" },
  { label: "技术组别", value: "7", change: "", icon: "grid", color: "sky" },
];

const recentActivity = [
  { user: "张三", action: "提交了报名表", time: "5 分钟前", group: "机械组" },
  { user: "李四", action: "更新了个人信息", time: "12 分钟前", group: "电控组" },
  { user: "王五", action: "通过了审核", time: "1 小时前", group: "视觉组" },
  { user: "赵六", action: "提交了报名表", time: "2 小时前", group: "决策组" },
  { user: "孙七", action: "加入了用户分组", time: "3 小时前", group: "软件组" },
];

const groupDistribution = [
  { name: "机械组", count: 8, color: "bg-primary-400" },
  { name: "电控组", count: 6, color: "bg-accent-400" },
  { name: "视觉组", count: 5, color: "bg-sky-400" },
  { name: "决策组", count: 4, color: "bg-violet-400" },
  { name: "软件组", count: 4, color: "bg-amber-400" },
  { name: "AI组", count: 3, color: "bg-rose-400" },
  { name: "运营组", count: 5, color: "bg-emerald-400" },
];

function StatIcon({ type }: { type: string }) {
  switch (type) {
    case "users":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      );
    case "user-plus":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
        </svg>
      );
    case "clipboard":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
        </svg>
      );
  }
}

const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
  primary: { bg: "bg-primary-500/10", text: "text-primary-400", iconBg: "bg-primary-500/20" },
  accent: { bg: "bg-accent-500/10", text: "text-accent-400", iconBg: "bg-accent-500/20" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-400", iconBg: "bg-amber-500/20" },
  sky: { bg: "bg-sky-500/10", text: "text-sky-400", iconBg: "bg-sky-500/20" },
};

export default function Dashboard() {
  const maxCount = Math.max(...groupDistribution.map((g) => g.count));

  return (
    <div className="space-y-8">
      <div className="motion-fade-up">
        <h1 className="text-2xl font-bold">数据面板</h1>
        <p className="text-sm text-gray-400 mt-1">这是统一工作台中的静态演示页，当前不对接实际业务统计。</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => {
          const colors = colorMap[stat.color];
          return (
            <div
              key={stat.label}
              className="motion-fade-up"
              style={{ animationDelay: `${80 + index * 70}ms` }}
            >
              <div className="motion-stat-surface rounded-xl border border-gray-800 bg-gray-900 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-10 h-10 rounded-lg ${colors.iconBg} flex items-center justify-center ${colors.text}`}>
                    <StatIcon type={stat.icon} />
                  </div>
                  {stat.change && (
                    <span className="text-xs font-medium text-accent-400 bg-accent-500/10 px-2 py-1 rounded-full">
                      {stat.change}
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="motion-fade-up lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900" style={{ animationDelay: "140ms" }}>
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold">最近动态</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {recentActivity.map((item, i) => (
              <div
                key={i}
                className="motion-fade-up flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
                style={{ animationDelay: `${180 + i * 60}ms` }}
              >
                <div className="w-9 h-9 rounded-full bg-primary-500/15 flex items-center justify-center shrink-0">
                  <span className="text-primary-400 text-xs font-medium">
                    {item.user.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-medium text-white">{item.user}</span>
                    <span className="text-gray-400"> {item.action}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{item.time}</div>
                </div>
                <span className="text-xs text-gray-500 bg-gray-800 px-2.5 py-1 rounded-full shrink-0">
                  {item.group}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Group distribution */}
        <div className="motion-fade-up rounded-xl border border-gray-800 bg-gray-900" style={{ animationDelay: "200ms" }}>
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold">组别分布</h2>
          </div>
          <div className="p-5 space-y-4">
            {groupDistribution.map((group, index) => (
              <div
                key={group.name}
                className="motion-fade-up rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.03]"
                style={{ animationDelay: `${220 + index * 45}ms` }}
              >
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-gray-300">{group.name}</span>
                  <span className="text-gray-500">{group.count} 人</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${group.color}`}
                    style={{ width: `${(group.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
