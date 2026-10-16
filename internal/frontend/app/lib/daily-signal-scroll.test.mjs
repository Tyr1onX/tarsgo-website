import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { scrollHeatmapCellIntoView, scrollHeatmapToDate } from "./daily-signal-scroll.ts";

const workspace = await readFile(new URL("../components/daily-signal-workspace.tsx", import.meta.url), "utf8");
const dailySignalStyles = await readFile(new URL("../routes/daily-signal.css", import.meta.url), "utf8");

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

test("automatic positioning consumes its request once, and returning within the current year clears stale work", () => {
  assert.match(workspace, /const date = pendingScrollDateRef\.current;\s*pendingScrollDateRef\.current = null;\s*requestAnimationFrame\(\(\) => scrollHeatmapToDate/);
  assert.match(workspace, /if \(nextYear === selectedYear\) \{\s*pendingScrollDateRef\.current = null;\s*requestAnimationFrame\(\(\) => scrollHeatmapToDate/);
});

test("heatmap date details reserve the same mood and action row for every hovered date", () => {
  assert.match(workspace, /className="daily-signal__detail-extra" aria-hidden=\{!selectedMoodEntry \|\| undefined\}/);
  assert.match(workspace, /daily-signal__history-mood/);
  assert.doesNotMatch(workspace, /\{detailStatus === "sent" && selectedMoodEntry \? <div className="daily-signal__history-mood"/);
  assert.match(dailySignalStyles, /\.daily-signal__date-detail\s*\{[^}]*grid-template-rows:\s*40px 48px/);
  assert.match(dailySignalStyles, /\.daily-signal__detail-extra\s*\{[^}]*min-height:\s*48px/);
  assert.match(dailySignalStyles, /@media \(max-width: 700px\)[\s\S]*?\.daily-signal__date-detail\s*\{[^}]*grid-template-rows:\s*24px 40px 48px/);
  assert.match(dailySignalStyles, /\.daily-signal__detail-copy\s*\{[^}]*-webkit-line-clamp:\s*2/);
});

test("the communication terminal uses static signal detail with a restrained, hover-only response", () => {
  assert.match(dailySignalStyles, /\.daily-signal__orbit::before,[\s\S]*?\.daily-signal__orbit::after/);
  assert.match(dailySignalStyles, /daily-signal__signal-trace/);
  assert.match(workspace, /aria-label="基地回信终端"/);
  assert.match(workspace, /daily-signal__reply-copy/);
  assert.match(workspace, /getDailySignalReply\(currentUser\?\.id/);
  assert.doesNotMatch(workspace, /TX \/ 01|CHANNEL|VISIBILITY|daily-signal__terminal-index/);
  assert.match(dailySignalStyles, /daily-signal__terminal\[data-transmitting="true"\] \.daily-signal__signal-ripple \{ animation: daily-signal-ripple 720ms ease-out 1/);
  assert.match(dailySignalStyles, /@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\)[\s\S]*?\.daily-signal__terminal:hover \.daily-signal__orbit/);
  assert.doesNotMatch(dailySignalStyles, /daily-signal__orbit[^\n]*animation:[^\n]*infinite/);
  assert.match(dailySignalStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration:\s*\.01ms !important/);
});

test("switching accounts clears hovered details and pending deletion confirmation", () => {
  assert.match(workspace, /setHoveredDate\(null\);\s*setConfirmMoodDelete\(false\);\s*setSelectedDate/);
  assert.match(workspace, /applyIdentity\(null\);\s*void getOptionalCurrentUser\(\{ force: true \}\)/);
});
