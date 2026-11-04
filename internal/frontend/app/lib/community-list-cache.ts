import type { CommunityListItem } from "~/lib/community-client";

export type CommunityListSnapshot = { posts: CommunityListItem[]; page: number; hasMore: boolean; refreshedAt?: number };

export function preserveCommunityReactionUpdates(
	requestStart: readonly CommunityListItem[],
	latest: readonly CommunityListItem[],
	fresh: readonly CommunityListItem[],
): CommunityListItem[] {
	const startedById = new Map(requestStart.map((post) => [post.id, post]));
	const latestById = new Map(latest.map((post) => [post.id, post]));
	return fresh.map((post) => {
		const started = startedById.get(post.id);
		const current = latestById.get(post.id);
		if (!started || !current) return post;
		const likedChanged = current.likedByMe !== started.likedByMe;
		const savedChanged = current.savedByMe !== started.savedByMe;
		const likeCountChanged = current.likeCount !== started.likeCount;
		if (!likedChanged && !savedChanged && !likeCountChanged) return post;
		return {
			...post,
			...(likedChanged ? { likedByMe: current.likedByMe } : {}),
			...(savedChanged ? { savedByMe: current.savedByMe } : {}),
			...(likeCountChanged ? { likeCount: current.likeCount } : {}),
		};
	});
}

const MAX_CACHED_FILTERS = 10;
export const COMMUNITY_CACHE_PAGE_SIZE = 20;
const MAX_CACHED_PAGES = 5;
const CACHE_TTL_MS = 120_000;
const snapshots = new Map<string, CommunityListSnapshot>();
const expiresAt = new Map<string, number>();

export function getCommunityListSnapshot(key: string) {
  if ((expiresAt.get(key) ?? 0) <= Date.now()) {
    snapshots.delete(key);
    expiresAt.delete(key);
    return undefined;
  }
  return snapshots.get(key);
}

export function rememberCommunityList(key: string, snapshot: CommunityListSnapshot) {
  const lastRefresh = snapshots.get(key)?.refreshedAt;
  snapshots.delete(key);
  const page = Math.min(snapshot.page, MAX_CACHED_PAGES);
  snapshots.set(key, { ...snapshot, refreshedAt: snapshot.refreshedAt ?? lastRefresh, page,
    posts: snapshot.posts.slice(0, MAX_CACHED_PAGES * COMMUNITY_CACHE_PAGE_SIZE),
    hasMore: snapshot.hasMore || snapshot.page > MAX_CACHED_PAGES,
  });
  expiresAt.set(key, Date.now() + CACHE_TTL_MS);
  while (snapshots.size > MAX_CACHED_FILTERS) {
    const oldestKey = snapshots.keys().next().value;
    if (oldestKey === undefined) break;
    snapshots.delete(oldestKey);
    expiresAt.delete(oldestKey);
  }
}

export function findCommunityPostInLists(accountID: number, postID: number) {
  for (const [key, snapshot] of snapshots) {
    if (communityListScope(key)?.accountID !== accountID || !getCommunityListSnapshot(key)) continue;
    const post = snapshot.posts.find((item) => item.id === postID);
    if (post) return post;
  }
  return undefined;
}

export function clearCommunityLists() {
  snapshots.clear();
  expiresAt.clear();
}

export function clearOtherCommunityLists(keepKey: string) {
  for (const key of snapshots.keys()) {
    if (key !== keepKey) { snapshots.delete(key); expiresAt.delete(key); }
  }
}

export function removeCommunityPostFromLists(postId: number) {
  for (const [key, snapshot] of [...snapshots]) {
    const posts = snapshot.posts.filter((post) => post.id !== postId);
    if (posts.length !== snapshot.posts.length) rememberCommunityList(key, { ...snapshot, posts });
  }
}

function communityListScope(key: string) {
  try {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || !Number.isSafeInteger(value[0])) return null;
    return { accountID: value[0] as number, savedOnly: value[4] === true };
  } catch {
    return null;
  }
}

export function updateCommunityPostInLists(
  accountID: number,
  postID: number,
  update: (post: CommunityListItem) => CommunityListItem | null,
) {
  for (const [key, snapshot] of [...snapshots]) {
    const scope = communityListScope(key);
    if (scope?.accountID !== accountID) continue;
    let changed = false;
    const posts = snapshot.posts.flatMap((post) => {
      if (post.id !== postID) return [post];
      changed = true;
      const updated = update(post);
      return updated && !(scope.savedOnly && !updated.savedByMe) ? [updated] : [];
    });
    if (changed) rememberCommunityList(key, { ...snapshot, posts });
  }
}

export function invalidateCommunitySavedLists(accountID: number) {
  for (const key of snapshots.keys()) {
    const scope = communityListScope(key);
    if (scope?.accountID === accountID && scope.savedOnly) { snapshots.delete(key); expiresAt.delete(key); }
  }
}

// A refresh is authoritative for the entire retained page window. Never append
// missing old rows: they may have been deleted, hidden or moved by new activity.
export function refreshedCommunitySnapshot(pages: { items: CommunityListItem[]; page: number; hasMore: boolean }[]): CommunityListSnapshot {
  const posts: CommunityListItem[] = [];
  const seen = new Set<number>();
  let last = { page: 1, hasMore: false };
  for (const result of pages) {
    for (const post of result.items) {
      if (!seen.has(post.id)) { posts.push(post); seen.add(post.id); }
    }
    last = result;
    if (!result.hasMore) break;
  }
  return { posts, page: last.page, hasMore: last.hasMore };
}
