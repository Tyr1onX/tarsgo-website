import { Navigate, useLocation } from "react-router";

export function meta() {
  return [{ title: "每日通信 | TARSGO" }];
}

export default function LegacyDailySignalRedirect() {
  const location = useLocation();
  return <Navigate to={`/base${location.search}${location.hash}`} replace />;
}
