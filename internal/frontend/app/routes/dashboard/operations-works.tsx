import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  formatOperationsDate, getOperationsAttention, getOperationsBoard, getOperationsWorks,
  operationsAttentionLabel, operationsPlatformNames,
  type OperationsBoard, type OperationsWorks,
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
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

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
    void getOperationsWorks(platform, page, search)
      .then((value) => { if (active) setWorks(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "发布记录加载失败"); });
    return () => { active = false; };
  }, [platform, page, tab, search]);

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
      (!query.trim() || `${item.title} ${item.seriesName} ${item.leadName} ${item.steps.map((step) => step.assigneeName).join(" ")}`
        .toLowerCase().includes(query.trim().toLowerCase())))
      .sort((a,b) => Number(a.status === "done") - Number(b.status === "done") ||
        Number(a.steps.every((s) => s.status === "pending")) - Number(b.steps.every((s) => s.status === "pending")) ||
        b.id - a.id);
  }, [board, platform, query]);
  const pages = Math.max(1, Math.ceil((works?.total ?? 0) / (works?.pageSize ?? 18)));

  return <main className="operations-progress admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations">返回运营动态</Link>
    <header className="operations-progress__channel-head">
      <div><h1>作品检索</h1></div>
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
      <input className="operations-progress__search" type="search" value={query}
        aria-label="搜索作品" placeholder={tab === "posts" ? "搜索发布标题" : "搜索标题、系列或负责人"}
        onChange={(event) => {
          setQuery(event.target.value);
          if (page !== 1) updateParams({ page: "" });
        }} />
    </div>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {tab === "production" ? <>
      {!board && !error ? <p className="operations-progress__muted">正在加载…</p> : null}
      {board ? <p className="operations-progress__muted">找到 {production.length} 条作品</p> : null}
      {board && !production.length ? <p className="operations-progress__muted">没有匹配的作品</p> : null}
      {board && production.length > 0 ? <div className="operations-progress__library-list">
        {production.map((item) => <Link className="operations-progress__library-row" key={item.id}
          to={"/dashboard/workbench/operations/works/" + item.id}>
          <div className="operations-progress__library-main">
            <strong>{item.title}</strong>
            <small>{item.kind === "article" ? "图文" : "视频"}{item.seriesName ? " · " + item.seriesName : ""}
              {item.leadName ? " · " + item.leadName : ""}</small>
          </div>
          <span className="operations-progress__library-status">{operationsAttentionLabel[getOperationsAttention(item)]}</span>
          <span className="operations-progress__library-platforms">
            {item.publications.map((target) => operationsPlatformNames[target.platform]).join(" / ") || "未指定平台"}
          </span>
          <span className="operations-progress__library-progress">
            {item.steps.filter((step) => step.status === "done").length}/{item.steps.length} 环节
          </span>
          <span className="operations-progress__library-open">查看</span>
        </Link>)}
      </div> : null}
    </> : <>
      {!works && !error ? <p className="operations-progress__muted">正在加载…</p> : null}
      {works ? <p className="operations-progress__muted">找到 {works.total} 条发布记录</p> : null}
      {works && works.total === 0 ? <p className="operations-progress__muted">没有匹配的发布记录</p> : null}
      {works && works.posts.length > 0 ? <div className="operations-progress__library-list">
        {works.posts.map((post) => <article className="operations-progress__library-row operations-progress__library-row--post" key={post.platform + ":" + post.externalId}>
          <div className="operations-progress__library-main">
            {post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a>
              : <strong>{post.title}</strong>}
            <small>{operationsPlatformNames[post.platform]} · {formatOperationsDate(post.publishedAt)}</small>
          </div>
          <span className="operations-progress__library-platforms">{post.mediaType === "image" ? "图文" : "视频"}</span>
          <span className="operations-progress__library-progress">
            {post.viewCount.toLocaleString("zh-CN")} {post.platform === "wechat" ? "阅读" : post.mediaType === "image" ? "浏览" : "播放"}
          </span>
        </article>)}
      </div> : null}
      {works && pages > 1 ? <nav className="operations-progress__pagination" aria-label="作品分页">
        <button type="button" disabled={page <= 1} onClick={() => updateParams({page:String(page-1)})}>上一页</button>
        <span>{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => updateParams({page:String(page+1)})}>下一页</button>
      </nav> : null}
    </>}
  </main>;
}
