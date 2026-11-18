import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { getOperationsBoard, getOperationsAttention, operationsAttentionLabel,
  operationsPlatformNames, type OperationsBoard } from "~/lib/operations-progress-client";
import { OperationsStageBar } from "./operations-stage-bar";
import "./operations-progress.css";

export function meta() { return [{ title: "事项详情 | TARSGO" }]; }

export default function OperationsWorkDetailPage() {
  const { itemId } = useParams();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((value) => { if (active) setBoard(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, []);
  const item = board?.items.find((entry) => entry.id === Number(itemId));
  const isOtherWork = item?.kind === "merchandise";
  const contentWork = item && (item.kind === "video" || item.kind === "article" || isOtherWork);
  const publishingStep = item?.steps.find((step) => step.key === "published");
  const canPublish = Boolean(item && item.publications.length > 0 &&
    (board?.canManage || publishingStep?.assigneeId === board?.viewerId));
  const finished = Boolean(item?.publications.length && item.publications.every((entry) => entry.status === "done"));

  return <main className="operations-progress admin-design">
    <Link className="operations-progress__back" to={isOtherWork ? "/dashboard/workbench/operations" : "/dashboard/workbench/operations/works"}>{isOtherWork ? "返回运营动态" : "返回全部作品"}</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board ? <p className="operations-progress__muted">正在加载…</p>
      : !item || !contentWork ? <p className="operations-progress__error">作品不存在</p>
      : <>
        <header className="operations-progress__channel-head">
          <div>
            {isOtherWork ? <p className="operations-progress__eyebrow">其他事务</p> : item.seriesName ? <p className="operations-progress__eyebrow">{item.seriesName} · 作品</p> : <p className="operations-progress__eyebrow">内容制作</p>}
            <h1>{item.title}</h1>
            <p className="operations-progress__muted">由各环节负责人更新执行状态</p>
          </div>
          {board.canManage ? <Link className="admin-button admin-button--primary"
            to={`/dashboard/workbench/operations/episodes/${item.id}/setup`}>{isOtherWork ? "编辑事务" : "编辑作品"}</Link> : null}
        </header>
        <article className="operations-progress__item">
          <div className="operations-progress__item-head">
            <h2>制作进度</h2>
            <span className={`operations-progress__status operations-progress__status--${getOperationsAttention(item)}`}>
              {operationsAttentionLabel[getOperationsAttention(item)]}
            </span>
          </div>
          <OperationsStageBar item={item} />
        </article>
        {!isOtherWork ? <section className="operations-progress__item operations-progress__publication-section">
          <div className="operations-progress__item-head">
            <h2>平台发布</h2>
            {canPublish && !finished ? <Link className="admin-button admin-button--secondary"
              to={`/dashboard/workbench/operations/works/${item.id}/publish`}>登记发布</Link> : null}
          </div>
          {item.publications.length === 0 ? <p className="operations-progress__muted">尚未指定发布平台</p>
            : <div className="operations-progress__publication-list">
              {item.publications.map((target) => <div className="operations-progress__publication-row" key={target.platform}>
                <div><strong>{operationsPlatformNames[target.platform]}</strong>
                  {target.versionNote ? <p className="operations-progress__muted">{target.versionNote}</p> : null}
                </div>
                <span className={target.status === "done" ? "operations-progress__publication-done" : "operations-progress__muted"}>
                  {target.status === "done" ? "已发布" : "待发布"}
                </span>
                {target.url ? <a href={target.url} target="_blank" rel="noopener noreferrer">查看作品</a> : null}
              </div>)}
            </div>}
          {canPublish && finished ? <Link className="operations-progress__small-link"
            to={`/dashboard/workbench/operations/works/${item.id}/publish`}>查看发布登记</Link> : null}
        </section> : null}
      </>}
  </main>;
}
