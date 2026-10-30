import assert from "node:assert/strict";
import test from "node:test";
import { getBeijingDate, resolveCurrentTeachingWeek, resolveTeachingWeekForDate } from "./academic-term-calendar.ts";

const semester = "2026-2027学年第1学期";

test("the official first teaching Monday is week 1 and the current date uses Beijing time", () => {
  assert.deepEqual(resolveTeachingWeekForDate(semester, "2026-09-07"), {
    week: 1,
    status: "current",
    firstWeekStart: "2026-09-07",
    lastWeekEnd: "2027-01-17",
    teachingWeekCount: 19,
  });
  assert.equal(getBeijingDate(new Date("2026-09-06T15:59:59.000Z")), "2026-09-06");
  assert.equal(getBeijingDate(new Date("2026-09-06T16:00:00.000Z")), "2026-09-07");
  assert.equal(resolveCurrentTeachingWeek(semester, new Date("2026-09-06T16:00:00.000Z")).week, 1);
});

test("dates before the term preview week 1 and dates during the term count Monday-based weeks", () => {
  assert.deepEqual(resolveTeachingWeekForDate(semester, "2026-09-06").status, "before");
  assert.equal(resolveTeachingWeekForDate(semester, "2026-09-06").week, 1);
  assert.equal(resolveTeachingWeekForDate(semester, "2026-10-30").week, 8);
});

test("teaching-week numbering continues across the calendar year and clamps after term end", () => {
  assert.equal(resolveTeachingWeekForDate(semester, "2027-01-04").week, 18);
  assert.equal(resolveTeachingWeekForDate(semester, "2027-01-17").week, 19);
  assert.deepEqual(resolveTeachingWeekForDate(semester, "2027-01-18").status, "after");
  assert.equal(resolveTeachingWeekForDate(semester, "2027-02-01").week, 19);
});

test("semester aliases share one configuration and unknown terms never guess a week", () => {
  assert.equal(resolveTeachingWeekForDate("2026-2027学年第一学期", "2026-10-30").week, 8);
  assert.deepEqual(resolveTeachingWeekForDate("2027-2028学年第1学期", "2027-09-06"), {
    week: null,
    status: "unconfigured",
  });
  assert.deepEqual(resolveTeachingWeekForDate(semester, "2026-02-30"), {
    week: null,
    status: "unconfigured",
  });
});
