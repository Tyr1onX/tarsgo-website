import { useOutletContext } from "react-router";

import { WorkbenchFeatureGuide } from "~/components/workbench-feature-guide";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [{ title: "新人培养与 TARS BASE 使用指南 | TARSGO" }];
}

export default function WorkbenchUpdatesRoute() {
  const { currentUser, groupResolution, groupResolutionError } = useOutletContext<DashboardLayoutOutletContext>();
  return <WorkbenchFeatureGuide currentUser={currentUser} groupResolution={groupResolution} groupResolutionError={groupResolutionError} />;
}
