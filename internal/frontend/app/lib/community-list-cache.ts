import type { CommunityPost } from "~/lib/community-client";

export type CommunityListSnapshot = { posts: CommunityPost[]; page: number; hasMore: boolean };

export function preserveCommunityReactionUpdates(
	requestStart: readonly CommunityPost[],
	latest: readonly CommunityPost[],
	fresh: readonly CommunityPost[],
): CommunityPost[] {
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
const snapshots = new Map<string, CommunityListSnapshot>();

export function getCommunityListSnapshot(key: string) {
  return snapshots.get(key);
}

export function rememberCommunityList(key: string, snapshot: CommunityListSnapshot) {
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  while (snapshots.size > MAX_CACHED_FILTERS) {
    const oldestKey = snapshots.keys().next().value;
    if (oldestKey === undefined) break;
    snapshots.delete(oldestKey);
  }
}

export function clearCommunityLists() {
  snapshots.clear();
}

export function clearOtherCommunityLists(keepKey: string) {
  for (const key of snapshots.keys()) {
    if (key !== keepKey) snapshots.delete(key);
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
  update: (post: CommunityPost) => CommunityPost | null,
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
    if (scope?.accountID === accountID && scope.savedOnly) snapshots.delete(key);
  }
}
