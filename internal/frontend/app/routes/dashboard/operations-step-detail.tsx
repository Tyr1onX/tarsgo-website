import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  formatOperationsDate, getOperationsBoard, getOperationsStepActivity, operationsStepFileURL,
  type OperationsBoard, type OperationsStepActivity,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "环节详情 | TARSGO" }]; }

export default function OperationsStepDetailPage() {
  const { itemId, stepId } = useParams();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [activity, setActivity] = useState<OperationsStepActivity | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([getOperationsBoard(), getOperationsStepActivity(Number(itemId), Number(stepId))])
      .then(([result, entries]) => {
        if (active) { setBoard(result); setActivity(entries); }
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, [itemId, stepId]);
  const item = board?.items.find((entry) => entry.id === Number(itemId));
  const step = item?.steps.find((entry) => entry.id === Number(stepId));
  const canUpdate = Boolean(step && (board?.canManage || step.assigneeId === board?.viewerId));
  const parentUrl = item?.kind === "video" || item?.kind === "article"
    ? `/dashboard/workbench/operations/works/${item.id}`
    : `/dashboard/workbench/operations#operations-item-${itemId}`;

  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to={parentUrl}>返回制作进度</Link>
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
        </div>
        {canUpdate ? <Link className="admin-button admin-button--primary operations-progress__edit-link"
          to={step.key === "published" && item.publications.length > 0
            ? `/dashboard/workbench/operations/works/${item.id}/publish`
            : `/dashboard/workbench/operations/${item.id}/steps/${step.id}/status`}>
          {step.key === "published" && item.publications.length > 0 ? "登记平台发布" : "更新进度"}
        </Link> : null}
        {activity?.attachments.length ? <section className="operations-progress__detail-section">
          <h2>提交的成果</h2>
          <ul className="operations-progress__files">
            {activity.attachments.map((file) => <li key={file.id}>
              <a href={operationsStepFileURL(file.id)}>{file.fileName}</a>
              <small>{(file.size / 1024 / 1024).toFixed(1)} MB · {formatOperationsDate(file.createdAt)}</small>
            </li>)}
          </ul>
        </section> : null}
        <section className="operations-progress__detail-section">
          <h2>进展记录</h2>
          {activity?.updates.length ? <ol className="operations-progress__activity">
            {activity.updates.map((entry) => <li key={entry.id}>
              <div className="operations-progress__activity-meta">
                <strong>{entry.authorName || `成员 #${entry.authorId}`}</strong>
                <time dateTime={entry.createdAt}>{formatOperationsDate(entry.createdAt)}</time>
              </div>
              <p>{entry.content}</p>
              {entry.link ? <a href={entry.link} target="_blank" rel="noopener noreferrer">查看成果链接</a> : null}
            </li>)}
          </ol> : <p className="operations-progress__muted">暂无进展记录</p>}
        </section>
      </article>}
  </main>;
}