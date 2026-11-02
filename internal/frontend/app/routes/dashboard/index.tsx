import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useOutletContext, useSearchParams } from "react-router";

import { CommunityComposer } from "~/components/community-composer";
import { CommunityEditorDialog } from "~/components/community-editor-dialog";
import { CommunityGrowthBar } from "~/components/community-growth";
import { CommunityIcon } from "~/components/community-icons";
import { CommunityPostCard } from "~/components/community-post-card";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  COMMUNITY_CATEGORIES,
  communityClient,
  communityPostHref,
  type CommunityPost,
  type CommunityGrowthProfile,
  type CommunityCategory,
  type CommunitySort,
} from "~/lib/community-client";
import { clearCommunityLists, getCommunityListSnapshot, rememberCommunityList } from "~/lib/community-list-cache";
import "./community.css";

export function meta() {
  return [{ title: "吉甲社区 | TARSGO" }];
}

const PAGE_SIZE = 20;
type CommunityRetry = { kind: "first" } | { kind: "more" };

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
  const sort = readSort(searchParams.get("sort"));
  const category = readCategory(searchParams.get("category"));
  const query = searchParams.get("q")?.trim() ?? "";
  const savedOnly = searchParams.get("saved") === "true";
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const cacheKey = useMemo(() => JSON.stringify([currentUser.id, sort, category, query, savedOnly]), [currentUser.id, sort, category, query, savedOnly]);
  const [loadedCacheKey, setLoadedCacheKey] = useState(cacheKey);
  const [queryDraft, setQueryDraft] = useState(query);
  const [composerOpen, setComposerOpen] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>(() => getCommunityListSnapshot(cacheKey)?.posts ?? []);
  const [growthProfile, setGrowthProfile] = useState<CommunityGrowthProfile | null>(null);
  const [page, setPage] = useState(() => getCommunityListSnapshot(cacheKey)?.page ?? 1);
  const [hasMore, setHasMore] = useState(() => getCommunityListSnapshot(cacheKey)?.hasMore ?? false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<CommunityRetry | null>(null);
  const requestRef = useRef(0);
  const closeComposer = useCallback(() => setComposerOpen(false), []);
  const cachedList = getCommunityListSnapshot(cacheKey);
  const cacheMatchesLoadedState = loadedCacheKey === cacheKey;
  const visiblePosts = cacheMatchesLoadedState ? posts : cachedList?.posts ?? [];
  const visibleLoading = loading || !cacheMatchesLoadedState;
  const visibleHasMore = cacheMatchesLoadedState ? hasMore : cachedList?.hasMore ?? false;

  useEffect(() => { setQueryDraft(query); }, [query]);

  const loadFirstPage = useCallback(async (keepCachedPosts = false) => {
    const requestID = ++requestRef.current;
    const cached = getCommunityListSnapshot(cacheKey);
    setLoadedCacheKey(cacheKey);
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
      const result = await communityClient.list({ sort, category, q: query, saved: savedOnly, page: 1, pageSize: PAGE_SIZE, includeGrowth: true });
      if (requestRef.current !== requestID) return;
      setGrowthProfile(result.growthProfile ?? null);
      const postsToKeep = keepCachedPosts && cached
        ? [...result.items, ...cached.posts.filter((post) => !result.items.some((fresh) => fresh.id === post.id))]
        : result.items;
      const nextPage = keepCachedPosts && cached ? cached.page : 1;
      const nextHasMore = nextPage > 1 && cached ? cached.hasMore : result.hasMore;
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
    return () => { requestRef.current += 1; };
  }, [loadFirstPage]);

  function updateFilters(next: Partial<{ sort: CommunitySort; category: CommunityCategory | ""; q: string; saved: boolean }>) {
    setError("");
    setRetry(null);
    const params = new URLSearchParams(searchParams);
    if (next.sort !== undefined) next.sort === "latest" ? params.delete("sort") : params.set("sort", next.sort);
    if (next.category !== undefined) next.category ? params.set("category", next.category) : params.delete("category");
    if (next.q !== undefined) next.q.trim() ? params.set("q", next.q.trim()) : params.delete("q");
    if (next.saved !== undefined) next.saved ? params.set("saved", "true") : params.delete("saved");
    if (params.toString() === searchParams.toString()) return;
    setPosts([]);
    setPage(1);
    setHasMore(false);
    setLoading(true);
    setSearchParams(params, { replace: true });
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

  async function publish(input: { category: CommunityCategory; title: string; body: string; files: File[]; uploadTokens: string[] }) {
    const created = await communityClient.create(input);
    clearCommunityLists();
    closeComposer();
    navigate(communityPostHref(created.post.id), { state: { communityReturnTo: returnTo } });
  }

  function retryFailedOperation() {
    if (!retry) return;
    const failed = retry;
    setRetry(null);
    if (failed.kind === "first") void loadFirstPage(true);
    if (failed.kind === "more") void loadNextPage();
  }

  const shownSort: CommunitySort = savedOnly ? "latest" : sort;

  return <section className="admin-design community-page" aria-labelledby="community-title">
    <header className="community-header">
      <h1 id="community-title">吉甲社区</h1>
      <div className="community-header__actions">
        <form className="community-search" onSubmit={submitSearch} role="search" aria-label="搜索社区帖子">
          <label className="sr-only" htmlFor="community-search">搜索帖子</label>
          <input id="community-search" type="search" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="搜索帖子" maxLength={100} />
          {queryDraft ? <button type="button" className="community-search__clear" aria-label="清除搜索" onClick={() => { setQueryDraft(""); updateFilters({ q: "" }); }}><CommunityIcon name="x" /></button> : null}
          <button type="submit" className="community-search__submit" aria-label="搜索"><CommunityIcon name="search" /></button>
        </form>
        <button className="community-button community-button--primary community-header__compose" type="button" onClick={() => setComposerOpen(true)} aria-expanded={composerOpen} aria-haspopup="dialog" aria-controls="community-composer">
          <CommunityIcon name="plus" /> 发布帖子
        </button>
      </div>
    </header>

    <CommunityGrowthBar profile={growthProfile} onProfileChange={setGrowthProfile} loading={loading} onRetry={() => void loadFirstPage(true)} />

    {composerOpen ? <CommunityEditorDialog labelledBy="community-composer-title" onClose={closeComposer}><CommunityComposer key={currentUser.id} id="community-composer" accountId={currentUser.id} onCancel={closeComposer} onPublish={publish} /></CommunityEditorDialog> : null}

    <div className="community-layout">
      <main className="community-feed" aria-label="社区帖子">
        <div className="community-feed__toolbar">
          <div className="community-tabs" role="group" aria-label="浏览帖子">
            <button type="button" aria-pressed={!savedOnly && shownSort === "latest"} onClick={() => updateFilters({ sort: "latest", saved: false })}>最新</button>
            <button type="button" aria-pressed={!savedOnly && shownSort === "hot"} onClick={() => updateFilters({ sort: "hot", saved: false })}>热门</button>
            <button type="button" aria-pressed={savedOnly} onClick={() => updateFilters({ saved: true })}>我的收藏</button>
          </div>
        </div>

        <div className="community-category-row" aria-label="帖子分类">
          <button type="button" aria-pressed={!category} className={!category ? "is-active" : ""} onClick={() => updateFilters({ category: "" })}>全部</button>
          {COMMUNITY_CATEGORIES.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} className={category === item.id ? "is-active" : ""} onClick={() => updateFilters({ category: item.id })}>{item.label}</button>)}
        </div>

        {error ? <p className="community-state community-state--error" role="alert">{error}{retry ? <button type="button" className="community-inline-retry" onClick={retryFailedOperation}>重试</button> : null}</p> : null}
        {visibleLoading && visiblePosts.length === 0 ? <p className="community-state community-state--loading" role="status"><CommunityIcon name="loader" />正在加载社区…</p> : visiblePosts.length ? <>
          {visibleLoading ? <p className="community-refresh-status" role="status">正在同步最新内容</p> : null}
          <div className="community-post-list">
            {visiblePosts.map((post) => <CommunityPostCard key={post.id} post={post} />)}
          </div>
        </> : !visibleLoading ? <div className="community-state community-state--empty">
          <span className="community-state__icon"><CommunityIcon name="messageCircle" /></span>
          <strong>{savedOnly ? "还没有收藏的帖子" : query ? "没有找到相关帖子" : category ? "这个分类还没有帖子" : sort === "hot" ? "还没有热门讨论" : "还没有帖子"}</strong>
          <p>{savedOnly ? "收藏的帖子会集中显示在这里。" : query ? "换个关键词试试，或清除搜索条件。" : category ? "换个分类看看，或发布一条新的讨论。" : sort === "hot" ? "有更多人参与后，热门讨论会出现在这里。" : "分享你的第一个想法或项目进展"}</p>
          {query || category || savedOnly || sort === "hot" ? <button className="community-button community-button--quiet" type="button" onClick={() => { setQueryDraft(""); updateFilters({ q: "", category: "", saved: false, sort: "latest" }); }}>清除筛选</button> : <button className="community-button community-button--primary" type="button" onClick={() => setComposerOpen(true)}><CommunityIcon name="plus" />发布第一条帖子</button>}
        </div> : null}
        {visibleHasMore && !visibleLoading ? <button type="button" className="community-load-more" onClick={() => void loadNextPage()} disabled={loadingMore}>{loadingMore ? "正在加载…" : "加载更多"}</button> : null}
        {loadingMore ? <p className="community-load-more__status" role="status">正在加载更多讨论…</p> : null}
      </main>

    </div>
  </section>;
}
