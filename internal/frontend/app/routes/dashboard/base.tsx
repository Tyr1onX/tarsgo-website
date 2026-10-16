import { DailySignalWorkspace } from "~/components/daily-signal-workspace";

export function meta() {
  return [
    { title: "每日通信 · 个人工作台 | TARSGO" },
    { name: "description", content: "在吉甲基地留下今天的信号，查看个人年度通信记录。" },
  ];
}

export default function DashboardDailySignal() {
  return (
    <div className="dashboard-daily-signal">
      <DailySignalWorkspace />
    </div>
  );
}
