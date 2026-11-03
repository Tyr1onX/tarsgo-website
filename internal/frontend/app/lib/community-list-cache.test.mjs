import assert from "node:assert/strict";
import test from "node:test";

import { preserveCommunityReactionUpdates } from "./community-list-cache.ts";

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
