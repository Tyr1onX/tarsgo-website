import assert from "node:assert/strict";
import test from "node:test";
import {
  addSignalDays,
  getCurrentBeijingDate,
  getMillisecondsUntilBeijingMidnight,
  getMonthMarkers,
  getSignalCellStatus,
  getSignalYearWeeks,
} from "./daily-signal-calendar.ts";

test("annual weeks cover every date exactly once, including leap days and year edges", () => {
  for (const year of [2024, 2025, 2026]) {
    const weeks = getSignalYearWeeks(year);
    const inYear = weeks.flat().filter((day) => day.inYear);
    const expected = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
    assert.equal(inYear.length, expected);
    assert.equal(new Set(inYear.map((day) => day.date)).size, expected);
    assert.equal(inYear[0].date, `${year}-01-01`);
    assert.equal(inYear.at(-1).date, `${year}-12-31`);
    assert.ok(weeks.length === 52 || weeks.length === 53);
  }
  assert.ok(getSignalYearWeeks(2024).flat().some((day) => day.date === "2024-02-29" && day.inYear));
});

test("cell status keeps signed, quiet, today, and future dates distinct", () => {
  const day = (date, inYear = true) => ({ date, inYear, weekday: 0 });
  const sent = new Set(["2026-10-15"]);
  assert.equal(getSignalCellStatus(day("2026-10-15"), "2026-10-16", sent), "sent");
  assert.equal(getSignalCellStatus(day("2026-10-14"), "2026-10-16", sent), "quiet");
  assert.equal(getSignalCellStatus(day("2026-10-16"), "2026-10-16", sent), "today");
  assert.equal(getSignalCellStatus(day("2026-10-17"), "2026-10-16", sent), "future");
  assert.equal(getSignalCellStatus(day("2025-12-31", false), "2026-10-16", sent), "outside");
});

test("calendar date arithmetic and the live-day timer use Asia/Shanghai", () => {
  assert.equal(addSignalDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addSignalDays("2024-03-01", -1), "2024-02-29");
  assert.equal(getCurrentBeijingDate(new Date("2026-12-31T16:30:00.000Z")), "2027-01-01");
  const remaining = getMillisecondsUntilBeijingMidnight(new Date("2026-10-16T15:59:59.000Z"));
  assert.ok(remaining >= 1000 && remaining <= 2100, `unexpected midnight countdown: ${remaining}`);
});

test("month markers point to the week containing each first day", () => {
  for (const year of [2025, 2026]) {
    const weeks = getSignalYearWeeks(year);
    const markers = getMonthMarkers(weeks, year);
    assert.equal(markers.length, 12);
    for (const marker of markers) {
      const month = String(markers.indexOf(marker) + 1).padStart(2, "0");
      assert.ok(weeks[marker.week].some((day) => day.date === `${year}-${month}-01`));
    }
  }
});
