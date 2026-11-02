import assert from "node:assert/strict";
import test from "node:test";

import {
  communityExperiencePendingStorageKey,
  communityExperienceStorageKey,
  communityExperienceToastLabel,
  newCommunityExperienceEvents,
  readPendingCommunityExperienceToasts,
  writePendingCommunityExperienceToasts,
} from "./community-experience-sync.ts";

const event = (id, type, points, revoked = false) => ({
  id,
  type,
  points,
  revoked,
  label: "社区参与",
  createdAt: "2026-11-02T00:00:00Z",
});

test("only newly created, positive, active XP events are eligible for toasts", () => {
  const profile = {
    recentEvents: [
      event(8, "post", 10),
      event(11, "comment", 2),
      event(9, "reply", -1, true),
      event(10, "post_like", 1, true),
      event(7, "check_in", 10),
    ],
  };

  assert.deepEqual(newCommunityExperienceEvents(profile, 7).map(({ id }) => id), [8, 11]);
});

test("XP toast labels cover new contribution rewards and existing community rewards", () => {
  assert.equal(communityExperienceToastLabel(event(1, "post", 10)), "发布帖子成功");
  assert.equal(communityExperienceToastLabel(event(2, "comment", 2)), "发表评论成功");
  assert.equal(communityExperienceToastLabel(event(3, "avatar", 20)), "首次设置头像");
  assert.equal(communityExperienceToastLabel(event(4, "check_in", 10)), "每日签到");
  assert.equal(communityExperienceToastLabel(event(5, "accepted_solution", 10)), "回答被采纳");
  assert.equal(communityExperienceToastLabel(event(6, "reply", 1)), "帖子收到回复");
});

test("experience cursors are scoped to the active account", () => {
  assert.equal(communityExperienceStorageKey(42), "community-experience-last-event:42");
  assert.equal(communityExperiencePendingStorageKey(42), "community-experience-pending-toasts:42");
});

test("pending XP toasts survive route changes only until their original expiry", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    } },
  });

  try {
    const active = { id: 12, label: "发布帖子成功", points: 10, expiresAt: 3_000 };
    const expired = { id: 11, label: "发表评论成功", points: 2, expiresAt: 1_000 };
    writePendingCommunityExperienceToasts(42, [expired, active]);
    assert.deepEqual(readPendingCommunityExperienceToasts(42, 2_500), [active]);
    writePendingCommunityExperienceToasts(42, readPendingCommunityExperienceToasts(42, 2_500));
    assert.deepEqual(JSON.parse(values.get(communityExperiencePendingStorageKey(42))), [active]);
    writePendingCommunityExperienceToasts(42, []);
    assert.equal(values.has(communityExperiencePendingStorageKey(42)), false);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  }
});
