import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { formatOperationsDate, getOperationsBoard, type OperationsBoard } from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "环节详情 | TARSGO" }]; }

export default function OperationsStepDetailPage() {
  const { itemId, stepId } = useParams();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((result) => { if (active) setBoard(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, []);
  const item = board?.items.find((entry) => entry.id === Number(itemId));
  const step = item?.steps.find((entry) => entry.id === Number(stepId));
  const canUpdate = Boolean(step && (board?.canManage || step.assigneeId === board?.viewerId));
  const parentUrl = "/dashboard/workbench/operations";

  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to={`${parentUrl}#operations-item-${itemId}`}>返回运营事项</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p>
      : !board ? <p className="operations-progress__muted">正在加载…</p>
      : !item || !step ? <p className="operations-progress__error">环节不存在</p>
      : <article className="operations-progress__item">
        <p className="operations-progress__muted">{item.title}</p>
        <div className="operations-progress__item-head">
          <h1>{step.title}</h1>
          <span className={`operations-progress__status operations-progress__status--${step.status === "blocked" ? "blocked" : "active"}`}>
            {({ pending: "待处理", active: "进行中", blocked: "受阻", done: "已完成" } as const)[step.status]}
          </span>
        </div>
        <div className="operations-progress__step-info">
          <p><span>负责人</span>{step.assigneeName || "待分配"}</p>
          {step.status === "blocked" ? <p><span>当前卡点</span>{step.blockReason}</p> : null}
          {step.completedAt ? <p><span>完成时间</span>{formatOperationsDate(step.completedAt)}</p> : null}
          {step.status !== "pending" ? <p><span>最近更新</span>{formatOperationsDate(step.updatedAt)}</p> : null}
        </div>
        {canUpdate ? <Link className="admin-button admin-button--primary operations-progress__edit-link"
          to={`${parentUrl}/${item.id}/steps/${step.id}/status`}>更新状态</Link> : null}
      </article>}
  </main>;
}