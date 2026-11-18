import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  formatOperationsDay, getOperationsAttention, getOperationsBoard, operationsAttentionLabel,
  type OperationsBoard, type OperationsItem, type OperationsSnapshot,
} from "~/lib/operations-progress-client";
import { OperationsStageBar } from "./operations-stage-bar";
import "./operations-progress.css";

export function meta() { return [{ title: "运营动态 | TARSGO" }]; }

function OperationsProgressSkeleton() {
  const line = "block h-3 rounded bg-[var(--admin-border)]";
  return <div className="content-skeleton motion-safe:animate-pulse" role="status" aria-label="正在加载战队动态">
    <div className="operations-progress__account-metrics" aria-hidden="true">
      {[0, 1, 2].map((index) => <div key={index} className="operations-progress__follower-chart">
        <span className={`${line} w-20`} />
        <span className={`${line} mt-4 w-32`} />
        <span className="mt-5 block h-20 rounded bg-[var(--admin-border-subtle)]" />
      </div>)}
    </div>
    <div className="operations-progress__stats" aria-hidden="true">
      {[0, 1, 2].map((index) => <div key={index}>
        <span className="block h-7 w-12 rounded bg-[var(--admin-border)]" />
        <span className={`${line} mt-2 w-20 max-w-full`} />
      </div>)}
    </div>
    <div className="operations-progress__items" aria-hidden="true">
      {[0, 1].map((index) => <div key={index} className="operations-progress__item">
        <span className={`${line} w-40 max-w-full`} />
        <span className={`${line} mt-3 w-24`} />
        <span className="mt-6 block h-12 rounded bg-[var(--admin-border-subtle)]" />
      </div>)}
    </div>
  </div>;
}

function FollowerTrend({ platform, snapshots }: { platform: OperationsSnapshot["platform"]; snapshots: OperationsSnapshot[] }) {
  const label = { douyin: "抖音", bilibili: "B站", wechat: "公众号" }[platform];
  const values = snapshots.filter((entry) => entry.platform === platform);
  if (!values.length) return null;
  const maximum = Math.max(...values.map((entry) => entry.followers));
  const minimum = Math.min(...values.map((entry) => entry.followers));
  const span = Math.max(1, maximum - minimum);
  const coords = values.map((entry, index) => {
    const x = 12 + index * 296 / Math.max(1, values.length - 1);
    const y = 66 - (entry.followers - minimum) / span * 54;
    return { x, y, entry };
  });
  return <div className="operations-progress__follower-chart">
    <div className="operations-progress__follower-head">
      <strong>{label}</strong>
      <span><b>{values[values.length - 1].followers.toLocaleString("zh-CN")}</b> {platform === "wechat" ? "关注" : "粉"} · {values[values.length - 1].observedOn}</span>
    </div>
    {values.length > 1 ? <svg viewBox="0 0 320 82" preserveAspectRatio="none" role="img" aria-label={`${label}关注增长趋势，从${minimum}到${maximum}`}>
      <polyline points={coords.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(({ x, y, entry }) => <circle key={entry.observedOn} cx={x} cy={y} r="3" fill="currentColor"><title>{entry.observedOn}：{entry.followers} {platform === "wechat" ? "关注" : "粉"}</title></circle>)}
    </svg> : null}
    {values.length > 1 ? <p className="operations-progress__muted">历史记录 {values.length} 个 · {values[0].observedOn} 起</p> : null}
  </div>;
}


export default function OperationsProgressPage() {
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"all" | "mine" | "blocked">("all");

  const load = useCallback(async () => {
    try {
      setBoard(await getOperationsBoard());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "运营动态加载失败");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const items = board?.items ?? [];
  const channels = items.filter((item) => item.kind === "channel");
  const episodes = items.filter((item) => item.channelId !== null && item.status !== "done");
  const inProgress = episodes.filter((item) => item.steps.some((step) => step.status !== "pending")).length;
  const drafts = episodes.length - inProgress;
  const blocked = episodes.filter((item) => getOperationsAttention(item) === "blocked").length;
  const otherItems = items.filter((item) => item.kind !== "channel" && item.channelId === null && item.status !== "done");

  const selected = (item: OperationsItem) => viewMode === "all"
    || (viewMode === "mine" && item.steps.some((step) => step.assigneeId === board?.viewerId))
    || (viewMode === "blocked" && getOperationsAttention(item) === "blocked");
  const prioritized = (values: OperationsItem[]) => [...values].sort((a, b) => {
    const rank = (item: OperationsItem) => getOperationsAttention(item) === "blocked" ? 0
      : item.steps.some((step) => step.status !== "pending") ? 1 : 2;
    return rank(a) - rank(b) || b.episodeNo - a.episodeNo;
  });

  return <main className="operations-progress admin-design" aria-busy={loading && !board}>
    <header className="operations-progress__header">
      <div><h1>运营动态</h1></div>
      <Link className="operations-progress__library-link" to="/dashboard/workbench/operations/works">查看作品库</Link>
    </header>
    {error ? <p className="operations-progress__error" role="alert">{error}
      <button type="button" onClick={() => void load()}>重试</button></p> : null}
    {loading && !board ? <OperationsProgressSkeleton /> : null}
    {board ? <>
      {board.snapshots.length > 0 ? <section className="operations-progress__account-metrics" aria-label="平台关注趋势">
        <FollowerTrend platform="douyin" snapshots={board.snapshots} />
        <FollowerTrend platform="bilibili" snapshots={board.snapshots} />
        <FollowerTrend platform="wechat" snapshots={board.snapshots} />
      </section> : null}
      <div className="operations-progress__stats" aria-label="制作状态">
        <div><strong>{inProgress}</strong><span>制作中</span></div>
        <div><strong>{drafts}</strong><span>待启动</span></div>
        <div><strong>{blocked}</strong><span>存在卡点</span></div>
      </div>
      <div className="operations-progress__section-head">
        <h2>运营事项</h2>
        <div className="operations-progress__filters" role="group" aria-label="任务筛选">
          {([["all", "全部事项"], ["mine", "我的任务"], ["blocked", "卡点"]] as const).map(([key, label]) =>
            <button type="button" className={viewMode === key ? "is-selected" : ""} aria-pressed={viewMode === key}
              key={key} onClick={() => setViewMode(key)}>{label}</button>)}
        </div>
      </div>
      <div className="operations-progress__items">
        {channels.map((channel) => {
          const current = prioritized(episodes.filter((item) => item.channelId === channel.id && selected(item)));
          if (viewMode !== "all" && current.length === 0) return null;
          const featured = current[0];
          return <section className="operations-progress__item operations-progress__channel-card" key={channel.id}>
            <div className="operations-progress__item-head">
              <div>
                <p className="operations-progress__eyebrow">{({ douyin: "抖音", bilibili: "B站", wechat: "公众号" } as Record<string, string>)[channel.platforms] || "平台运营"}</p>
                <h3>{channel.title}</h3>
              </div>
              <span className="operations-progress__muted">{current.length} 期{viewMode === "all" ? "待推进" : "符合筛选"}</span>
            </div>
            {featured ? <div className="operations-progress__featured-episode">
              <div className="operations-progress__item-head">
                <h4>{featured.title}</h4>
                <span className={`operations-progress__status operations-progress__status--${getOperationsAttention(featured)}`}>
                  {operationsAttentionLabel[getOperationsAttention(featured)]}
                </span>
              </div>
              <OperationsStageBar item={featured} />
              {current.length > 1 ? <p className="operations-progress__muted">另外 {current.length - 1} 期正在安排</p> : null}
            </div> : <p className="operations-progress__muted">暂无待推进任务</p>}
            <div className="operations-progress__channel-footer">
              <span>最近发布 {formatOperationsDay(channel.lastCompletedOn)}</span>
              <Link to={`/dashboard/workbench/operations/channels/${channel.id}`}>查看平台任务</Link>
            </div>
          </section>;
        })}
        {otherItems.filter(selected).length > 0 ? <section className="operations-progress__other-items">
          <h2>其他事项</h2>
          {otherItems.filter(selected).map((item) => <article className="operations-progress__item" key={item.id}>
            <div className="operations-progress__item-head">
              <h3>{item.title}</h3>
              <span className={`operations-progress__status operations-progress__status--${getOperationsAttention(item)}`}>
                {operationsAttentionLabel[getOperationsAttention(item)]}
              </span>
            </div>
            <OperationsStageBar item={item} />
            {item.steps.length === 0 && item.nextAction ? <p className="operations-progress__muted">{item.nextAction}</p> : null}
          </article>)}
        </section> : null}
      </div>
      {channels.length === 0 ? <p className="operations-progress__muted">暂无运营平台</p> : null}
    </> : null}
  </main>;
}