import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPersonalWorkbenchSnapshots,
  emptyPersonalSnapshot,
  getPersonalWorkbenchSnapshot,
  hasPersonalWorkbenchData,
  rememberPersonalWorkbenchSnapshot,
  loadPersonalWorkbenchSections,
} from "./personal-workbench-cache.ts";

test("workbench snapshots are isolated by account and permission scope", () => {
  const accountOneScope = JSON.stringify([1, "member", true, false, "12:1"]);
  const accountTwoScope = JSON.stringify([2, "member", false, false, "13:1"]);
  const accountOneOtherPermissions = JSON.stringify([1, "member", false, false, "14:1"]);
  const snapshot = { ...emptyPersonalSnapshot, assignments: [{ id: 44 }] };

  rememberPersonalWorkbenchSnapshot(accountOneScope, snapshot);
  rememberPersonalWorkbenchSnapshot(accountTwoScope, emptyPersonalSnapshot);

  assert.equal(hasPersonalWorkbenchData(getPersonalWorkbenchSnapshot(accountOneScope)), true);
  assert.equal(getPersonalWorkbenchSnapshot(accountOneOtherPermissions), undefined);
  assert.equal(getPersonalWorkbenchSnapshot(accountTwoScope), emptyPersonalSnapshot);

  clearPersonalWorkbenchSnapshots(1);
  assert.equal(getPersonalWorkbenchSnapshot(accountOneScope), undefined);
  assert.equal(getPersonalWorkbenchSnapshot(accountTwoScope), emptyPersonalSnapshot);
});


test("fast sections publish before slow sections and preserve failed cached data", async () => {
  const weekly = Promise.withResolvers();
  const assignments = Promise.withResolvers();
  const leave = Promise.withResolvers();
  const cached = { ...emptyPersonalSnapshot, leaveAccess: { status: "approved" } };
  const updates = [];
  const complete = loadPersonalWorkbenchSections(cached, {
    weekly: weekly.promise, assignments: assignments.promise, leave: leave.promise,
  }, (snapshot, pending) => updates.push({ snapshot, pending }));
  weekly.resolve({ submitted: false, currentWeekStart: "2026-11-02" });
  await Promise.resolve();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].pending, 2);
  assert.equal(updates[0].snapshot.weekly.submitted, false);
  assert.equal(updates[0].snapshot.assignments, null);
  leave.reject(new Error("offline"));
  await Promise.resolve();
  assignments.resolve([{ id: 7, status: "overdue" }]);
  await complete;
  assert.equal(updates.length, 3);
  assert.equal(updates[2].pending, 0);
  assert.equal(updates[2].snapshot.errors.leave, "offline");
  assert.deepEqual(updates[2].snapshot.leaveAccess, cached.leaveAccess);
  assert.equal(updates[2].snapshot.assignments[0].id, 7);
  assert.deepEqual(updates[0].snapshot.errors, {});
  assert.equal(cached.weekly, null);
});
