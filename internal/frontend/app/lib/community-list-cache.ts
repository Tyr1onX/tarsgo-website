import type { CommunityPost } from "~/lib/community-client";

export type CommunityListSnapshot = { posts: CommunityPost[]; page: number; hasMore: boolean };

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

export function clearOtherCommunityLists(keepKey: string) {
  for (const key of snapshots.keys()) {
    if (key !== keepKey) snapshots.delete(key);
  }
}

export function removeCommunityPostFromLists(postId: number) {
  for (const [key, snapshot] of snapshots) {
    const posts = snapshot.posts.filter((post) => post.id !== postId);
    if (posts.length !== snapshot.posts.length) rememberCommunityList(key, { ...snapshot, posts });
  }
}
