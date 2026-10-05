import { Navigate, useOutletContext } from "react-router";

import { getDefaultDashboardPath } from "~/lib/dashboard-navigation";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export default function DashboardIndexRedirect() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  return <Navigate to={getDefaultDashboardPath(currentUser.role.name)} replace />;
}
