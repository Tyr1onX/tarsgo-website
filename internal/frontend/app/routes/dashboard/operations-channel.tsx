import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  formatOperationsDay, getOperationsAttention, getOperationsBoard, getDouyinSyncStatus, operationsAttentionLabel,
  type OperationsBoard, type OperationsItem,
} from "~/lib/operations-progress-client";
import { OperationsStageBar } from "./operations-stage-bar";
import "./operations-progress.css";

export function meta() { return [{ title: "平台制作任务 | TARSGO" }]; }

function stageSummary(item: OperationsItem) {
  const completed = item.steps.filter((step) => step.status === "done").length;
  return `${completed} / ${item.steps.length} 个环节完成`;
}

export default function OperationsChannelPage() {
  const { channelId } = useParams();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [error, setError] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [douyinSync, setDouyinSync] = useState<{ enabled: boolean; connected: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((result) => { if (active) setBoard(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, []);
  const channel = board?.items.find((item) => item.id === Number(channelId) && item.kind === "channel");
  useEffect(() => {
    if (channel?.platforms !== "douyin") return;
    let active = true;
    void getDouyinSyncStatus().then((value) => { if (active) setDouyinSync(value); }).catch(() => { if (active) setDouyinSync(null); });
    return () => { active = false; };
  }, [channel?.platforms]);
  const episodes = board?.items.filter((item) => item.channelId === channel?.id) ?? [];
  const active = episodes.filter((item) => item.status !== "done" && item.steps.some((step) => step.status !== "pending"));
  const drafts = episodes.filter((item) => item.status !== "done" && item.steps.every((step) => step.status === "pending"));
  const completed = episodes.filter((item) => item.status === "done");
  const visible = [...active.sort((a, b) => Number(getOperationsAttention(a) !== "blocked") - Number(getOperationsAttention(b) !== "blocked") || b.episodeNo - a.episodeNo),
    ...drafts.sort((a, b) => a.episodeNo - b.episodeNo),
    ...(showCompleted ? completed.sort((a, b) => b.episodeNo - a.episodeNo) : [])];
  const workUrl = `/dashboard/workbench/operations/works?platform=${encodeURIComponent(channel?.platforms ?? "")}`;

  return <main className="operations-progress admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations">返回运营总览</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board ? <p className="operations-progress__muted">正在加载…</p>
      : !channel ? <p className="operations-progress__error">运营平台不存在</p>
      : <>
        <header className="operations-progress__channel-head">
          <div>
            <p className="operations-progress__muted">内容制作 · {channel.title}</p>
            <h1>{channel.title}</h1>
            <p className="operations-progress__muted">{active.length} 期进行中 · {drafts.length} 期待启动 · 最近发布 {formatOperationsDay(channel.lastCompletedOn)}</p>
          </div>
          <div className="operations-progress__header-actions">
            <Link to={workUrl}>查看作品库</Link>
            {channel.platforms === "douyin" && board.canManage ? <Link to="/dashboard/workbench/operations/douyin/import">导入抖音作品</Link> : null}
            {channel.platforms === "douyin" && douyinSync?.enabled && !douyinSync.connected
              ? <Link to="/api/operations/douyin/authorize" reloadDocument>连接抖音自动同步</Link> : null}
            {board.canManage ? <Link className="admin-button admin-button--primary" to={`/dashboard/workbench/operations/channels/${channel.id}/new`}>新建并行一期</Link> : null}
          </div>
        </header>
        <div className="operations-progress__section-head">
          <h2>制作进度</h2>
          {completed.length ? <label className="operations-progress__toggle">
            <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
            显示已完成（{completed.length}）
          </label> : null}
        </div>
        <div className="operations-progress__items">
          {visible.map((item) => <article id={`operations-item-${item.id}`} key={item.id}
            className="operations-progress__item operations-progress__episode">
            <div className="operations-progress__item-head">
              <div>
                <p className="operations-progress__eyebrow">制作任务 #{item.episodeNo} · {stageSummary(item)}</p>
                <h3>{item.title}</h3>
              </div>
              <span className={`operations-progress__status operations-progress__status--${getOperationsAttention(item)}`}>
                {operationsAttentionLabel[getOperationsAttention(item)]}
              </span>
            </div>
            <OperationsStageBar item={item} />
            {board.canManage && item.status !== "done" ? <div className="operations-progress__item-footer">
              <Link to={`/dashboard/workbench/operations/episodes/${item.id}/setup`}>安排选题与负责人</Link>
            </div> : null}
          </article>)}
        </div>
        {visible.length === 0 ? <p className="operations-progress__muted">当前没有制作中的任务</p> : null}
      </>}
  </main>;
}