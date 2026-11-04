import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  addDays,
  beijingToday,
  clockTime,
  defaultSalonSchedule,
  fromBeijing,
  monthDays,
  moveTimeline,
  scheduleError,
  selectScheduleDate,
  shiftMonth,
  timelineRange,
  toBeijing,
  withTimeline,
} from "./salon-schedule.ts";

test("creation offers today before 14:00 and tomorrow afterwards, always 90 minutes", () => {
  for (const [instant, date] of [
    ["2026-11-04T05:59:59Z", "2026-11-04"],
    ["2026-11-04T06:00:00Z", "2026-11-05"],
    ["2026-11-30T15:59:59Z", "2026-12-01"],
    ["2026-11-30T16:00:00Z", "2026-12-01"],
  ]) {
    const value = defaultSalonSchedule(new Date(instant));
    assert.deepEqual(value, {
      startAt: `${date}T14:00`,
      endAt: `${date}T15:30`,
      deadline: `${date}T00:00`,
    });
    assert.deepEqual(timelineRange(value), [840, 930]);
    assert.equal(
      fromBeijing(value.deadline),
      `${addDays(date, -1)}T16:00:00.000Z`,
    );
  }
});

test("Beijing midnight and conversion do not depend on browser/system timezone", () => {
  assert.equal(beijingToday(new Date("2026-11-30T15:59:59Z")), "2026-11-30");
  assert.equal(beijingToday(new Date("2026-11-30T16:00:00Z")), "2026-12-01");
  for (const TZ of [
    "Asia/Shanghai",
    "America/Los_Angeles",
    "Pacific/Kiritimati",
    "UTC",
  ]) {
    const result = execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `
      import { defaultSalonSchedule, toBeijing, fromBeijing } from './app/lib/salon-schedule.ts';
      console.log(JSON.stringify([defaultSalonSchedule(new Date('2026-11-30T16:00:00Z')), fromBeijing(toBeijing('2026-11-30T16:00:01.123Z'))]));
    `,
      ],
      {
        cwd: new URL("../../", import.meta.url),
        env: { ...process.env, TZ },
        encoding: "utf8",
      },
    );
    assert.deepEqual(JSON.parse(result), [
      {
        startAt: "2026-12-01T14:00",
        endAt: "2026-12-01T15:30",
        deadline: "2026-12-01T00:00",
      },
      "2026-11-30T16:00:01.123Z",
    ]);
  }
});

test("one calendar supports leap years, Monday-first alignment, and year/month transitions", () => {
  assert.equal(monthDays("2028-02").filter(Boolean).length, 29);
  assert.deepEqual(monthDays("2026-11").slice(0, 7), [
    null,
    null,
    null,
    null,
    null,
    null,
    "2026-11-01",
  ]);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2027-01", -1), "2026-12");
});

const schedule = {
  startAt: "2026-12-10T14:00",
  endAt: "2026-12-10T15:30",
  deadline: "2026-12-09T00:00",
};
test("cross-month dates remain independent, and invalid deadlines receive the smallest date adjustment", () => {
  const next = selectScheduleDate(schedule, "deadline", "2026-11-30");
  assert.equal(next.startAt, schedule.startAt);
  assert.equal(next.deadline, "2026-11-30T00:00");
  assert.equal(
    selectScheduleDate(next, "event", "2026-12-20").deadline,
    next.deadline,
  );
  const earlier = selectScheduleDate(schedule, "event", "2026-12-01");
  assert.equal(earlier.startAt, "2026-12-01T14:00");
  assert.equal(earlier.endAt, "2026-12-01T15:30:00.000");
  assert.equal(earlier.deadline, "2026-12-01T00:00");
  assert.equal(scheduleError(earlier), "");
});

test("handles snap to the nearest half hour and clamp to a 30-minute minimum", () => {
  assert.deepEqual(moveTimeline(840, 930, "start", 854), [840, 930]);
  assert.deepEqual(moveTimeline(840, 930, "start", 855), [870, 930]);
  assert.deepEqual(moveTimeline(840, 930, "start", 1500), [900, 930]);
  assert.deepEqual(moveTimeline(840, 930, "end", 0), [840, 870]);
  assert.deepEqual(moveTimeline(840, 930, "end", 1441), [840, 1440]);
  assert.deepEqual(moveTimeline(840, 930, "start", -50), [0, 930]);
});

test("whole-range dragging preserves duration and clamps at both midnight boundaries", () => {
  assert.deepEqual(moveTimeline(840, 930, "range", 47), [900, 990]);
  assert.deepEqual(moveTimeline(840, 930, "range", -2000), [0, 90]);
  assert.deepEqual(moveTimeline(840, 930, "range", 2000), [1350, 1440]);
  const midnight = withTimeline(schedule, [1410, 1440]);
  assert.equal(midnight.endAt, "2026-12-11T00:00:00.000");
  assert.deepEqual(timelineRange(midnight), [1410, 1440]);
  assert.equal(clockTime(1440), "24:00");
});

test("every half-hour range stays valid when either handle or the whole range reaches a boundary", () => {
  for (let start = 0; start < 1440; start += 30)
    for (let end = start + 30; end <= 1440; end += 30) {
      for (const part of ["start", "end", "range"])
        for (const amount of [-2000, 0, 16, 839, 1440, 2000]) {
          const [a, b] = moveTimeline(start, end, part, amount);
          assert.ok(a >= 0 && b <= 1440 && b - a >= 30);
          assert.equal(a % 30, 0);
          assert.equal(b % 30, 0);
          if (part === "range") assert.equal(b - a, end - start);
        }
    }
});

test("editing preserves past dates, arbitrary minutes, seconds, and non-midnight deadlines", () => {
  const legacy = {
    startAt: "2026-01-01T06:07:08.123Z",
    endAt: "2026-01-01T07:09:10.456Z",
    deadline: "2025-12-31T09:42:11.789Z",
  };
  const value = Object.fromEntries(
    Object.entries(legacy).map(([key, v]) => [key, toBeijing(v)]),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, fromBeijing(v)]),
    ),
    legacy,
  );
  assert.equal(value.startAt, "2026-01-01T14:07:08.123");
  assert.equal(value.deadline, "2025-12-31T17:42:11.789");
  assert.equal(scheduleError(value), "");
  assert.equal(
    selectScheduleDate(value, "deadline", "2026-01-01").deadline,
    "2026-01-01T00:00",
  );
});

test("legacy cross-midnight and short events are retained until an explicit time adjustment", () => {
  const legacy = {
    startAt: "2026-11-04T23:45:12.123",
    endAt: "2026-11-05T01:15:45.678",
    deadline: "2026-11-03T22:00",
  };
  assert.equal(timelineRange(legacy), null);
  assert.equal(timelineRange({ ...schedule, endAt: "2026-12-10T14:15" }), null);
  const next = selectScheduleDate(legacy, "event", "2026-12-01");
  assert.equal(next.startAt, "2026-12-01T23:45:12.123");
  assert.equal(next.endAt, "2026-12-02T01:15:45.678");
  assert.deepEqual(timelineRange(withTimeline(next, [840, 930])), [840, 930]);
});

test("moving legacy start earlier repairs only a deadline that becomes invalid", () => {
  const legacy = { ...schedule, deadline: "2026-12-10T13:00" };
  assert.equal(withTimeline(legacy, [720, 930]).deadline, "2026-12-10T00:00");
  assert.equal(withTimeline(legacy, [840, 990]).deadline, legacy.deadline);
});

test("save validation retains the existing ordering rules and catches missing values", () => {
  assert.equal(scheduleError(schedule), "");
  assert.equal(scheduleError({ ...schedule, deadline: schedule.startAt }), "");
  assert.match(
    scheduleError({ ...schedule, endAt: schedule.startAt }),
    /结束时间/,
  );
  assert.match(
    scheduleError({ ...schedule, deadline: schedule.endAt }),
    /报名截止/,
  );
  assert.match(scheduleError({ ...schedule, startAt: "" }), /有效/);
});
