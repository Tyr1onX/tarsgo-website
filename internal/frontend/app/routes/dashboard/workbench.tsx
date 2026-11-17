import { Navigate, useOutletContext } from "react-router";

import { hasAssignmentGroupAccess, hasWorkbenchAccess } from "~/lib/dashboard-navigation";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [{ title: "我的事务 | TARSGO" }];
}

// Historical overview URLs keep working, but navigation leads directly to
// the relevant task instead of presenting a second menu of links.
export default function LegacyWorkbenchRedirect() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const canManage = currentUser.role.name === "super_admin" || currentUser.role.name === "admin";
  const hasGroup = hasAssignmentGroupAccess(groupResolution?.groups);
  const destination = currentUser.role.name === "super_admin"
    ? "/dashboard/admin/training/assignments"
    : canManage
      ? hasGroup ? "/dashboard/admin/training/assignments?view=review" : "/dashboard/admin/registrations"
      : !hasWorkbenchAccess(currentUser)
        ? "/dashboard"
        : hasGroup ? "/dashboard/assignments" : "/dashboard/weekly-reports";
  return <Navigate to={destination} replace />;
}
