import { Navigate } from "react-router";

export function meta() {
  return [{ title: "团队组织架构 | TARSGO" }];
}

export default function DashboardTeamRedirect() {
  return <Navigate to="/dashboard/team" replace />;
}
