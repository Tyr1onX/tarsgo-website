import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommunityReadingEntries,
  findHotCommunityReply,
  groupCommunityReplies,
} from "./community-discussion-model.ts";

function makeComment(id, overrides = {}) {
  return {
    id,
    authorName: `成员 ${id}`,
    createdAt: `2026-11-02T10:${String(id).padStart(2, "0")}:00Z`,
    parentPostId: undefined,
    isDeleted: false,
    isAcceptedSolution: false,
    isFeatured: false,
    likeCount: 0,
    ...overrides,
  };
}

test("reading entries count the original post and valid replies in server order", () => {
  const comments = [
    makeComment(7, { createdAt: "2026-11-02T10:02:00Z", isAcceptedSolution: true, isFeatured: true }),
    makeComment(8, { isDeleted: true }),
    makeComment(9, { createdAt: "2026-11-02T10:05:00Z" }),
  ];

  const entries = buildCommunityReadingEntries({ id: 41, createdAt: "2026-11-02T10:00:00Z", isFeatured: false }, comments);

  assert.deepEqual(entries.map(({ targetId, createdAt }) => [targetId, createdAt]), [
    ["community-post-41", "2026-11-02T10:00:00Z"],
    ["community-comment-7", "2026-11-02T10:02:00Z"],
    ["community-comment-9", "2026-11-02T10:05:00Z"],
  ]);
  assert.equal(entries[1].isAcceptedSolution, true);
  assert.equal(entries[1].isFeatured, true);
});

test("reply previews group valid immediate children without reordering them", () => {
  const comments = [
    makeComment(2),
    makeComment(3, { parentPostId: 2 }),
    makeComment(4, { parentPostId: 2, isDeleted: true }),
    makeComment(5, { parentPostId: 3 }),
  ];

  const replies = groupCommunityReplies(comments);

  assert.deepEqual(replies.get(2)?.map(({ id }) => id), [3]);
  assert.deepEqual(replies.get(3)?.map(({ id }) => id), [5]);
  assert.equal(replies.has(4), false);
});

test("hot reply uses the highest like count and keeps the first reply on ties", () => {
  const comments = [
    makeComment(2, { likeCount: 4 }),
    makeComment(3, { likeCount: 9 }),
    makeComment(4, { likeCount: 9 }),
    makeComment(5, { likeCount: 100, isDeleted: true }),
  ];

  assert.equal(findHotCommunityReply(comments)?.id, 3);
  assert.equal(findHotCommunityReply([makeComment(5, { isDeleted: true })]), null);
});
