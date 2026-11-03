import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPersonalWorkbenchSnapshots,
  emptyPersonalSnapshot,
  getPersonalWorkbenchSnapshot,
  hasPersonalWorkbenchData,
  rememberPersonalWorkbenchSnapshot,
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
