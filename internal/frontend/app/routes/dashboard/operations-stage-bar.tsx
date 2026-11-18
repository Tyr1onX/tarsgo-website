import { Link } from "react-router";
import type { OperationsItem, OperationsStepStatus } from "~/lib/operations-progress-client";

const labels: Record<OperationsStepStatus, string> = {
  pending: "待处理", active: "进行中", blocked: "受阻", done: "已完成",
};

// The existing horizontal stages remain the sole workflow visualization.
export function OperationsStageBar({ item }: { item: OperationsItem }) {
  if (!item.steps.length) return null;
  return <div className="operations-progress__video-stages" aria-label={`${item.title}制作流程`}>
    <ol style={{ gridTemplateColumns: `repeat(${item.steps.length}, minmax(6rem, 1fr))` }}>
      {item.steps.map((step, index) =>
        <li key={step.id} className={step.status === "done" ? "is-complete" : step.status === "active" ? "is-current" : step.status === "blocked" ? "is-blocked" : ""}>
          <Link className="operations-progress__step-button"
            to={`/dashboard/workbench/operations/works/${item.id}?step=${step.id}`}
            aria-label={`查看${item.title}的${step.title}环节，${labels[step.status]}`}>
            <span className="operations-progress__step-marker" aria-hidden="true">{step.status === "done" ? "✓" : index + 1}</span>
            <span>{step.title}</span>
            {step.assigneeName ? <small>{step.assigneeName}</small> : null}
            {step.status !== "pending" ? <small>{labels[step.status]}</small> : null}
          </Link>
        </li>)}
    </ol>
    {item.steps.filter((step) => step.status === "blocked").map((step) =>
      <p className="operations-progress__blocker" key={step.id}>
        <strong>{step.title}{step.assigneeName ? ` · ${step.assigneeName}` : ""}</strong>：{step.blockReason}
      </p>)}
  </div>;
}