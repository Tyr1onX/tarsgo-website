import { Navigate, useLocation } from "react-router";

export function meta() {
  return [
    { title: "个人工作台 | TARSGO" },
    { name: "description", content: "跳转至个人工作台。" },
  ];
}

export default function DashboardDailySignal() {
  const location = useLocation();
  return <Navigate to={`/dashboard${location.search}${location.hash}`} replace />;
}
