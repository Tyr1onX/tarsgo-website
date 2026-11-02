import { Navigate } from "react-router";

export function meta() {
  return [{ title: "成员与岗位 | TARSGO" }];
}

export default function DashboardTeamRedirect() {
  return <Navigate to="/dashboard/workbench/organization" replace />;
}
