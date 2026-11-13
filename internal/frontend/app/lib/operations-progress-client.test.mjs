import assert from "node:assert/strict";
import test from "node:test";

import {
  daysSinceOperationsPublish, formatOperationsDay, formatOperationsUpdateDate, getOperationsAttention, nextOperationsDate, sortOperationsItems,
} from "./operations-progress-client.ts";

const base = {
  id: 1, title: "抖音", kind: "workstream", stage: "", owner: "运营组", intervalDays: 7, nextAction: "",
  nextCheckAt: null, status: "active", createdAt: "2026-11-01T02:00:00Z",
  updatedAt: "2026-11-01T02:00:00Z", lastUpdate: null, lastCompletedOn: null,
};

test("recurring progress is due from creation until first completion, then from completed entry", () => {
  const now = new Date("2026-11-13T02:00:01Z");
  assert.equal(getOperationsAttention(base, new Date("2026-11-04T00:00:00Z")), "pending");
  assert.equal(getOperationsAttention(base, now), "overdue");
  const completed = { ...base, lastCompletedOn: "2026-11-12" };
  assert.equal(getOperationsAttention(completed, now), "active");
  assert.equal(nextOperationsDate(completed)?.toISOString(), "2026-11-18T16:00:00.000Z");
});

test("actual platform publish day stays separate from the time it was recorded", () => {
  const now = new Date("2026-11-13T02:00:00Z");
  const channel = { ...base, kind: "channel", intervalDays: 0, lastCompletedOn: "2026-11-05" };
  const update = { id: 21, itemId: 1, authorId: 0, content: "培训会议", kind: "completed", link: "", publishedOn: "2026-11-05", createdAt: "2026-11-13T02:00:00Z" };
  assert.equal(formatOperationsUpdateDate(update), "2026年11月5日");
  assert.equal(formatOperationsDay(channel.lastCompletedOn), "2026年11月5日");
  assert.equal(daysSinceOperationsPublish(channel.lastCompletedOn, now), 8);
  assert.equal(daysSinceOperationsPublish(null, now), null);
  assert.equal(getOperationsAttention(channel, now), "pending");
  assert.equal(getOperationsAttention({ ...channel, lastUpdate: update }, now), "active");
  assert.equal(getOperationsAttention({ ...base, kind: "video", stage: "unconfirmed", intervalDays: 0 }, now), "pending");
  assert.equal(getOperationsAttention({ ...base, kind: "video", stage: "editing", intervalDays: 0 }, now), "active");
});

test("progress notes do not reset recurring completion; overdue follow-ups, blocked and done take precedence", () => {
  const now = new Date("2026-11-13T00:00:00Z");
  assert.equal(getOperationsAttention({ ...base, lastUpdate: { id: 2, itemId: 1, authorId: 1, content: "准备选题", kind: "progress", link: "", publishedOn: null, createdAt: "2026-11-12T00:00:00Z" } }, now), "overdue");
  assert.equal(getOperationsAttention({ ...base, intervalDays: 0, nextCheckAt: "2026-11-12T00:00:00Z" }, now), "overdue");
  assert.equal(getOperationsAttention({ ...base, status: "blocked" }, now), "blocked");
  assert.equal(getOperationsAttention({ ...base, status: "done" }, now), "done");
  assert.deepEqual(sortOperationsItems([
    { ...base, id: 2, status: "done" },
    { ...base, id: 3, status: "blocked" },
    { ...base, id: 4 },
  ]).map(({ id }) => id), [3, 4, 2]);
});
