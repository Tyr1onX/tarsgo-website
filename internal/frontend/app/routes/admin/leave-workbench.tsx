import { Navigate } from "react-router";

export { meta } from "../leave-workbench";

// Keep existing admin bookmarks working; the dashboard layout enforces admin access.
export default function LegacyAdminLeaveRoute() {
  return <Navigate to="/dashboard/leave" replace />;
}
