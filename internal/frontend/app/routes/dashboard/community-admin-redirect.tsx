import { Navigate } from "react-router";

export function meta() {
  return [{ title: "吉甲社区 | TARSGO" }];
}

export default function LegacyCommunityAdminRedirect() {
  return <Navigate replace to="/dashboard" />;
}
