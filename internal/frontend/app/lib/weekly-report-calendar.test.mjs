import assert from "node:assert/strict";
import test from "node:test";

import { formatWeekLabel, isoWeekFromStart, weekStartFromISOWeek } from "./weekly-report-calendar.ts";

test("calendar maps Monday week starts to ISO week labels", () => {
  assert.equal(isoWeekFromStart("2026-10-12"), "2026-W42");
  assert.equal(isoWeekFromStart("2024-12-30"), "2025-W01");
  assert.equal(isoWeekFromStart("2021-01-04"), "2021-W01");
});

test("ISO week selection converts back to the same Monday", () => {
  for (const value of ["2026-W42", "2025-W01", "2020-W53"]) {
    assert.equal(isoWeekFromStart(weekStartFromISOWeek(value)), value);
  }
});

test("week labels include the ISO week and Shanghai calendar date range", () => {
  assert.equal(formatWeekLabel("2026-10-12"), "2026年第42周 · 10/12–10/18");
});

test("invalid dates and non-Monday starts are rejected", () => {
  assert.throws(() => isoWeekFromStart("2026-10-14"), RangeError);
  assert.throws(() => weekStartFromISOWeek("2026-W54"), RangeError);
  assert.throws(() => weekStartFromISOWeek("2021-W53"), RangeError);
});
