import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext } from "react-router";

import { CommunityComposer } from "~/components/community-composer";
import { CommunityAvatar, CommunityPostCard } from "~/components/community-post-card";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { getAuthUserName } from "~/lib/auth-client";
import {
  COMMUNITY_CATEGORIES,
  communityClient,
  communityPostHref,
  type CommunityCategory,
  type CommunityPost,
  type CommunitySort,
} from "~/lib/community-client";
import "./community.css";

export function meta() {
  return [{ title: "吉甲社区 | TARSGO" }];
}

const PAGE_SIZE = 20;

export default function DashboardIndex() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const navigate = useNavigate();
  const displayName = getAuthUserName(currentUser);
  const [sort, setSort] = useState<CommunitySort>("latest");
  const [category, setCategory] = useState<CommunityCategory | "">("");
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [hotPosts, setHotPosts] = useState<CommunityPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [busyPostId, setBusyPostId] = useState<number | null>(null);
  const requestRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const requestID = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const result = await communityClient.list({ sort, category, q: query, saved: savedOnly, page: 1, pageSize: PAGE_SIZE });
      if (requestRef.current !== requestID) return;
      setPosts(result.items);
      setHasMore(result.hasMore);
      setPage(1);
    } catch (cause) {
      if (requestRef.current !== requestID) return;
      setError(cause instanceof Error ? cause.message : "社区内容暂时无法读取。");
      setPosts([]);
      setHasMore(false);
    } finally {
      if (requestRef.current === requestID) setLoading(false);
    }
  }, [sort, category, query, savedOnly]);

  useEffect(() => { void loadFirstPage(); }, [loadFirstPage]);
  useEffect(() => {
    let active = true;
    void communityClient.hot(5).then((items) => { if (active) setHotPosts(items); }).catch(() => { if (active) setHotPosts([]); });
    return () => { active = false; };
  }, []);

  async function loadNextPage() {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    const requestID = requestRef.current;
    setLoadingMore(true);
    try {
      const result = await communityClient.list({ sort, category, q: query, saved: savedOnly, page: nextPage, pageSize: PAGE_SIZE });
      if (requestRef.current !== requestID) return;
      setPosts((current) => [...current, ...result.items]);
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch (cause) {
      if (requestRef.current !== requestID) return;
      setError(cause instanceof Error ? cause.message : "加载更多帖子失败。");
    } finally {
      setLoadingMore(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(queryDraft.trim());
  }

  async function publish(input: { category: CommunityCategory; title: string; body: string; files: File[] }) {
    const created = await communityClient.create(input);
    setComposerOpen(false);
    await loadFirstPage();
    navigate(communityPostHref(created.post.id));
  }

  async function toggleReaction(post: CommunityPost, kind: "like" | "bookmark") {
    if (busyPostId !== null) return;
    setBusyPostId(post.id);
    const active = kind === "like" ? !post.likedByMe : !post.savedByMe;
    try {
      const state = kind === "like"
        ? await communityClient.like(post.id, active)
        : await communityClient.bookmark(post.id, active);
      setPosts((current) => current.map((item) => item.id === post.id ? {
        ...item,
        likedByMe: kind === "like" ? state.active : item.likedByMe,
        savedByMe: kind === "bookmark" ? state.active : item.savedByMe,
        likeCount: state.likeCount,
      } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
    } finally {
      setBusyPostId(null);
    }
  }

  return <section className="admin-design community-page" aria-labelledby="community-title">
    <header className="community-header">
      <div>
        <p className="community-eyebrow">Jijia · Team</p>
        <h1 id="community-title">吉甲社区</h1>
        <p>你好，{displayName}。分享进展，也看看大家正在做什么。</p>
      </div>
      <button className="community-button community-button--primary community-header__compose" type="button" onClick={() => setComposerOpen((open) => !open)}>
        <span aria-hidden="true">＋</span> 发布帖子
      </button>
    </header>

    {composerOpen ? <CommunityComposer onCancel={() => setComposerOpen(false)} onPublish={publish} /> : null}

    <div className="community-layout">
      <main className="community-feed" aria-label="社区帖子">
        <div className="community-feed__toolbar">
          <div className="community-tabs" role="group" aria-label="帖子排序">
            <button type="button" aria-pressed={sort === "latest"} onClick={() => setSort("latest")}>最新</button>
            <button type="button" aria-pressed={sort === "hot"} onClick={() => setSort("hot")}>热门</button>
          </div>
          <form className="community-search" onSubmit={submitSearch} role="search">
            <label className="sr-only" htmlFor="community-search">搜索帖子</label>
            <input id="community-search" type="search" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="搜索帖子" maxLength={100} />
            <button type="submit" aria-label="搜索">⌕</button>
          </form>
        </div>

        <div className="community-category-row" aria-label="帖子分类">
          <button type="button" aria-pressed={!category} className={!category ? "is-active" : ""} onClick={() => setCategory("")}>全部</button>
          {COMMUNITY_CATEGORIES.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} className={category === item.id ? "is-active" : ""} onClick={() => setCategory(item.id)}>{item.label}</button>)}
          <button type="button" aria-pressed={savedOnly} className={`community-saved-filter${savedOnly ? " is-active" : ""}`} onClick={() => setSavedOnly((value) => !value)}>{savedOnly ? "已收藏" : "我的收藏"}</button>
        </div>

        {error ? <p className="community-state community-state--error" role="alert">{error}</p> : null}
        {loading ? <p className="community-state" role="status">正在加载社区…</p> : posts.length ? <div className="community-post-list">
          {posts.map((post) => <CommunityPostCard key={post.id} post={post} busy={busyPostId === post.id} onLike={(item) => void toggleReaction(item, "like")} onBookmark={(item) => void toggleReaction(item, "bookmark")} />)}
        </div> : <div className="community-state community-state--empty"><span aria-hidden="true">✳</span><strong>{savedOnly ? "还没有收藏的帖子" : query || category ? "没有找到相关帖子" : "社区刚刚开始"}</strong><p>{savedOnly ? "看到感兴趣的讨论，可以收藏起来。" : "分享一次实践、一个进展，或一个值得讨论的问题。"}</p>{!savedOnly ? <button className="community-button community-button--primary" type="button" onClick={() => setComposerOpen(true)}>发布第一条帖子</button> : null}</div>}
        {hasMore && !loading ? <button type="button" className="community-load-more" onClick={() => void loadNextPage()} disabled={loadingMore}>{loadingMore ? "加载中…" : "加载更多"}</button> : null}
      </main>

      <aside className="community-rail" aria-label="社区导航">
        <section className="community-rail-card community-notice">
          <p className="community-rail-card__eyebrow">COMMUNITY</p>
          <h2>把想法做成作品</h2>
          <p>记录项目进展、交流技术经验，也分享战队里的日常。</p>
        </section>
        <section className="community-rail-card">
          <div className="community-rail-card__heading"><h2>热门话题</h2><button type="button" onClick={() => setSort("hot")}>更多</button></div>
          {hotPosts.length ? <ol className="community-hot-list">{hotPosts.map((post, index) => <li key={post.id}><span>{String(index + 1).padStart(2, "0")}</span><Link to={communityPostHref(post.id)}>{post.title}</Link></li>)}</ol> : <p className="community-rail-empty">还没有热门话题</p>}
        </section>
        <section className="community-rail-card">
          <div className="community-rail-card__heading"><h2>分类</h2></div>
          <ul className="community-rail-categories">{COMMUNITY_CATEGORIES.map((item) => <li key={item.id}><button type="button" onClick={() => { setCategory(item.id); setSavedOnly(false); }}><span>{item.label}</span><span aria-hidden="true">↗</span></button></li>)}</ul>
        </section>
        <footer className="community-rail-footer"><CommunityAvatar name="吉甲大师" size="small" /><span>吉甲大师 · 机器人战队</span></footer>
      </aside>
    </div>
  </section>;
}
