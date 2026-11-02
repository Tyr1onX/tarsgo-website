export interface CommunityPostReactionSnapshot {
  likedByMe: boolean;
  savedByMe: boolean;
  likeCount: number;
}

export interface CommunityReactionState {
  active: boolean;
  likeCount: number;
}

export interface CommunityReactionOverride<T> {
  reaction: T;
  version: number;
  pending: boolean;
}

export function communityPostReactionSnapshot(post: CommunityPostReactionSnapshot): CommunityPostReactionSnapshot {
  return { likedByMe: post.likedByMe, savedByMe: post.savedByMe, likeCount: post.likeCount };
}

export function withCommunityPostReactions<T extends CommunityPostReactionSnapshot>(post: T, reaction: CommunityPostReactionSnapshot): T {
  return { ...post, likedByMe: reaction.likedByMe, savedByMe: reaction.savedByMe, likeCount: reaction.likeCount };
}

export function setCommunityPostReaction<T extends CommunityPostReactionSnapshot>(post: T, kind: "like" | "bookmark", state: CommunityReactionState): T {
  return withCommunityPostReactions(post, {
    ...communityPostReactionSnapshot(post),
    likedByMe: kind === "like" ? state.active : post.likedByMe,
    savedByMe: kind === "bookmark" ? state.active : post.savedByMe,
    likeCount: state.likeCount,
  });
}

export function tryAcquireCommunityReactionLock(locks: Set<number>, id: number) {
  if (locks.has(id)) return false;
  locks.add(id);
  return true;
}

export function releaseCommunityReactionLock(locks: Set<number>, id: number) {
  locks.delete(id);
}

export function mergeCommunityReactionOverrides<TItem extends { id: number }, TReaction>(
  items: TItem[],
  overrides: Map<number, CommunityReactionOverride<TReaction>>,
  startedAtVersion: number,
  apply: (item: TItem, reaction: TReaction) => TItem,
) {
  return items.map((item) => {
    const override = overrides.get(item.id);
    if (!override) return item;
    if (override.pending || override.version > startedAtVersion) return apply(item, override.reaction);
    overrides.delete(item.id);
    return item;
  });
}
