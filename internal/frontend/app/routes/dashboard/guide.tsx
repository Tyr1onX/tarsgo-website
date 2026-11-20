import { Navigate, useOutletContext, useSearchParams } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { hasOperationsWorkManualAccess } from "~/lib/dashboard-navigation";

export function meta() {
  return [{ title: "资料中心 | TARSGO" }];
}

// Keep existing bookmarks working without retaining a second manual page.
export default function GuideRedirect() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams] = useSearchParams();
  const operations = searchParams.get("tab") === "operations"
    && hasOperationsWorkManualAccess(currentUser, groupResolution?.groups);
  return <Navigate to={`/dashboard/training-materials?doc=${operations ? "operations-sop" : "website-guide"}`} replace />;
}
