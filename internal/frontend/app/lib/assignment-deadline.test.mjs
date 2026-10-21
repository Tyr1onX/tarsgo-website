import assert from "node:assert/strict";
import test from "node:test";

import {
  assignmentDeadlineForShortcut,
  assignmentDeadlineIsFuture,
  assignmentDeadlineToISOString,
  shanghaiDateTimeLocal,
} from "./assignment-deadline.ts";

test("deadline shortcuts use Beijing wall time and cross month and year boundaries", () => {
  const now = new Date("2026-10-31T14:00:00.000Z"); // 2026-10-31 22:00 in Beijing
  assert.equal(assignmentDeadlineForShortcut(now, 0), "2026-10-31T23:59");
  assert.equal(assignmentDeadlineForShortcut(now, 1), "2026-11-01T23:59");
  assert.equal(assignmentDeadlineForShortcut(now, 7), "2026-11-07T23:59");
  assert.equal(assignmentDeadlineForShortcut(new Date("2026-12-30T16:00:00.000Z"), 3), "2027-01-03T23:59");
});

test("manual datetime-local values convert as UTC+8 regardless of host timezone", () => {
  assert.equal(assignmentDeadlineToISOString("2026-10-22T23:59"), "2026-10-22T15:59:00.000Z");
  assert.equal(shanghaiDateTimeLocal("2026-10-22T15:59:00.000Z"), "2026-10-22T23:59");
});

test("deadline validation rejects invalid, equal, and expired values", () => {
  const now = new Date("2026-10-22T15:59:00.000Z");
  assert.equal(assignmentDeadlineIsFuture("2026-10-22T23:59", now), false);
  assert.equal(assignmentDeadlineIsFuture("2026-10-22T23:58", now), false);
  assert.equal(assignmentDeadlineIsFuture("2026-02-30T23:59", now), false);
  assert.equal(assignmentDeadlineIsFuture("2026-10-22T23:59", new Date("2026-10-22T15:58:59.999Z")), true);
});
