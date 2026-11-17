import assert from "node:assert/strict";
import test from "node:test";
import {
  clearWeeklyDashboardSnapshots,
  getWeeklyDashboardSnapshot,
  rememberWeeklyDashboardSnapshot,
} from "./weekly-dashboard-cache.ts";

test("weekly report snapshots remain scoped to each account and are cleared with identity", () => {
  clearWeeklyDashboardSnapshots();
  const one = { reports: [{ id: 3 }] };
  const two = { reports: [{ id: 7 }] };
  rememberWeeklyDashboardSnapshot(1, one);
  rememberWeeklyDashboardSnapshot(2, two);
  assert.equal(getWeeklyDashboardSnapshot(1), one);
  clearWeeklyDashboardSnapshots(1);
  assert.equal(getWeeklyDashboardSnapshot(1), undefined);
  assert.equal(getWeeklyDashboardSnapshot(2), two);
  clearWeeklyDashboardSnapshots();
  assert.equal(getWeeklyDashboardSnapshot(2), undefined);
});
