import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  formatOperationsDate, getOperationsWorks, type OperationsWorks,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "运营作品库 | TARSGO" }]; }

const platforms = [
  ["", "全部平台"], ["douyin", "抖音"], ["bilibili", "B站"], ["wechat", "公众号"],
] as const;
const platformNames: Record<string, string> = { douyin: "抖音", bilibili: "B站", wechat: "公众号" };

export default function OperationsWorksPage() {
  const [params, setParams] = useSearchParams();
  const platform = params.get("platform") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const tab = params.get("tab") === "archive" ? "archive" : "posts";
  const [works, setWorks] = useState<OperationsWorks | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setWorks(null);
    void getOperationsWorks(platform, page)
      .then((result) => { if (active) { setWorks(result); setError(""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "作品加载失败"); });
    return () => { active = false; };
  }, [platform, page]);

  const setFilter = (nextPlatform: string) => {
    const next = new URLSearchParams();
    if (nextPlatform) next.set("platform", nextPlatform);
    if (tab === "archive") next.set("tab", tab);
    setParams(next);
  };
  const total = tab === "posts" ? works?.total ?? 0 : works?.archiveTotal ?? 0;
  const pageCount = works ? Math.max(1, Math.ceil(total / works.pageSize)) : 1;
  const setPage = (nextPage: number) => {
    const query = new URLSearchParams(params);
    query.set("page", String(nextPage));
    setParams(query);
  };

  return <main className="operations-progress admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations">返回运营总览</Link>
    <header className="operations-progress__channel-head">
      <div><p className="operations-progress__muted">运营成果</p><h1>作品库</h1></div>
    </header>
    <div className="operations-progress__library-controls">
      <nav aria-label="作品分类" className="operations-progress__filters">
        {platforms.map(([value, label]) => <button type="button" key={value}
          className={platform === value ? "is-selected" : ""} aria-pressed={platform === value}
          onClick={() => setFilter(value)}>{label}</button>)}
      </nav>
      <div className="operations-progress__filters" role="group" aria-label="作品来源">
        <button type="button" aria-pressed={tab === "posts"} className={tab === "posts" ? "is-selected" : ""}
          onClick={() => { const query = new URLSearchParams(params); query.delete("tab"); query.delete("page"); setParams(query); }}>已发布作品</button>
        <button type="button" aria-pressed={tab === "archive"} className={tab === "archive" ? "is-selected" : ""}
          onClick={() => { const query = new URLSearchParams(params); query.set("tab", "archive"); query.delete("page"); setParams(query); }}>制作档案</button>
      </div>
    </div>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!works && !error ? <p className="operations-progress__muted">正在加载…</p> : null}
    {works ? <>
      <p className="operations-progress__muted">{total} 条{tab === "posts" ? "平台发布记录" : "内部制作档案"}</p>
      <div className="operations-progress__works-grid">
        {tab === "posts" ? works.posts.map((post) => <article className="operations-progress__work" key={`${post.platform}:${post.externalId}`}>
          <div className="operations-progress__work-cover" aria-hidden="true">
            <span>{platformNames[post.platform] || post.platform}</span><strong>作品</strong>
          </div>
          <div className="operations-progress__work-body">
            <span className="operations-progress__eyebrow">{platformNames[post.platform] || post.platform} · {formatOperationsDate(post.publishedAt)}</span>
            <h2>{post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a> : post.title}</h2>
            <p>{post.viewCount.toLocaleString("zh-CN")} {post.platform === "wechat" ? "人阅读" : post.mediaType === "image" ? "浏览" : "播放"}</p>
            {post.platform === "douyin" && post.mediaType ? <div className="operations-progress__work-metrics">
              <span>{post.likeCount.toLocaleString("zh-CN")} 赞</span>
              <span>{post.commentCount.toLocaleString("zh-CN")} 评论</span>
              <span>{post.shareCount.toLocaleString("zh-CN")} 分享</span>
              <span>{post.favoriteCount.toLocaleString("zh-CN")} 收藏</span>
              {post.profileVisits !== null ? <span>{post.profileVisits} 主页访问</span> : null}
              {post.followerGain !== null ? <span>{post.followerGain} 吸粉</span> : null}
            </div> : null}
            {post.platform === "wechat" ? <div className="operations-progress__work-metrics">
              <span>{post.likeCount.toLocaleString("zh-CN")} 赞</span>
              <span>{post.shareCount.toLocaleString("zh-CN")} 分享</span>
              <span>{post.recommendCount.toLocaleString("zh-CN")} 推荐</span>
            </div> : null}
          </div>
        </article>) : works.archives.map((issue) => <article className="operations-progress__work" key={issue.id}>
          <div className="operations-progress__work-cover operations-progress__work-cover--archive" aria-hidden="true">
            <span>{platformNames[issue.platform] || issue.platform}</span><strong>制作</strong>
          </div>
          <div className="operations-progress__work-body">
            <span className="operations-progress__eyebrow">{formatOperationsDate(issue.completedAt)}</span>
            <h2>{issue.title}</h2>
            <p>{issue.publicationUrl ? <a href={issue.publicationUrl} target="_blank" rel="noopener noreferrer">查看发布链接</a>
              : <span className="operations-progress__muted">制作记录已归档</span>}</p>
            {issue.channelId ? <Link to={`/dashboard/workbench/operations/channels/${issue.channelId}#operations-item-${issue.id}`}>查看制作过程</Link> : null}
          </div>
        </article>)}
      </div>
      {total === 0 ? <p className="operations-progress__muted">暂无记录</p> : null}
      {pageCount > 1 ? <nav className="operations-progress__pagination" aria-label="作品分页">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page-1)}>上一页</button>
        <span>{page} / {pageCount}</span>
        <button type="button" disabled={page >= pageCount} onClick={() => setPage(page+1)}>下一页</button>
      </nav> : null}
    </> : null}
  </main>;
}