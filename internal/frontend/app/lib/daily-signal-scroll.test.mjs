import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { scrollHeatmapCellIntoView, scrollHeatmapToDate } from "./daily-signal-scroll.ts";

const workspace = await readFile(new URL("../components/daily-signal-workspace.tsx", import.meta.url), "utf8");
const dailySignalStyles = await readFile(new URL("../routes/daily-signal.css", import.meta.url), "utf8");
const dashboardHomeStyles = await readFile(new URL("../routes/dashboard/dashboard-home.css", import.meta.url), "utf8");

function makeViewport({ targetLeft = 950, targetRight = 970, scrollLeft = 0 } = {}) {
  const calls = [];
  const target = {
    left: targetLeft,
    right: targetRight,
    width: targetRight - targetLeft,
    getBoundingClientRect() {
      return { left: this.left, right: this.right, width: this.width };
    },
  };
  const initialTargetLeft = targetLeft + scrollLeft;
  const viewport = {
    scrollLeft,
    clientLeft: 0,
    clientWidth: 300,
    scrollWidth: 1200,
    getBoundingClientRect() {
      return { left: 100, right: 400, width: 300 };
    },
    querySelector(selector) {
      assert.equal(selector, '[data-signal-date="2026-10-16"]');
      return target;
    },
    scrollTo(options) {
      calls.push(options);
      this.scrollLeft = options.left;
      target.left = initialTargetLeft - options.left;
      target.right = target.left + target.width;
    },
  };
  return { calls, target, viewport };
}

test("today positioning scrolls only the heatmap container and does not repeat an unchanged target", () => {
  const { calls, viewport } = makeViewport();

  scrollHeatmapToDate("2026-10-16", viewport, "smooth");
  scrollHeatmapToDate("2026-10-16", viewport, "smooth");

  assert.deepEqual(calls, [{ left: 686, behavior: "smooth" }]);
});

test("keyboard focus reveals an offscreen date with horizontal scrolling only", () => {
  const { calls, target, viewport } = makeViewport({ targetLeft: 490, targetRight: 514 });

  scrollHeatmapCellIntoView(target, viewport, "auto");

  assert.deepEqual(calls, [{ left: 114, behavior: "auto" }]);
  assert.equal(viewport.scrollLeft, 114);
});

test("keyboard focus does not scroll when its date is already visible", () => {
  const { calls, target, viewport } = makeViewport({ targetLeft: 240, targetRight: 264 });

  scrollHeatmapCellIntoView(target, viewport, "smooth");

  assert.deepEqual(calls, []);
});

test("date navigation is isolated from document scrolling and focuses without browser auto-scroll", () => {
  assert.match(workspace, /focus\(\{ preventScroll: true \}\)/);
  assert.match(workspace, /scrollHeatmapCellIntoView\(nextCell, archiveViewportRef\.current/);
  assert.doesNotMatch(workspace, /scrollIntoView\(/);
  assert.doesNotMatch(workspace, /window\.scrollTo|document\.scrollTo/);
});

test("automatic positioning consumes its request once and follows the Beijing date into a new year", () => {
  assert.match(workspace, /const date = pendingScrollDateRef\.current;\s*pendingScrollDateRef\.current = null;\s*requestAnimationFrame\(\(\) => scrollHeatmapToDate/);
  assert.match(workspace, /const \[today, setToday\] = useState\(\(\) => getCurrentBeijingDate\(\)\)/);
  assert.match(workspace, /const year = Number\(today\.slice\(0, 4\)\)/);
  assert.match(workspace, /if \(nextToday !== today\)[\s\S]*?const crossedYear = nextToday\.slice\(0, 4\) !== today\.slice\(0, 4\)/);
  assert.match(workspace, /if \(selectedDate === today\) \{\s*setSelectedDate\(nextToday\)/);
  assert.match(workspace, /crossedYear \|\| selectedDateCrossedYear\) \{\s*setFocusedDate\(nextToday\)/);
  assert.match(workspace, /setToday\(nextToday\)[\s\S]*?setRefreshVersion/);
  assert.doesNotMatch(workspace, /\bselectedYear\b|chooseYear|returnToToday|回到今天|选择档案年份/);
  assert.doesNotMatch(workspace, /daily-signal__year-control|daily-signal__today-button/);
});

test("history only changes on click and the compact detail is closed until a date is selected", () => {
  assert.match(workspace, /onFocus=\{\(\) => setFocusedDate\(day\.date\)\}/);
  assert.match(workspace, /onClick=\{\(\) => \{ setSelectedDate\(day\.date\); setFocusedDate\(day\.date\); \}\}/);
  assert.doesNotMatch(workspace, /hoveredDate|onPointerEnter|onPointerLeave|title=\{accessibleName\}/);
  assert.doesNotMatch(workspace, /onFocus=\{\(\) => \{[^}]*setSelectedDate/);
  assert.match(workspace, /selectedDate && detailStatus \? \(/);
  assert.match(workspace, /const moveGridFocus = \(event[\s\S]*?setFocusedDate\(nextDate\);\s*nextCell\.focus/);
  assert.doesNotMatch(workspace.match(/const moveGridFocus[\s\S]*?\n  \};/)?.[0] ?? "", /setSelectedDate/);
  assert.match(workspace, /data-is-today=\{day\.date === today/);
  assert.doesNotMatch(dailySignalStyles, /\.daily-signal__date-detail\s*\{[^}]*min-height/);
  assert.doesNotMatch(dailySignalStyles, /\.daily-signal__detail-extra/);
});

test("the compact communication keeps the signal mark and uses a restrained one-shot response", () => {
  assert.match(dailySignalStyles, /\.daily-signal__orbit::before,[\s\S]*?\.daily-signal__orbit::after/);
  assert.match(dailySignalStyles, /daily-signal__signal-trace/);
  assert.match(workspace, /className="daily-signal__reply-copy"/);
  assert.match(workspace, /daily-signal__reply-copy/);
  assert.match(workspace, /getDailySignalReply\(currentUser\.id/);
  assert.doesNotMatch(workspace, /TX \/ 01|CHANNEL|VISIBILITY|daily-signal__terminal-index/);
  assert.match(dailySignalStyles, /daily-signal__terminal\[data-transmitting="true"\] \.daily-signal__signal-ripple \{ animation: daily-signal-ripple 720ms ease-out 1/);
  assert.match(dailySignalStyles, /@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\)[\s\S]*?\.daily-signal__orbit:hover/);
  assert.doesNotMatch(dailySignalStyles, /daily-signal__orbit[^\n]*animation:[^\n]*infinite/);
  assert.match(dailySignalStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration:\s*\.01ms !important/);
  assert.doesNotMatch(workspace, /<aside className="daily-signal__transmitter"/);
});

test("the daily signal component remains isolated from the workbench home", async () => {
  const dashboard = await readFile(new URL("../routes/dashboard/index.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboard, /DailySignalWorkspace|daily-signal/);
  assert.match(workspace, /DailySignalWorkspace\(\{ currentUser \}: \{ currentUser: AuthUser \}\)/);
  assert.doesNotMatch(workspace, /getOptionalCurrentUser|subscribeAccountSessionChange|subscribeAuthStateChange/);
});

test("annual archive requests are deduplicated only while the same account/year refresh is pending", () => {
  assert.match(workspace, /const pendingArchiveRequests = new Map<string, Promise<DailySignalArchive>>\(\)/);
  assert.match(workspace, /const key = `\$\{accountId\}:\$\{year\}:\$\{refreshVersion\}`/);
  assert.match(workspace, /const pending = pendingArchiveRequests\.get\(key\);\s*if \(pending\) return pending/);
  assert.match(workspace, /void requestArchive\(currentUser\.id, year, refreshVersion\)/);
  assert.match(workspace, /if \(pendingArchiveRequests\.get\(key\) === request\) pendingArchiveRequests\.delete\(key\)/);
  assert.doesNotMatch(workspace, /new AbortController\(\)/);
});

test("historical mood deletion controls and their request path are removed", () => {
  assert.doesNotMatch(workspace, /deleteMood|DeleteMood|confirmMoodDelete|删除状态|确认删除|method: "DELETE"/);
  assert.doesNotMatch(dailySignalStyles, /daily-signal__delete-mood/);
});

test("the dashboard grid keeps a shrinkable single content column", () => {
  assert.match(dashboardHomeStyles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(dashboardHomeStyles, /\.dashboard-home > \* \{ min-width: 0; \}/);
});

test("the archive uses the current Beijing year without year navigation controls", () => {
  assert.match(workspace, /const year = Number\(today\.slice\(0, 4\)\)/);
  assert.doesNotMatch(workspace, /<select|daily-signal__year-control|daily-signal__today-button/);
  assert.doesNotMatch(dailySignalStyles, /daily-signal__year-control|daily-signal__today-button/);
  assert.match(workspace, /pendingScrollDateRef\.current = nextToday/);
});
