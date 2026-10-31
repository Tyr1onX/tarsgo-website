import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from "react-router";

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
import { clearOtherCommunityLists, getCommunityListSnapshot, rememberCommunityList } from "~/lib/community-list-cache";
import "./community.css";

export function meta() {
  return [{ title: "吉甲社区 | TARSGO" }];
}

const PAGE_SIZE = 20;
type CommunityRetry = { kind: "first" } | { kind: "more" } | { kind: "reaction"; post: CommunityPost; reaction: "like" | "bookmark" };

function readCategory(value: string | null): CommunityCategory | "" {
  return COMMUNITY_CATEGORIES.some((item) => item.id === value) ? value as CommunityCategory : "";
}

function readSort(value: string | null): CommunitySort {
  return value === "hot" ? "hot" : "latest";
}

export default function DashboardIndex() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const displayName = getAuthUserName(currentUser);
  const sort = readSort(searchParams.get("sort"));
  const category = readCategory(searchParams.get("category"));
  const query = searchParams.get("q")?.trim() ?? "";
  const savedOnly = searchParams.get("saved") === "true";
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const cacheKey = useMemo(() => JSON.stringify([currentUser.id, sort, category, query, savedOnly]), [currentUser.id, sort, category, query, savedOnly]);
  const [queryDraft, setQueryDraft] = useState(query);
  const [composerOpen, setComposerOpen] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [hotPosts, setHotPosts] = useState<CommunityPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<CommunityRetry | null>(null);
  const [busyPostId, setBusyPostId] = useState<number | null>(null);
  const requestRef = useRef(0);

  useEffect(() => { setQueryDraft(query); }, [query]);

  const loadFirstPage = useCallback(async (keepCachedPosts = false) => {
    const requestID = ++requestRef.current;
    const cached = getCommunityListSnapshot(cacheKey);
    if (keepCachedPosts && cached) {
      setPosts(cached.posts);
      setPage(cached.page);
      setHasMore(cached.hasMore);
      setLoading(true);
    } else {
      setPosts([]);
      setPage(1);
      setHasMore(false);
      setLoading(true);
    }
    setError("");
    setRetry(null);

    try {
      const result = await communityClient.list({ sort, category, q: query, saved: savedOnly, page: 1, pageSize: PAGE_SIZE });
      if (requestRef.current !== requestID) return;
      const postsToKeep = keepCachedPosts && cached
        ? [...result.items, ...cached.posts.filter((post) => !result.items.some((fresh) => fresh.id === post.id))]
        : result.items;
      const nextPage = keepCachedPosts && cached ? cached.page : 1;
      const nextHasMore = result.hasMore || (nextPage > 1 && Boolean(cached?.hasMore));
      setPosts(postsToKeep);
      setHasMore(nextHasMore);
      setPage(nextPage);
      rememberCommunityList(cacheKey, { posts: postsToKeep, page: nextPage, hasMore: nextHasMore });
    } catch (cause) {
      if (requestRef.current !== requestID) return;
      setError(cause instanceof Error ? cause.message : "社区内容暂时无法读取。");
      setRetry({ kind: "first" });
      if (!keepCachedPosts || !cached) {
        setPosts([]);
        setHasMore(false);
      }
    } finally {
      if (requestRef.current === requestID) setLoading(false);
    }
  }, [cacheKey, sort, category, query, savedOnly]);

  useEffect(() => {
    void loadFirstPage(true);
  }, [loadFirstPage]);

  useEffect(() => {
    let active = true;
    void communityClient.hot(5).then((items) => { if (active) setHotPosts(items); }).catch(() => { if (active) setHotPosts([]); });
    return () => { active = false; };
  }, []);

  function updateFilters(next: Partial<{ sort: CommunitySort; category: CommunityCategory | ""; q: string; saved: boolean }>) {
    setError("");
    setRetry(null);
    const params = new URLSearchParams(searchParams);
    if (next.sort !== undefined) next.sort === "latest" ? params.delete("sort") : params.set("sort", next.sort);
    if (next.category !== undefined) next.category ? params.set("category", next.category) : params.delete("category");
    if (next.q !== undefined) next.q.trim() ? params.set("q", next.q.trim()) : params.delete("q");
    if (next.saved !== undefined) next.saved ? params.set("saved", "true") : params.delete("saved");
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }

  async function loadNextPage() {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    const requestID = requestRef.current;
    setLoadingMore(true);
    setError("");
    setRetry(null);
    try {
      const result = await communityClient.list({ sort, category, q: query, saved: savedOnly, page: nextPage, pageSize: PAGE_SIZE });
      if (requestRef.current !== requestID) return;
      setPosts((current) => {
        const existing = new Set(current.map((post) => post.id));
        const nextPosts = [...current, ...result.items.filter((post) => !existing.has(post.id))];
        rememberCommunityList(cacheKey, { posts: nextPosts, page: nextPage, hasMore: result.hasMore });
        return nextPosts;
      });
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch (cause) {
      if (requestRef.current !== requestID) return;
      setError(cause instanceof Error ? cause.message : "加载更多帖子失败。");
      setRetry({ kind: "more" });
    } finally {
      setLoadingMore(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateFilters({ q: queryDraft });
  }

  async function publish(input: { category: CommunityCategory; title: string; body: string; files: File[] }) {
    const created = await communityClient.create(input);
    setComposerOpen(false);
    await loadFirstPage(true);
    navigate(communityPostHref(created.post.id), { state: { communityReturnTo: returnTo } });
  }

  async function toggleReaction(post: CommunityPost, kind: "like" | "bookmark") {
    if (busyPostId !== null) return;
    const wasActive = kind === "like" ? post.likedByMe : post.savedByMe;
    const active = !wasActive;
    const previousPosts = posts;
    const optimisticPosts = savedOnly && kind === "bookmark" && !active
      ? posts.filter((item) => item.id !== post.id)
      : posts.map((item) => item.id === post.id ? {
        ...item,
        likedByMe: kind === "like" ? active : item.likedByMe,
        savedByMe: kind === "bookmark" ? active : item.savedByMe,
        likeCount: kind === "like" ? Math.max(0, item.likeCount + (active ? 1 : -1)) : item.likeCount,
      } : item);
    setBusyPostId(post.id);
    setError("");
    setRetry(null);
    setPosts(optimisticPosts);
    rememberCommunityList(cacheKey, { posts: optimisticPosts, page, hasMore });
    try {
      const state = kind === "like"
        ? await communityClient.like(post.id, active)
        : await communityClient.bookmark(post.id, active);
      if (kind === "bookmark") clearOtherCommunityLists(cacheKey);
      const confirmed = optimisticPosts.map((item) => item.id === post.id ? {
        ...item,
        likedByMe: kind === "like" ? state.active : item.likedByMe,
        savedByMe: kind === "bookmark" ? state.active : item.savedByMe,
        likeCount: state.likeCount,
      } : item);
      setPosts(confirmed);
      rememberCommunityList(cacheKey, { posts: confirmed, page, hasMore });
    } catch (cause) {
      setPosts(previousPosts);
      rememberCommunityList(cacheKey, { posts: previousPosts, page, hasMore });
      setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试。");
      setRetry({ kind: "reaction", post, reaction: kind });
    } finally {
      setBusyPostId(null);
    }
  }

  function retryFailedOperation() {
    if (!retry) return;
    const failed = retry;
    setRetry(null);
    if (failed.kind === "first") void loadFirstPage(true);
    if (failed.kind === "more") void loadNextPage();
    if (failed.kind === "reaction") void toggleReaction(failed.post, failed.reaction);
  }

  const shownSort: CommunitySort = savedOnly ? "latest" : sort;

  return <section className="admin-design community-page" aria-labelledby="community-title">
    <header className="community-header">
      <div>
        <p className="community-eyebrow">Jijia · Team</p>
        <h1 id="community-title">吉甲社区</h1>
        <p>你好，{displayName}</p>
      </div>
      <button className="community-button community-button--primary community-header__compose" type="button" onClick={() => setComposerOpen((open) => !open)} aria-expanded={composerOpen} aria-controls="community-composer">
        <span aria-hidden="true">＋</span> 发布帖子
      </button>
    </header>

    {composerOpen ? <CommunityComposer key={currentUser.id} id="community-composer" accountId={currentUser.id} onCancel={() => setComposerOpen(false)} onPublish={publish} /> : null}

    <div className="community-layout">
      <main className="community-feed" aria-label="社区帖子">
        <div className="community-feed__toolbar">
          <div className="community-tabs" role="group" aria-label="浏览帖子">
            <button type="button" aria-pressed={!savedOnly && shownSort === "latest"} onClick={() => updateFilters({ sort: "latest", saved: false })}>最新</button>
            <button type="button" aria-pressed={!savedOnly && shownSort === "hot"} onClick={() => updateFilters({ sort: "hot", saved: false })}>热门</button>
            <button type="button" aria-pressed={savedOnly} onClick={() => updateFilters({ saved: true })}>我的收藏</button>
          </div>
          <form className="community-search" onSubmit={submitSearch} role="search">
            <label className="sr-only" htmlFor="community-search">搜索帖子</label>
            <input id="community-search" type="search" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="搜索帖子" maxLength={100} />
            {queryDraft ? <button type="button" className="community-search__clear" aria-label="清除搜索" onClick={() => { setQueryDraft(""); updateFilters({ q: "" }); }}>×</button> : null}
            <button type="submit" className="community-search__submit" aria-label="搜索"><SearchIcon /></button>
          </form>
        </div>

        <div className="community-category-row" aria-label="帖子分类">
          <button type="button" aria-pressed={!category} className={!category ? "is-active" : ""} onClick={() => updateFilters({ category: "" })}>全部</button>
          {COMMUNITY_CATEGORIES.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} className={category === item.id ? "is-active" : ""} onClick={() => updateFilters({ category: item.id })}>{item.label}</button>)}
        </div>

        {error ? <p className="community-state community-state--error" role="alert">{error}{retry ? <button type="button" className="community-inline-retry" onClick={retryFailedOperation}>重试</button> : null}</p> : null}
        {loading && posts.length === 0 ? <p className="community-state" role="status">正在加载社区…</p> : posts.length ? <>
          {loading ? <p className="community-refresh-status" role="status">正在同步最新内容</p> : null}
          <div className="community-post-list">
            {posts.map((post) => <CommunityPostCard key={post.id} post={post} busy={busyPostId === post.id} onLike={(item) => void toggleReaction(item, "like")} onBookmark={(item) => void toggleReaction(item, "bookmark")} />)}
          </div>
        </> : !loading ? <div className="community-state community-state--empty">
          <span aria-hidden="true">✳</span>
          <strong>{query || category ? "没有找到相关帖子" : savedOnly ? "还没有收藏的帖子" : "社区刚刚开始"}</strong>
          <p>{query || category ? "试试其他关键词或分类。" : savedOnly ? "收藏的讨论会出现在这里。" : "分享一次实践、一个进展，或一个值得讨论的问题。"}</p>
          {query || category || savedOnly ? <button className="community-button" type="button" onClick={() => { setQueryDraft(""); updateFilters({ q: "", category: "", saved: false, sort: "latest" }); }}>清除筛选</button> : <button className="community-button community-button--primary" type="button" onClick={() => setComposerOpen(true)}>发布第一条帖子</button>}
        </div> : null}
        {hasMore && !loading ? <button type="button" className="community-load-more" onClick={() => void loadNextPage()} disabled={loadingMore}>{loadingMore ? "正在加载…" : "加载更多"}</button> : null}
        {loadingMore ? <p className="community-load-more__status" role="status">正在加载更多讨论…</p> : null}
      </main>

      <aside className="community-rail" aria-label="社区浏览">
        <section className="community-rail-card">
          <div className="community-rail-card__heading"><h2>热门讨论</h2><button type="button" onClick={() => updateFilters({ sort: "hot", saved: false })}>查看全部</button></div>
          {hotPosts.length ? <ol className="community-hot-list">{hotPosts.map((post, index) => <li key={post.id}><span>{String(index + 1).padStart(2, "0")}</span><Link to={communityPostHref(post.id)} state={{ communityReturnTo: returnTo }}>{post.title}</Link></li>)}</ol> : <p className="community-rail-empty">暂时没有热门讨论</p>}
        </section>
        <section className="community-rail-card">
          <div className="community-rail-card__heading"><h2>浏览分类</h2></div>
          <ul className="community-rail-categories">{COMMUNITY_CATEGORIES.map((item) => <li key={item.id}><button type="button" aria-pressed={category === item.id} onClick={() => updateFilters({ category: item.id, saved: false })}><span>{item.label}</span><span aria-hidden="true">↗</span></button></li>)}</ul>
        </section>
        <footer className="community-rail-footer"><CommunityAvatar name="吉甲大师" size="small" /><span>吉甲大师 · 机器人战队</span></footer>
      </aside>
    </div>
  </section>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4.2 4.2" /></svg>;
}
