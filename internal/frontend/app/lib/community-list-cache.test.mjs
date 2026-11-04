import assert from "node:assert/strict";
import test from "node:test";

import { preserveCommunityReactionUpdates, refreshedCommunitySnapshot, clearCommunityLists, findCommunityPostInLists, getCommunityListSnapshot, rememberCommunityList, updateCommunityPostInLists } from "./community-list-cache.ts";

function post(overrides = {}) {
  return {
    id: 1,
    groupId: 2,
    category: "technology",
    title: "test",
    body: "body",
    authorId: 3,
    authorName: "member",
    authorLevel: 1,
    visibility: "public",
    isPinned: false,
    isFeatured: false,
    isHidden: false,
    isLegacy: false,
    createdAt: "2026-01-01T00:00:00Z",
    commentCount: 0,
    likeCount: 4,
    likedByMe: false,
    savedByMe: false,
    canEdit: false,
    canModerate: false,
    attachments: [],
    ...overrides,
  };
}

test("a refresh does not overwrite reactions changed after its request began", () => {
  const before = [post()];
  const latest = [post({ likedByMe: true, savedByMe: true, likeCount: 5 })];
  const staleResponse = [post({ title: "fresh title", likedByMe: false, savedByMe: false, likeCount: 4 })];

  assert.deepEqual(preserveCommunityReactionUpdates(before, latest, staleResponse), [
    post({ title: "fresh title", likedByMe: true, savedByMe: true, likeCount: 5 }),
  ]);
});

test("a refresh keeps its server reaction state when no local reaction changed", () => {
  const before = [post()];
  const latest = [post()];
  const fresh = [post({ likeCount: 8, likedByMe: true })];

  assert.deepEqual(preserveCommunityReactionUpdates(before, latest, fresh), fresh);
});


test("refresh replaces all retained pages and removes remote deletions", () => {
  const snapshot = refreshedCommunitySnapshot([
    { items: [post({ id: 3 }), post({ id: 2 })], page: 1, hasMore: true },
    { items: [post({ id: 2 }), post({ id: 4 })], page: 2, hasMore: false },
    { items: [post({ id: 99 })], page: 3, hasMore: false },
  ]);
  assert.deepEqual(snapshot.posts.map(item => item.id), [3, 2, 4]);
  assert.equal(snapshot.page, 2);
  assert.equal(snapshot.hasMore, false);
});

test("recent list snapshots retain validation time across local reaction updates and respect account scope", () => {
  clearCommunityLists();
  const key = JSON.stringify([7, "latest", "", "", false]);
  rememberCommunityList(key, { posts: [post()], page: 1, hasMore: false, refreshedAt: 100 });
  updateCommunityPostInLists(7, 1, (item) => ({ ...item, likedByMe: true, likeCount: 5 }));
  assert.equal(getCommunityListSnapshot(key)?.refreshedAt, 100);
  assert.equal(findCommunityPostInLists(7, 1)?.title, "test");
  assert.equal(findCommunityPostInLists(8, 1), undefined);
  clearCommunityLists();
});

test("retained windows are bounded and expired snapshots are discarded", () => {
  clearCommunityLists();
  const originalNow = Date.now;
  try {
    Date.now = () => 1000;
    rememberCommunityList("bounded", {posts: Array.from({length: 140}, (_, id) => post({id})), page: 7, hasMore: false});
    const cached = getCommunityListSnapshot("bounded");
    assert.equal(cached.posts.length, 100);
    assert.equal(cached.page, 5);
    assert.equal(cached.hasMore, true);
    Date.now = () => 121001;
    assert.equal(getCommunityListSnapshot("bounded"), undefined);
  } finally { Date.now = originalNow; clearCommunityLists(); }
});
