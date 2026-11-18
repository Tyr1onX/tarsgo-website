import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  formatOperationsDate, getOperationsAttention, getOperationsBoard, getOperationsWorks,
  operationsAttentionLabel, operationsPlatformNames,
  type OperationsBoard, type OperationsItem, type OperationsWorks,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "运营作品库 | TARSGO" }]; }

const platforms = ["", "douyin", "bilibili", "wechat_video", "wechat"];

export default function OperationsWorksPage() {
  const [params, setParams] = useSearchParams();
  const platform = params.get("platform") || "";
  const tab = params.get("tab") === "posts" ? "posts" : "production";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [works, setWorks] = useState<OperationsWorks | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((value) => { if (active) setBoard(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (tab !== "posts") return;
    let active = true;
    setWorks(null);
    void getOperationsWorks(platform, page)
      .then((value) => { if (active) setWorks(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "发布记录加载失败"); });
    return () => { active = false; };
  }, [platform, page, tab]);

  const updateParams = (changes: Record<string,string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    setParams(next);
  };
  const production = useMemo(() => {
    const items = board?.items.filter((item) => item.kind === "video" || item.kind === "article") ?? [];
    return items.filter((item) =>
      (!platform || item.publications.some((target) => target.platform === platform)) &&
      (!query.trim() || `${item.title} ${item.seriesName}`.toLowerCase().includes(query.trim().toLowerCase())))
      .sort((a,b) => Number(a.status === "done") - Number(b.status === "done") ||
        Number(a.steps.every((s) => s.status === "pending")) - Number(b.steps.every((s) => s.status === "pending")) ||
        b.id - a.id);
  }, [board, platform, query]);
  const bySeries = production.reduce<Record<string,OperationsItem[]>>((grouped,item) => {
    const key = item.seriesName || "其他作品";
    (grouped[key] ??= []).push(item);
    return grouped;
  }, {});
  const pages = Math.max(1, Math.ceil((works?.total ?? 0) / (works?.pageSize ?? 18)));

  return <main className="operations-progress admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations">返回运营动态</Link>
    <header className="operations-progress__channel-head">
      <div><p className="operations-progress__muted">内容资产</p><h1>作品库</h1></div>
      {board?.canManage ? <Link className="admin-button admin-button--primary"
        to="/dashboard/workbench/operations/works/new">新建作品</Link> : null}
    </header>
    <nav className="operations-progress__filters" aria-label="作品类型">
      <button type="button" className={tab === "production" ? "is-selected" : ""} aria-pressed={tab === "production"}
        onClick={() => updateParams({tab:"",page:""})}>制作作品</button>
      <button type="button" className={tab === "posts" ? "is-selected" : ""} aria-pressed={tab === "posts"}
        onClick={() => updateParams({tab:"posts",page:""})}>平台发布记录</button>
    </nav>
    <div className="operations-progress__library-controls">
      <nav className="operations-progress__filters" aria-label="筛选平台">
        {platforms.map((key) => <button type="button" key={key}
          className={platform === key ? "is-selected" : ""} aria-pressed={platform === key}
          onClick={() => updateParams({platform:key,page:""})}>{operationsPlatformNames[key] || "全部平台"}</button>)}
      </nav>
      {tab === "production" ? <input className="operations-progress__search" value={query}
        aria-label="搜索作品或系列" placeholder="搜索作品或系列"
        onChange={(event) => setQuery(event.target.value)} /> : null}
    </div>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {tab === "production" ? <>
      {!board && !error ? <p className="operations-progress__muted">正在加载…</p> : null}
      {board && !production.length ? <p className="operations-progress__muted">当前没有匹配的作品</p> : null}
      {Object.entries(bySeries).map(([series, items]) => <section className="operations-progress__library-group" key={series}>
        <h2>{series}</h2>
        <div className="operations-progress__works-grid">
          {items.map((item) => <Link className="operations-progress__work operations-progress__work-link" key={item.id}
            to={`/dashboard/workbench/operations/works/${item.id}`}>
            <div className="operations-progress__work-body">
              <span className="operations-progress__eyebrow">{item.kind === "article" ? "图文" : "视频"} · {operationsAttentionLabel[getOperationsAttention(item)]}</span>
              <h3>{item.title}</h3>
              <div className="operations-progress__work-platforms">
                {item.publications.length ? item.publications.map((target) => <span key={target.platform}>
                  {operationsPlatformNames[target.platform]} · {target.status === "done" ? "已发布" : "待发布"}
                </span>) : <span>待确定发布平台</span>}
              </div>
              <small>{item.steps.filter((step) => step.status === "done").length} / {item.steps.length} 个环节完成</small>
              <span className="operations-progress__work-open">查看作品详情</span>
            </div>
          </Link>)}
        </div>
      </section>)}
    </> : <>
      {!works && !error ? <p className="operations-progress__muted">正在加载…</p> : null}
      {works && <div className="operations-progress__works-grid">
        {works.posts.map((post) => <article className="operations-progress__work" key={`${post.platform}:${post.externalId}`}>
          <div className="operations-progress__work-cover" aria-hidden="true">
            <span>{operationsPlatformNames[post.platform] || post.platform}</span>
            <strong>{post.mediaType === "image" ? "图文" : "作品"}</strong>
          </div>
          <div className="operations-progress__work-body">
            <span className="operations-progress__eyebrow">{operationsPlatformNames[post.platform]} · {formatOperationsDate(post.publishedAt)}</span>
            <h3>{post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a> : post.title}</h3>
            <p>{post.viewCount.toLocaleString("zh-CN")} {post.platform === "wechat" ? "人阅读" : post.mediaType === "image" ? "浏览" : "播放"}</p>
            {(post.platform === "douyin" || post.platform === "wechat") ? <div className="operations-progress__work-metrics">
              <span>{post.likeCount.toLocaleString("zh-CN")} 赞</span>
              {post.platform === "douyin" ? <span>{post.commentCount.toLocaleString("zh-CN")} 评论</span> : null}
              <span>{post.shareCount.toLocaleString("zh-CN")} 分享</span>
              {post.platform === "wechat" ? <span>{post.recommendCount.toLocaleString("zh-CN")} 推荐</span> : null}
            </div> : null}
          </div>
        </article>)}
      </div>}
      {works && works.total === 0 ? <p className="operations-progress__muted">暂无平台发布记录</p> : null}
      {works && pages > 1 ? <nav className="operations-progress__pagination" aria-label="作品分页">
        <button type="button" disabled={page <= 1} onClick={() => updateParams({page:String(page-1)})}>上一页</button>
        <span>{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => updateParams({page:String(page+1)})}>下一页</button>
      </nav> : null}
    </>}
  </main>;
}