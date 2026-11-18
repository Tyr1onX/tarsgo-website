import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getOperationsBoard, getOperationsAttention, operationsAttentionLabel,
  type OperationsBoard } from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "我的运营任务 | TARSGO" }]; }

export default function OperationsMyTasksPage() {
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((result) => { if (active) setBoard(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, []);
  const tasks = board?.items.flatMap((item) =>
    item.steps.filter((step) => step.assigneeId === board.viewerId && step.status !== "done")
      .map((step) => ({ item, step }))) ?? [];
  tasks.sort((a,b) => Number(b.step.status === "blocked") - Number(a.step.status === "blocked") ||
    Number(b.step.status === "active") - Number(a.step.status === "active"));
  return <main className="operations-progress admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations">返回运营动态</Link>
    <header className="operations-progress__channel-head"><div><h1>我的任务</h1></div></header>
    {error ? <p role="alert" className="operations-progress__error">{error}</p> : null}
    {!board && !error ? <p className="operations-progress__muted">正在加载…</p> : null}
    {board && tasks.length === 0 ? <p className="operations-progress__muted">当前没有待处理的运营环节</p> : null}
    <div className="operations-progress__items">
      {tasks.map(({item,step}) => <Link
        className="operations-progress__item operations-progress__task-link"
        key={step.id} to={`/dashboard/workbench/operations/${item.id}/steps/${step.id}`}>
        <div>
          <p className="operations-progress__eyebrow">{item.seriesName ? item.seriesName + " · " : ""}{item.title}</p>
          <h2>{step.title}</h2>
          {step.status === "blocked" && step.blockReason ? <p className="operations-progress__muted">{step.blockReason}</p> : null}
        </div>
        <span className={`operations-progress__status operations-progress__status--${getOperationsAttention(item)}`}>
          {({ pending:"待处理", active:"进行中", blocked:"受阻", done:"已完成" } as const)[step.status]}
        </span>
      </Link>)}
    </div>
  </main>;
}
