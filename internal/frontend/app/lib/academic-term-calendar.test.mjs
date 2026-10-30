import assert from "node:assert/strict";
import test from "node:test";
import { getBeijingDate, resolveCurrentTeachingWeek, resolveTeachingWeekForDate } from "./academic-term-calendar.ts";

const firstWeekStart = "2026-09-07";
const teachingWeekCount = 19;

test("the official first teaching Monday is week 1 and the current date uses Beijing time", () => {
  assert.deepEqual(resolveTeachingWeekForDate(firstWeekStart, "2026-09-07", teachingWeekCount), {
    week: 1,
    status: "current",
    firstWeekStart: "2026-09-07",
    lastWeekEnd: "2027-01-17",
    teachingWeekCount: 19,
  });
  assert.equal(getBeijingDate(new Date("2026-09-06T15:59:59.000Z")), "2026-09-06");
  assert.equal(getBeijingDate(new Date("2026-09-06T16:00:00.000Z")), "2026-09-07");
  assert.equal(resolveCurrentTeachingWeek(firstWeekStart, new Date("2026-09-06T16:00:00.000Z"), teachingWeekCount).week, 1);
});

test("dates before the term preview week 1 and dates during the term count Monday-based weeks", () => {
  assert.deepEqual(resolveTeachingWeekForDate(firstWeekStart, "2026-09-06", teachingWeekCount).status, "before");
  assert.equal(resolveTeachingWeekForDate(firstWeekStart, "2026-09-06", teachingWeekCount).week, 1);
  assert.equal(resolveTeachingWeekForDate(firstWeekStart, "2026-10-30", teachingWeekCount).week, 8);
});

test("teaching-week numbering continues across the calendar year and clamps after term end", () => {
  assert.equal(resolveTeachingWeekForDate(firstWeekStart, "2027-01-04", teachingWeekCount).week, 18);
  assert.equal(resolveTeachingWeekForDate(firstWeekStart, "2027-01-17", teachingWeekCount).week, 19);
  assert.deepEqual(resolveTeachingWeekForDate(firstWeekStart, "2027-01-18", teachingWeekCount).status, "after");
  assert.equal(resolveTeachingWeekForDate(firstWeekStart, "2027-02-01", teachingWeekCount).week, 19);
});

test("invalid current-term configuration and dates never guess a teaching week", () => {
  assert.deepEqual(resolveTeachingWeekForDate("", "2026-10-30", teachingWeekCount), {
    week: null,
    status: "unconfigured",
  });
  assert.deepEqual(resolveTeachingWeekForDate(firstWeekStart, "2026-02-30", teachingWeekCount), {
    week: null,
    status: "unconfigured",
  });
});
