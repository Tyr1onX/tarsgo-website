import assert from "node:assert/strict";
import test from "node:test";

import {
  requestCommunityGrowthSnapshot,
  subscribeToCommunityGrowthSnapshot,
  publishCommunityGrowthProfile,
  subscribeCommunityGrowthProfile,
  communityExperienceDismissedStorageKey,
  communityExperiencePendingStorageKey,
  communityExperienceStorageKey,
  communityExperienceToastLabel,
  normalizeCommunityExperienceEventID,
  readDismissedCommunityExperienceToasts,
  newCommunityExperienceEvents,
  readPendingCommunityExperienceToasts,
  writeDismissedCommunityExperienceToasts,
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
  assert.equal(normalizeCommunityExperienceEventID("12"), 12);
  assert.equal(normalizeCommunityExperienceEventID("12.5"), null);
  assert.deepEqual(newCommunityExperienceEvents({ recentEvents: [event("13", "comment", 2)] }, 12).map(({ id }) => id), ["13"]);
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
  assert.equal(communityExperienceDismissedStorageKey(42), "community-experience-dismissed-toasts:42");
});

test("dismissed XP events stay dismissed for the tab and normalize event IDs", () => {
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
    writeDismissedCommunityExperienceToasts(42, [12, "13", 0, Number.NaN]);
    assert.deepEqual(readDismissedCommunityExperienceToasts(42), [12, 13]);
    assert.equal(values.get(communityExperienceDismissedStorageKey(42)), "[12,13]");
    writeDismissedCommunityExperienceToasts(42, []);
    assert.equal(values.has(communityExperienceDismissedStorageKey(42)), false);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  }
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

test("pending XP toast IDs from storage are normalized before dismissal lookups", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map([[communityExperiencePendingStorageKey(42), JSON.stringify([
    { id: "15", label: "收到回复", points: 1, expiresAt: 4_000 },
    { id: "invalid", label: "无效事件", points: 1, expiresAt: 4_000 },
  ])]]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    } },
  });

  try {
    assert.deepEqual(readPendingCommunityExperienceToasts(42, 3_000), [
      { id: 15, label: "收到回复", points: 1, expiresAt: 4_000 },
    ]);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  }
});


test("late growth subscriber reuses host snapshot and unsubscribes", () => {
 const original = Object.getOwnPropertyDescriptor(globalThis, "window");
 Object.defineProperty(globalThis,"window",{configurable:true,value:new EventTarget()});
 try {
  const profile={level:3,totalXp:80};
  let requests=0;
  const stopHost=subscribeToCommunityGrowthSnapshot(()=>{requests++;publishCommunityGrowthProfile(profile)});
  const seen=[];
  const stopView=subscribeCommunityGrowthProfile(value=>seen.push(value));
  requestCommunityGrowthSnapshot();
  assert.deepEqual(seen,[profile]);
  stopView();requestCommunityGrowthSnapshot();
  assert.equal(seen.length,1);
  stopHost();requestCommunityGrowthSnapshot();
  assert.equal(requests,2);
 } finally {
  if(original) Object.defineProperty(globalThis,"window",original);else delete globalThis.window;
 }
});
