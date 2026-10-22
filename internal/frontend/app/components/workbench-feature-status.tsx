import { WORKBENCH_FEATURES, type WorkbenchFeatureKey } from "~/lib/workbench-feature-announcement";
import "./workbench-feature-status.css";

export function WorkbenchFeatureStatus({ feature }: { feature: WorkbenchFeatureKey }) {
  const item = WORKBENCH_FEATURES.find((candidate) => candidate.key === feature);
  if (!item) return null;
  return <span className="workbench-feature-status" aria-label={`${item.title}：${item.status}`}>{item.status}</span>;
}
