import assert from "node:assert/strict";
import test from "node:test";

import {
  communityPostReactionSnapshot,
  mergeCommunityReactionOverrides,
  releaseCommunityReactionLock,
  setCommunityPostReaction,
  tryAcquireCommunityReactionLock,
  withCommunityPostReactions,
} from "./community-reaction-state.ts";
import {
  getCommunityListSnapshot,
  invalidateCommunitySavedLists,
  rememberCommunityList,
  updateCommunityPostInLists,
} from "./community-list-cache.ts";

const post = {
  id: 781,
  title: "交互状态测试",
  likedByMe: false,
  savedByMe: false,
  likeCount: 0,
};

test("post likes and bookmarks update independently and preserve the rest of a post", () => {
  const liked = setCommunityPostReaction(post, "like", { active: true, likeCount: 1 });
  assert.deepEqual(communityPostReactionSnapshot(liked), { likedByMe: true, savedByMe: false, likeCount: 1 });

  const bookmarked = setCommunityPostReaction(liked, "bookmark", { active: true, likeCount: 1 });
  assert.deepEqual(communityPostReactionSnapshot(bookmarked), { likedByMe: true, savedByMe: true, likeCount: 1 });

  const unliked = setCommunityPostReaction(bookmarked, "like", { active: false, likeCount: 0 });
  assert.deepEqual(communityPostReactionSnapshot(unliked), { likedByMe: false, savedByMe: true, likeCount: 0 });
  assert.equal(withCommunityPostReactions({ ...unliked, title: "已编辑" }, bookmarked).title, "已编辑");
});

test("reaction updates stay in cached feeds and a removed favorite leaves only the saved feed", () => {
  const account = Date.now();
  const feedKey = JSON.stringify([account, "latest", "", "", false]);
  const filteredFeedKey = JSON.stringify([account, "latest", "technology", "", false]);
  const savedKey = JSON.stringify([account, "latest", "", "", true]);
  const savedPost = { ...post, id: 782, savedByMe: true };
  rememberCommunityList(feedKey, { posts: [savedPost], page: 1, hasMore: false });
  rememberCommunityList(filteredFeedKey, { posts: [savedPost], page: 1, hasMore: false });
  rememberCommunityList(savedKey, { posts: [savedPost], page: 1, hasMore: false });

  updateCommunityPostInLists(account, savedPost.id, (cachedPost) => ({ ...cachedPost, savedByMe: false }));

  assert.equal(getCommunityListSnapshot(feedKey)?.posts[0]?.savedByMe, false);
  assert.equal(getCommunityListSnapshot(filteredFeedKey)?.posts[0]?.savedByMe, false);
  assert.deepEqual(getCommunityListSnapshot(savedKey)?.posts, []);
});

test("reaction cache writes are isolated by account and failure restores the original state", () => {
  const accountA = Date.now();
  const accountB = accountA + 1;
  const postID = 783;
  const keyA = JSON.stringify([accountA, "latest", "", "", false]);
  const keyB = JSON.stringify([accountB, "latest", "", "", false]);
  const original = { ...post, id: postID, likeCount: 5 };
  rememberCommunityList(keyA, { posts: [original], page: 1, hasMore: false });
  rememberCommunityList(keyB, { posts: [{ ...original, likedByMe: true, likeCount: 6 }], page: 1, hasMore: false });

  const optimistic = setCommunityPostReaction(original, "like", { active: true, likeCount: 6 });
  updateCommunityPostInLists(accountA, postID, (cachedPost) => withCommunityPostReactions(cachedPost, optimistic));
  assert.equal(getCommunityListSnapshot(keyA)?.posts[0]?.likeCount, 6);
  assert.equal(getCommunityListSnapshot(keyB)?.posts[0]?.likedByMe, true);
  assert.equal(getCommunityListSnapshot(keyB)?.posts[0]?.likeCount, 6);

  updateCommunityPostInLists(accountA, postID, (cachedPost) => withCommunityPostReactions(cachedPost, original));
  assert.deepEqual(communityPostReactionSnapshot(getCommunityListSnapshot(keyA).posts[0]), communityPostReactionSnapshot(original));
  assert.equal(getCommunityListSnapshot(keyB)?.posts[0]?.likeCount, 6);
});

test("adding a bookmark invalidates only that account's saved-list snapshots", () => {
  const accountA = Date.now();
  const accountB = accountA + 1;
  const savedKeyA = JSON.stringify([accountA, "latest", "", "", true]);
  const feedKeyA = JSON.stringify([accountA, "latest", "", "", false]);
  const savedKeyB = JSON.stringify([accountB, "latest", "", "", true]);
  const snapshot = { posts: [{ ...post, savedByMe: true }], page: 1, hasMore: false };
  rememberCommunityList(savedKeyA, snapshot);
  rememberCommunityList(feedKeyA, snapshot);
  rememberCommunityList(savedKeyB, snapshot);

  invalidateCommunitySavedLists(accountA);

  assert.equal(getCommunityListSnapshot(savedKeyA), undefined);
  assert.ok(getCommunityListSnapshot(feedKeyA));
  assert.ok(getCommunityListSnapshot(savedKeyB));
});

test("failed unbookmark restores the feed and invalidates the now-stale saved snapshot", () => {
  const account = Date.now() + Math.floor(Math.random() * 1_000_000) + 10_000_000;
  const postID = 784;
  const feedKey = JSON.stringify([account, "latest", "", "", false]);
  const savedKey = JSON.stringify([account, "latest", "", "", true]);
  const original = { ...post, id: postID, savedByMe: true };
  rememberCommunityList(feedKey, { posts: [original], page: 1, hasMore: false });
  rememberCommunityList(savedKey, { posts: [original], page: 1, hasMore: false });

  updateCommunityPostInLists(account, postID, (cachedPost) => ({ ...cachedPost, savedByMe: false }));
  assert.deepEqual(getCommunityListSnapshot(savedKey)?.posts, []);

  updateCommunityPostInLists(account, postID, (cachedPost) => withCommunityPostReactions(cachedPost, original));
  invalidateCommunitySavedLists(account);

  assert.equal(getCommunityListSnapshot(feedKey)?.posts[0]?.savedByMe, true);
  assert.equal(getCommunityListSnapshot(savedKey), undefined);
});

test("a response started before a reaction keeps the newer state, then a fresh response clears the override", () => {
  const overrides = new Map([[post.id, {
    reaction: { likedByMe: true, savedByMe: false, likeCount: 1 },
    version: 4,
    pending: false,
  }]]);
  const staleResponse = [{ ...post, title: "来自旧筛选请求", likeCount: 0 }];
  const merged = mergeCommunityReactionOverrides(staleResponse, overrides, 3, withCommunityPostReactions);

  assert.equal(merged[0].title, "来自旧筛选请求");
  assert.deepEqual(communityPostReactionSnapshot(merged[0]), { likedByMe: true, savedByMe: false, likeCount: 1 });
  assert.equal(overrides.has(post.id), true);

  const freshResponse = [{ ...post, likedByMe: true, likeCount: 1 }];
  const fresh = mergeCommunityReactionOverrides(freshResponse, overrides, 4, withCommunityPostReactions);
  assert.equal(overrides.has(post.id), false);
  assert.deepEqual(communityPostReactionSnapshot(fresh[0]), { likedByMe: true, savedByMe: false, likeCount: 1 });
});

test("reaction locks prevent duplicate actions per item while allowing independent items", () => {
  const locks = new Set();
  assert.equal(tryAcquireCommunityReactionLock(locks, 10), true);
  assert.equal(tryAcquireCommunityReactionLock(locks, 10), false);
  assert.equal(tryAcquireCommunityReactionLock(locks, 11), true);
  releaseCommunityReactionLock(locks, 10);
  assert.equal(tryAcquireCommunityReactionLock(locks, 10), true);
  assert.deepEqual([...locks].sort(), [10, 11]);
});
