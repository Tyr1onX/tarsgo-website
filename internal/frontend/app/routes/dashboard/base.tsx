import { Navigate, useLocation } from "react-router";

export function meta() {
  return [
    { title: "每日通信 · 个人工作台 | TARSGO" },
    { name: "description", content: "在吉甲基地留下今天的信号，查看个人年度通信记录。" },
  ];
}

export default function DashboardDailySignal() {
  const location = useLocation();
  return <Navigate to={`/dashboard${location.search}${location.hash || "#daily-signal"}`} replace />;
}
