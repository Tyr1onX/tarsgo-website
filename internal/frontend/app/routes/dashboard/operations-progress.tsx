import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  daysSinceOperationsPublish, formatOperationsDate, formatOperationsDay,
  formatOperationsUpdateDate, getOperationsAttention, getOperationsBoard, getDouyinSyncStatus,
  nextOperationsDate, operationsAttentionLabel, sortOperationsItems,
  type OperationsBoard, type OperationsSnapshot, type OperationsStepStatus,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "战队动态 | TARSGO" }]; }

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
  const change = values[values.length - 1].followers - values[0].followers;
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
    {values.length > 1 ? <svg viewBox="0 0 320 82" preserveAspectRatio="none" role="img" aria-label={`${label}关注趋势，从${values[0].followers}到${values[values.length - 1].followers}`}>
      <polyline points={coords.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(({ x, y, entry }) => <circle key={entry.observedOn} cx={x} cy={y} r="3" fill="currentColor"><title>{entry.observedOn}：{entry.followers} {platform === "wechat" ? "关注" : "粉"}{entry.newFollowers !== null && entry.unfollows !== null ? `（新增 ${entry.newFollowers}，取消 ${entry.unfollows}）` : ""}</title></circle>)}
    </svg> : null}
    {values.length > 1 ? <p className="operations-progress__muted">净变化 {change >= 0 ? "+" : ""}{change.toLocaleString("zh-CN")} · {values[0].observedOn} 起</p> : null}
  </div>;
}


const statusLabels: Record<OperationsStepStatus, string> = {
  pending: "待处理", active: "进行中", blocked: "受阻", done: "已完成",
};

export default function OperationsProgressPage() {
  const location = useLocation();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [douyinSync, setDouyinSync] = useState<{ enabled: boolean; connected: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "mine" | "blocked">("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [postFilter, setPostFilter] = useState("all");
  const [showAllPosts, setShowAllPosts] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await getOperationsBoard();
      setBoard(result);
      void getDouyinSyncStatus().then(setDouyinSync).catch(() => setDouyinSync(null));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "运营进展加载失败");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const selected = board?.items.find((item) => location.hash === `#operations-item-${item.id}`);
    if (!selected) return;
    if (selected.status === "done" && !showDone) { setShowDone(true); return; }
    document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [board, location.hash, showDone]);

  const visibleItems = sortOperationsItems(board?.items ?? []).filter((item) =>
    (showDone || item.status !== "done") &&
    (viewMode === "all" || (viewMode === "blocked" && getOperationsAttention(item) === "blocked") ||
      (viewMode === "mine" && item.steps.some((step) => step.assigneeId === board?.viewerId))) &&
    (platformFilter === "all" || item.platforms.split(",").includes(platformFilter)));
  const attentionCount = (board?.items ?? []).filter((item) => getOperationsAttention(item) === "overdue").length;
  const blockedCount = (board?.items ?? []).filter((item) => getOperationsAttention(item) === "blocked").length;
  const doneCount = (board?.items ?? []).filter((item) => item.status === "done").length;
  const itemNames = new Map((board?.items ?? []).map((item) => [item.id, item.title]));
  const historyPosts = (board?.posts ?? []).filter((post) => postFilter === "all" || post.platform === postFilter);

  return <main className="operations-progress admin-design" aria-labelledby="operations-progress-title" aria-busy={loading && !board}>
    <header className="operations-progress__header">
      <h1 id="operations-progress-title">战队动态</h1>
      <button className="admin-button admin-button--secondary" type="button" onClick={() => void load()}>刷新</button>
    </header>
    {error ? <p className="operations-progress__error" role="alert">{error} <button type="button" onClick={() => void load()}>重试</button></p> : null}
    {loading && !board ? <OperationsProgressSkeleton /> : null}
    {board ? <>
      {board.snapshots.length > 0 ? <section className="operations-progress__account-metrics" aria-label="宣传平台关注数据">
        <FollowerTrend platform="douyin" snapshots={board.snapshots} />
        <FollowerTrend platform="bilibili" snapshots={board.snapshots} />
        <FollowerTrend platform="wechat" snapshots={board.snapshots} />
      </section> : null}
      <div className="operations-progress__stats" aria-label="事项状态">
        <div><strong>{board.items.filter((item) => item.status !== "done").length - attentionCount - blockedCount}</strong><span>正常 / 待启动</span></div>
        <div><strong>{attentionCount}</strong><span>需要跟进</span></div>
        <div><strong>{blockedCount}</strong><span>遇到阻塞</span></div>
      </div>
      <div className="operations-progress__section-head">
        <h2>运营事项</h2>
        {doneCount > 0 ? <label className="operations-progress__toggle"><input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />显示已结束（{doneCount}）</label> : null}
      </div>
      <div className="operations-progress__filters" aria-label="运营事项筛选">
        {([["all", "全部事项"], ["mine", "我的任务"], ["blocked", "卡点"]] as const).map(([key, label]) =>
          <button type="button" className={viewMode === key ? "is-selected" : ""} aria-pressed={viewMode === key}
            key={key} onClick={() => setViewMode(key)}>{label}</button>)}
        <select aria-label="按平台筛选" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
          <option value="all">全部平台</option><option value="douyin">抖音</option>
          <option value="bilibili">B站</option><option value="wechat">公众号</option>
        </select>
      </div>
      {visibleItems.length === 0 ? <p className="operations-progress__muted">当前筛选下暂无事项</p> : null}
      <div className="operations-progress__items">
        {visibleItems.map((item) => {
          const attention = getOperationsAttention(item);
          const due = nextOperationsDate(item);
          const category = item.kind === "channel" ? "账号运营" : item.kind === "video" ? "视频制作"
            : item.kind === "merchandise" ? "周边制作" : item.intervalDays > 0 ? `每 ${item.intervalDays} 天更新` : "长期推进";
          const platforms = item.platforms ? item.platforms.split(",").map((key) =>
            ({ douyin: "抖音", bilibili: "B站", wechat: "公众号" } as Record<string, string>)[key] || key).join(" / ") : "";
          return <article id={`operations-item-${item.id}`} className="operations-progress__item" key={item.id}>
            <div className="operations-progress__item-head">
              <div><h3>{item.title}</h3>
                {category !== item.title || platforms ? <p className="operations-progress__muted">
                  {[category === item.title ? "" : category, platforms].filter(Boolean).join(" · ")}
                </p> : null}
              </div>
              <span className={`operations-progress__status operations-progress__status--${attention}`}>{operationsAttentionLabel[attention]}</span>
            </div>
            {item.steps.length > 0 ? <div className="operations-progress__video-stages" aria-label="事项流程">
              <ol style={{ gridTemplateColumns: `repeat(${item.steps.length}, minmax(6rem, 1fr))` }}>
                {item.steps.map((step, index) =>
                  <li key={step.id} className={step.status === "done" ? "is-complete" : step.status === "active" ? "is-current" : step.status === "blocked" ? "is-blocked" : ""}>
                    <Link className="operations-progress__step-button" to={`/dashboard/workbench/operations/${item.id}/steps/${step.id}`}
                      aria-label={`查看${item.title}的${step.title}环节，${statusLabels[step.status]}`}>
                      <span className="operations-progress__step-marker" aria-hidden="true">{step.status === "done" ? "✓" : index + 1}</span>
                      <span>{step.title}</span>
                      {step.assigneeName ? <small>{step.assigneeName}</small> : null}
                      {step.status !== "pending" ? <small>{statusLabels[step.status]}</small> : null}
                    </Link>
                  </li>)}
              </ol>
              {item.steps.filter((step) => step.status === "blocked").map((step) =>
                <p className="operations-progress__blocker" key={step.id}>
                  <strong>{step.title}{step.assigneeName ? ` · ${step.assigneeName}` : ""}</strong>：{step.blockReason}
                </p>)}
            </div> : null}
            {item.steps.length === 0 ? <div className="operations-progress__item-body">
              {item.lastUpdate ? <p><span>最近进展</span>{item.lastUpdate.content}
                <time dateTime={item.lastUpdate.publishedOn || item.lastUpdate.createdAt}>（{formatOperationsUpdateDate(item.lastUpdate)}）</time>
                {item.lastUpdate.link ? <a href={item.lastUpdate.link} target="_blank" rel="noopener noreferrer">查看链接</a> : null}
              </p> : null}
              {item.kind === "channel" ? <p><span>上次发布</span><strong>{formatOperationsDay(item.lastCompletedOn)}</strong>
                {daysSinceOperationsPublish(item.lastCompletedOn) !== null ? <small>（距今 {daysSinceOperationsPublish(item.lastCompletedOn)} 天）</small> : null}
              </p> : item.intervalDays > 0 ? <p><span>上次完成</span>{formatOperationsDay(item.lastCompletedOn)}</p> : null}
              {item.status !== "done" && item.steps.length === 0 && (item.nextAction || due) ? <p>
                <span>下一步</span>{item.nextAction || "待跟进"}{due ? <time dateTime={due.toISOString()}> · {formatOperationsDate(due)}</time> : null}
              </p> : null}
            </div> : null}
          </article>;
        })}
      </div>
      <section className="operations-progress__posts" aria-labelledby="operations-posts-title">
        <div className="operations-progress__section-head">
          <h2 id="operations-posts-title">历史发布</h2>
          <div className="operations-progress__actions flex-wrap">
            <span className="operations-progress__muted">{(["douyin", "bilibili", "wechat"] as const).map((platform) => {
              const count = board.posts.filter((post) => post.platform === platform).length;
              return count > 0 ? `${({ douyin: "抖音", bilibili: "B站", wechat: "公众号" })[platform]} ${count} 条` : "";
            }).filter(Boolean).join(" · ")}</span>
            {douyinSync?.enabled ? douyinSync.connected
              ? <span className="operations-progress__muted">抖音自动同步已连接</span>
              : <Link to="/api/operations/douyin/authorize" reloadDocument>连接抖音自动同步</Link> : null}
            <select aria-label="筛选历史发布平台" value={postFilter} onChange={(event) => { setPostFilter(event.target.value); setShowAllPosts(false); }}>
              <option value="all">全部平台</option><option value="douyin">抖音</option>
              <option value="bilibili">B站</option><option value="wechat">公众号</option>
            </select>
            {board.canManage ? <Link to="/dashboard/workbench/operations/douyin/import">导入抖音作品</Link> : null}
          </div>
        </div>
        {board.posts.some((post) => post.platform === "wechat") ? <p className="operations-progress__muted">公众号阅读数据核实于 2026-11-18</p> : null}
        {historyPosts.length ? <ol>{(showAllPosts ? historyPosts : historyPosts.slice(0, 10)).map((post) => <li key={`${post.platform}:${post.externalId}`}>
          {post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a> : <strong>{post.title}</strong>}
          <span>{({ douyin: "抖音", bilibili: "B站", wechat: "公众号" } as Record<string, string>)[post.platform] || post.platform} · {post.platform === "wechat"
            ? new Date(post.publishedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
            : formatOperationsDate(post.publishedAt)} · {post.viewCount.toLocaleString("zh-CN")} {post.platform === "wechat" ? "人阅读" : post.mediaType === "image" ? "浏览" : "播放"}
            {post.platform === "douyin" && post.mediaType ? ` · ${post.likeCount} 赞 · ${post.commentCount} 评论 · ${post.shareCount} 分享 · ${post.favoriteCount} 收藏` : ""}
            {post.platform === "wechat" ? ` · ${post.likeCount} 赞 · ${post.shareCount} 分享 · ${post.recommendCount} 推荐` : ""}
            {post.platform === "douyin" && post.profileVisits !== null ? ` · 主页访问 ${post.profileVisits}` : ""}
            {post.platform === "douyin" && post.followerGain !== null ? ` · 吸粉 ${post.followerGain}` : ""}
          </span>
        </li>)}</ol> : <p className="operations-progress__muted">暂无发布记录</p>}
        {historyPosts.length > 10 ? <button type="button" className="admin-button admin-button--secondary" onClick={() => setShowAllPosts((value) => !value)}>
          {showAllPosts ? "收起历史" : `查看全部 ${historyPosts.length} 条`}
        </button> : null}
      </section>
      {board.updates.length > 0 ? <section className="operations-progress__feed" aria-labelledby="operations-progress-feed-title">
        <h2 id="operations-progress-feed-title">最近动态</h2>
        <ol>{board.updates.map((entry) => <li key={entry.id}>
          <time dateTime={entry.publishedOn || entry.createdAt}>{formatOperationsUpdateDate(entry)}</time>
          <div><a href={`#operations-item-${entry.itemId}`}>{itemNames.get(entry.itemId) || "事项"}</a>
            <p>{entry.kind === "completed" ? "已完成 · " : ""}{entry.content}</p></div>
        </li>)}</ol>
      </section> : null}
    </> : null}
  </main>;
}
