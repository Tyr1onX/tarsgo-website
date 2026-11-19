import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  getOperationsAttention, getOperationsBoard, operationsAttentionLabel, operationsPlatformNames,
  type OperationsBoard, type OperationsItem, type OperationsPost, type OperationsSnapshot,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "运营动态 | TARSGO" }]; }

function OperationsProgressSkeleton() {
  return <div className="operations-progress__platform-grid content-skeleton motion-safe:animate-pulse"
    role="status" aria-label="正在加载战队动态">
    {[0,1,2,3].map((i) => <div className="operations-progress__item operations-progress__platform-card" key={i}>
      <div className="h-4 w-24 rounded bg-[var(--admin-border)]" />
      <div className="h-8 w-28 rounded bg-[var(--admin-border)]" />
      <div className="h-3 w-36 rounded bg-[var(--admin-border)]" />
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
    `${4+index*108/Math.max(1,samples.length-1)},${32-(entry.followers-min)/span*28}`).join(" ");
  const start = [...entries].reverse().find((entry) => Math.abs(Date.parse(entry.observedOn)-cutoff) <= 3*86400000);
  const delta = start ? latest.followers-start.followers : null;
  return <div className="operations-progress__trend">
    <div className="operations-progress__trend-main">
      <div className="operations-progress__trend-head">
        <strong>{latest.followers.toLocaleString("zh-CN")}</strong>
        <span>{platform === "wechat" ? "关注" : "粉丝"}</span>
      </div>
      {entries.length > 1 ? <svg viewBox="0 0 116 36" preserveAspectRatio="none"
        aria-label={`${operationsPlatformNames[platform]}关注趋势`} role="img">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2"
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="112" cy={32-(latest.followers-min)/span*28} r="3" fill="currentColor" />
      </svg> : null}
    </div>
    <div className="operations-progress__trend-meta">
      <span>{delta === null ? "近30天暂无对比" : `近30天 ${delta>0?"+":""}${delta.toLocaleString("zh-CN")}`}</span>
      <small>{latest.observedOn}</small>
    </div>
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
      {currentStep ? <p className="operations-progress__feature-status">
        <span>{currentStep.status === "blocked" ? "卡点" : "当前"} · {currentStep.title}
          {currentStep.assigneeName ? ` · ${currentStep.assigneeName}` : ""}</span>
        <span>{selected.steps.filter((step) => step.status === "done").length}/{selected.steps.length}</span>
      </p> : null}
    </div> : latestPost ? <div className="operations-progress__last-post">
      <span className="operations-progress__eyebrow">最近发布 · {postDate}</span>
      {latestPost.url ? <a className="operations-progress__last-post-title"
        href={latestPost.url} target="_blank" rel="noopener noreferrer">{latestPost.title}</a> :
        <strong className="operations-progress__last-post-title">{latestPost.title}</strong>}
      <span className="operations-progress__muted">{latestPost.viewCount.toLocaleString("zh-CN")} {postMetric}</span>
    </div> : <p className="operations-progress__muted operations-progress__empty-work">暂无发布作品</p>}
    {pendingCount > 0 ? <p className="operations-progress__platform-footer">
      {pendingCount} 期待规划
    </p> : null}
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
  const hasMerchandiseItems = items.some((item) => item.kind === "merchandise" && item.title !== "周边制作");
  const otherItems = items.filter((item) => item.kind !== "channel" && item.kind !== "video" && item.kind !== "article" && item.status !== "done" &&
    !(hasMerchandiseItems && item.kind === "merchandise" && item.title === "周边制作"));

  return <main className="operations-progress admin-design" aria-busy={loading && !board}>
    <header className="operations-progress__header">
      <h1>运营动态</h1>
      <nav className="operations-progress__main-nav" aria-label="运营入口">
        <Link className="admin-button admin-button--secondary" to="/dashboard/workbench/operations/tasks">我的任务</Link>
        <Link className="admin-button admin-button--secondary" to="/dashboard/workbench/operations/works">检索作品</Link>
        {board?.canManage ? <Link className="admin-button admin-button--primary"
          to="/dashboard/workbench/operations/works/new">发起一期视频</Link> : null}
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
        <h2>{otherItems.every((item) => item.kind === "merchandise") ? "周边制作" : "其他事务"}</h2>
        {otherItems.map((item) => {
          const completed = item.steps.filter((step) => step.status === "done").length;
          const current = item.steps.find((step) => step.status === "blocked") ||
            item.steps.find((step) => step.status === "active") ||
            item.steps.find((step) => step.status === "pending");
          return <article className="operations-progress__item operations-progress__overview-other" key={item.id} id={`operations-item-${item.id}`}>
            <div className="operations-progress__item-head">
              <h3>{item.title}</h3>
              <span className={`operations-progress__status operations-progress__status--${getOperationsAttention(item)}`}>
                {operationsAttentionLabel[getOperationsAttention(item)]}
              </span>
            </div>
            {item.steps.length ? <div className="operations-progress__other-summary">
              <span className="operations-progress__eyebrow">{completed}/{item.steps.length} 个环节完成</span>
              {current ? <p>{current.status === "blocked" ? "卡点" : "当前"} · {current.title}
                {current.assigneeName ? ` · ${current.assigneeName}` : ""}</p> : null}
            </div> : item.nextAction ? <p className="operations-progress__muted">{item.nextAction}</p> : null}
            {item.kind === "merchandise" ? <Link className="operations-progress__other-link"
              to={`/dashboard/workbench/operations/works/${item.id}`}>查看详情</Link> : null}
          </article>;
        })}
      </section> : null}
    </> : null}
  </main>;
}
