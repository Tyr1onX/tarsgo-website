import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { scrollHeatmapCellIntoView, scrollHeatmapToDate } from "./daily-signal-scroll.ts";

const workspace = await readFile(new URL("../components/daily-signal-workspace.tsx", import.meta.url), "utf8");

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
