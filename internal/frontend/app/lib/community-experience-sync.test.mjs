import assert from "node:assert/strict";
import test from "node:test";

import {
  communityBeijingDay,
  millisecondsUntilCommunityDayChange,
  communityGrowthSnapshotStorageKey,
  getCommunityGrowthSnapshot,
  invalidateCommunityGrowthDay,
  clearCommunityGrowthSnapshot,
  clearAllCommunityGrowthSnapshots,
  publishCommunityGrowthProfile,
  subscribeCommunityGrowthProfile,
  publishCommunityGrowthError,
  subscribeCommunityGrowthError,
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


function growthProfile(day, checkedInToday = true) {
  return {
    level: 3,
    totalXp: 420,
    levelStartXp: 400,
    nextLevelXp: 900,
    xpToNextLevel: 480,
    progress: 0.04,
    streakDays: 3,
    checkedInToday,
    lastCheckInDay: day,
    dailyPostsUsed: 1,
    dailyRepliesUsed: 2,
    dailyContributionXp: 14,
    upcomingCheckIns: [{ day, streakDay: 3, rewardXp: 12, isToday: true, completed: checkedInToday }],
    recentEvents: [event(23, "check_in", 12)],
  };
}

async function withGrowthStorage(run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map();
  const page = new EventTarget();
  page.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: page });
  try { return await run(values); }
  finally {
    clearAllCommunityGrowthSnapshots();
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  }
}

test("growth snapshot is shared across route mounts, scoped to the account, and hydrated after a new module load", async () => {
  await withGrowthStorage(async (values) => {
    const today = communityBeijingDay();
    const first = growthProfile(today);
    const second = { ...growthProfile(today, false), level: 5, totalXp: 2_000 };
    const notified = [];
    const stop = subscribeCommunityGrowthProfile(42, () => notified.push(getCommunityGrowthSnapshot(42)?.totalXp));
    publishCommunityGrowthProfile(42, first);
    publishCommunityGrowthProfile(43, second);
    assert.deepEqual(notified, [420]);
    assert.strictEqual(getCommunityGrowthSnapshot(42), first);
    assert.strictEqual(getCommunityGrowthSnapshot(42), getCommunityGrowthSnapshot(42));
    assert.equal(getCommunityGrowthSnapshot(43).totalXp, 2_000);
    assert.equal(getCommunityGrowthSnapshot(44), null);
    assert.equal(JSON.parse(values.get(communityGrowthSnapshotStorageKey(42))).profile.totalXp, 420);

    const freshModule = await import("./community-experience-sync.ts?reload-growth-cache");
    assert.equal(freshModule.getCommunityGrowthSnapshot(42).totalXp, 420);
    assert.equal(freshModule.getCommunityGrowthSnapshot(43).level, 5);
    stop();
    publishCommunityGrowthProfile(42, { ...first, totalXp: 430 });
    assert.deepEqual(notified, [420]);
    clearCommunityGrowthSnapshot(42);
    assert.equal(getCommunityGrowthSnapshot(42), null);
    assert.equal(values.has(communityGrowthSnapshotStorageKey(42)), false);
  });
});

test("Beijing midnight resets stale daily flags without dropping lifetime XP or streak from yesterday", async () => {
  await withGrowthStorage((values) => {
    const originalNow = Date.now;
    let clock = Date.parse("2026-11-04T15:59:59Z");
    Date.now = () => clock;
    try {
      const yesterday = "2026-11-04";
      publishCommunityGrowthProfile(52, growthProfile(yesterday));
      assert.equal(getCommunityGrowthSnapshot(52).checkedInToday, true);
      assert.equal(millisecondsUntilCommunityDayChange(), 1_000);
      let updated = 0;
      const stop = subscribeCommunityGrowthProfile(52, () => updated++);
      clock += 2_000;
      invalidateCommunityGrowthDay(52);
      const stale = getCommunityGrowthSnapshot(52);
      assert.equal(updated, 1);
      assert.equal(stale.checkedInToday, false);
      assert.equal(stale.totalXp, 420);
      assert.equal(stale.level, 3);
      assert.equal(stale.streakDays, 3);
      assert.equal(stale.dailyContributionXp, 0);
      assert.deepEqual(stale.upcomingCheckIns, []);
      assert.equal(JSON.parse(values.get(communityGrowthSnapshotStorageKey(52))).day, yesterday);
      assert.strictEqual(getCommunityGrowthSnapshot(52), stale);
      publishCommunityGrowthProfile(52, growthProfile("2026-11-05"));
      assert.equal(getCommunityGrowthSnapshot(52).checkedInToday, true);
      stop();

      publishCommunityGrowthProfile(53, { ...growthProfile("2026-10-30"), lastCheckInDay: "2026-10-30" });
      assert.equal(getCommunityGrowthSnapshot(53).streakDays, 0);
      assert.equal(getCommunityGrowthSnapshot(53).checkedInToday, false);
    } finally {
      Date.now = originalNow;
    }
  });
});

test("growth error events are account-scoped and clearing all snapshots removes persisted copies", async () => {
  await withGrowthStorage((values) => {
    const received = [];
    const stop = subscribeCommunityGrowthError(42, (message) => received.push(message));
    publishCommunityGrowthError(43, "other account");
    publishCommunityGrowthError(42, "request failed");
    assert.deepEqual(received, ["request failed"]);
    stop();
    publishCommunityGrowthProfile(42, growthProfile(communityBeijingDay()));
    publishCommunityGrowthProfile(43, growthProfile(communityBeijingDay()));
    clearAllCommunityGrowthSnapshots();
    assert.equal(getCommunityGrowthSnapshot(42), null);
    assert.equal(getCommunityGrowthSnapshot(43), null);
    assert.equal([...values.keys()].some((key) => key.startsWith("community-growth-snapshot:")), false);
  });
});
