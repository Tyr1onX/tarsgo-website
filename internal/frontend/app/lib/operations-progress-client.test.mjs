import assert from "node:assert/strict";
import test from "node:test";

import {
  getOperationsAttention, nextOperationsDate, sortOperationsItems,
} from "./operations-progress-client.ts";

const base = {
  id: 1, title: "抖音", owner: "运营组", intervalDays: 7, nextAction: "",
  nextCheckAt: null, status: "active", createdAt: "2026-11-01T02:00:00Z",
  updatedAt: "2026-11-01T02:00:00Z", lastUpdate: null, lastCompletedAt: null,
};

test("recurring progress is due from creation until first completion, then from completed entry", () => {
  const now = new Date("2026-11-13T02:00:01Z");
  assert.equal(getOperationsAttention(base, new Date("2026-11-04T00:00:00Z")), "pending");
  assert.equal(getOperationsAttention(base, now), "overdue");
  const completed = { ...base, lastCompletedAt: "2026-11-12T12:00:00Z" };
  assert.equal(getOperationsAttention(completed, now), "active");
  assert.equal(nextOperationsDate(completed)?.toISOString(), "2026-11-19T12:00:00.000Z");
});

test("progress notes do not reset recurring completion; overdue follow-ups, blocked and done take precedence", () => {
  const now = new Date("2026-11-13T00:00:00Z");
  assert.equal(getOperationsAttention({ ...base, lastUpdate: { id: 2, itemId: 1, authorId: 1, content: "准备选题", kind: "progress", link: "", createdAt: "2026-11-12T00:00:00Z" } }, now), "overdue");
  assert.equal(getOperationsAttention({ ...base, intervalDays: 0, nextCheckAt: "2026-11-12T00:00:00Z" }, now), "overdue");
  assert.equal(getOperationsAttention({ ...base, status: "blocked" }, now), "blocked");
  assert.equal(getOperationsAttention({ ...base, status: "done" }, now), "done");
  assert.deepEqual(sortOperationsItems([
    { ...base, id: 2, status: "done" },
    { ...base, id: 3, status: "blocked" },
    { ...base, id: 4 },
  ]).map(({ id }) => id), [3, 4, 2]);
});
