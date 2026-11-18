import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  getOperationsAttention, getOperationsBoard, operationsAttentionLabel, operationsPlatformNames,
  type OperationsBoard, type OperationsItem, type OperationsPost, type OperationsSnapshot,
} from "~/lib/operations-progress-client";
import { OperationsStageBar } from "./operations-stage-bar";
import "./operations-progress.css";

export function meta() { return [{ title: "运营动态 | TARSGO" }]; }

function OperationsProgressSkeleton() {
  return <div className="operations-progress__platform-grid content-skeleton motion-safe:animate-pulse"
    role="status" aria-label="正在加载战队动态">
    {[0,1,2,3].map((i) => <div className="operations-progress__item operations-progress__platform-card" key={i}>
      <div className="h-4 w-24 rounded bg-[var(--admin-border)]" />
      <div className="h-9 w-32 rounded bg-[var(--admin-border)]" />
      <div className="h-20 rounded bg-[var(--admin-border)]" />
      <div className="h-4 w-40 rounded bg-[var(--admin-border)]" />
    </div>)}
  </div>;
}

function AccountTrend({ platform, snapshots }: { platform:string; snapshots: OperationsSnapshot[] }) {
  const entries = snapshots.filter((entry) => entry.platform === platform);
  if (!entries.length) return <p className="operations-progress__muted operations-progress__trend-empty">暂无账号数据</p>;
  const latest = entries[entries.length-1];
  const cutoff = Date.parse(latest.observedOn) - 30 * 86400000;
  const recent = entries.filter((entry) => Date.parse(entry.observedOn) >= cutoff);
  const stride = Math.max(1, Math.ceil((recent.length - 1) / 8));
  const samples = recent.filter((_, index) => index === 0 || index === recent.length - 1 || index % stride === 0);
  const min = Math.min(...samples.map((entry) => entry.followers));
  const span = Math.max(1, Math.max(...samples.map((entry) => entry.followers)) - min);
  const points = samples.map((entry, index) =>
    `${12+index*296/Math.max(1,samples.length-1)},${62-(entry.followers-min)/span*50}`).join(" ");
  const start = [...entries].reverse().find((entry) => Math.abs(Date.parse(entry.observedOn)-cutoff) <= 3*86400000);
  const delta = start ? latest.followers-start.followers : null;
  return <div className="operations-progress__trend">
    <div className="operations-progress__trend-head">
      <strong>{latest.followers.toLocaleString("zh-CN")}</strong>
      <span>{platform === "wechat" ? "关注" : "粉丝"}</span>
    </div>
    <div className="operations-progress__trend-meta">
      <span>{delta === null ? "暂无可比较的30天数据" : `近30天 ${delta>0?"+":""}${delta.toLocaleString("zh-CN")}`}</span>
      <small>{latest.observedOn}</small>
    </div>
    {entries.length > 1 ? <svg viewBox="0 0 320 78" preserveAspectRatio="none"
      aria-label={`${operationsPlatformNames[platform]}关注趋势`} role="img">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="308" cy={62-(latest.followers-min)/span*50} r="3" fill="currentColor" />
    </svg> : null}
  </div>;
}

function PlatformCard({ channel, works, snapshots, latestPost }: {
  channel: OperationsItem; works: OperationsItem[]; snapshots: OperationsSnapshot[];
  latestPost?: OperationsPost;
}) {
  const active = works.filter((item) => item.steps.some((step) => step.status !== "pending"));
  const pendingCount = works.length - active.length;
  const selected = [...active].sort((a,b) => Number(getOperationsAttention(a) !== "blocked") -
    Number(getOperationsAttention(b) !== "blocked") || b.id-a.id)[0];
  const currentStep = selected?.steps.find((step) => step.status === "blocked") ||
    selected?.steps.find((step) => step.status === "active") ||
    selected?.steps.find((step) => step.status === "pending");
  const postDate = latestPost ? new Date(latestPost.publishedAt).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric",
  }) : "";
  const postMetric = latestPost?.platform === "wechat" ? "阅读" :
    latestPost?.mediaType === "image" ? "浏览" : "播放";

  return <section className="operations-progress__item operations-progress__platform-card">
    <div className="operations-progress__item-head">
      <h2>{operationsPlatformNames[channel.platforms] || channel.title}</h2>
      <Link className="operations-progress__platform-link"
        to={`/dashboard/workbench/operations/channels/${channel.id}`}>查看任务</Link>
    </div>
    <AccountTrend platform={channel.platforms} snapshots={snapshots} />
    {selected ? <div className="operations-progress__platform-feature">
      <div className="operations-progress__feature-heading">
        <span className="operations-progress__eyebrow">正在制作</span>
        {active.length > 1 ? <span className="operations-progress__muted">另有 {active.length - 1} 期</span> : null}
      </div>
      <Link className="operations-progress__featured-title"
        to={`/dashboard/workbench/operations/works/${selected.id}`}>{selected.title}</Link>
      <OperationsStageBar item={selected} />
      {currentStep ? <p className="operations-progress__feature-status">
        {currentStep.status === "blocked" ? "当前卡点" : "当前环节"}：{currentStep.title}
        {currentStep.assigneeName ? ` · ${currentStep.assigneeName}` : ""}
      </p> : null}
    </div> : latestPost ? <div className="operations-progress__last-post">
      <span className="operations-progress__eyebrow">最近发布 · {postDate}</span>
      {latestPost.url ? <a className="operations-progress__last-post-title"
        href={latestPost.url} target="_blank" rel="noopener noreferrer">{latestPost.title}</a> :
        <strong className="operations-progress__last-post-title">{latestPost.title}</strong>}
      <span className="operations-progress__muted">{latestPost.viewCount.toLocaleString("zh-CN")} {postMetric}</span>
    </div> : <p className="operations-progress__muted operations-progress__empty-work">暂无发布作品</p>}
    {pendingCount > 0 ? <div className="operations-progress__platform-footer">
      {pendingCount} 期待规划
    </div> : null}
  </section>;
}

export default function OperationsProgressPage() {
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setBoard(await getOperationsBoard()); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "运营动态加载失败"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const items = board?.items ?? [];
  const channels = items.filter((item) => item.kind === "channel");
  const works = items.filter((item) => (item.kind === "video" || item.kind === "article") && item.status !== "done");
  const otherItems = items.filter((item) => item.kind !== "channel" && item.kind !== "video" && item.kind !== "article" && item.status !== "done");

  return <main className="operations-progress admin-design" aria-busy={loading && !board}>
    <header className="operations-progress__header">
      <h1>运营动态</h1>
      <nav className="operations-progress__main-nav" aria-label="运营入口">
        <Link className="admin-button admin-button--secondary" to="/dashboard/workbench/operations/tasks">我的任务</Link>
        <Link className="admin-button admin-button--primary" to="/dashboard/workbench/operations/works">全部作品</Link>
      </nav>
    </header>
    {error ? <p role="alert" className="operations-progress__error">{error}
      <button type="button" onClick={() => void load()}>重试</button></p> : null}
    {loading && !board ? <OperationsProgressSkeleton /> : null}
    {board ? <>
      <section className="operations-progress__platforms-section">
        <h2>平台运营</h2>
        <div className="operations-progress__platform-grid">
          {channels.map((channel) => <PlatformCard key={channel.id} channel={channel}
            snapshots={board.snapshots}
            latestPost={board.latestPosts.find((post) => post.platform === channel.platforms)}
            works={works.filter((item) => item.publications.some((target) => target.platform === channel.platforms))} />)}
        </div>
      </section>
      {otherItems.length ? <section className="operations-progress__other-items">
        <h2>其他事务</h2>
        {otherItems.map((item) => <article className="operations-progress__item" key={item.id} id={`operations-item-${item.id}`}>
          <div className="operations-progress__item-head">
            <h3>{item.title}</h3>
            <span className={`operations-progress__status operations-progress__status--${getOperationsAttention(item)}`}>
              {operationsAttentionLabel[getOperationsAttention(item)]}
            </span>
          </div>
          <OperationsStageBar item={item} />
          {item.kind === "merchandise" ? <div className="operations-progress__item-footer">
            <Link to={`/dashboard/workbench/operations/works/${item.id}`}>查看详情</Link>
          </div> : null}
          {!item.steps.length && item.nextAction ? <p className="operations-progress__muted">{item.nextAction}</p> : null}
        </article>)}
      </section> : null}
    </> : null}
  </main>;
}
