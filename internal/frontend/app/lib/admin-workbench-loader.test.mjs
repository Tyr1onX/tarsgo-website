import assert from "node:assert/strict";
import test from "node:test";
import { emptyAdminWorkbenchState, loadAdminWorkbench } from "./admin-workbench-loader.ts";

test("fast recruitment appears while assignments are pending, then failure keeps recruitment", async () => {
  const recruitment = Promise.withResolvers();
  const assignments = Promise.withResolvers();
  const updates = [];
  const done = loadAdminWorkbench(recruitment.promise, assignments.promise, (state, pending) => updates.push({ state, pending }));
  const summary = { currentFormAvailable: true, summary: { pendingScreening: 2, pendingInterview: 3 } };
  recruitment.resolve(summary);
  await Promise.resolve();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].pending, 1);
  assert.equal(updates[0].state.recruitment, summary);
  assert.equal(updates[0].state.assignmentReviewCount, null);
  assignments.reject(new Error("offline"));
  await done;
  assert.equal(updates[1].pending, 0);
  assert.equal(updates[1].state.recruitment, summary);
  assert.equal(updates[1].state.errors.assignments, "offline");
  assert.deepEqual(updates[0].state.errors, {});
  assert.deepEqual(emptyAdminWorkbenchState.errors, {});
});

test("loads are independent and admins without assignment access await recruitment only", async () => {
  const old = Promise.withResolvers();
  const oldUpdates = [];
  const oldDone = loadAdminWorkbench(old.promise, null, (state) => oldUpdates.push(state));
  const nextUpdates = [];
  await loadAdminWorkbench(Promise.resolve({ currentFormAvailable: false }), Promise.resolve({ reviewCount: 4 }), (state, pending) => nextUpdates.push({ state, pending }));
  assert.equal(nextUpdates.at(-1).state.assignmentReviewCount, 4);
  assert.equal(nextUpdates.at(-1).pending, 0);
  old.resolve({ currentFormAvailable: true });
  await oldDone;
  assert.equal(oldUpdates.length, 1);
  assert.equal(oldUpdates[0].assignmentReviewCount, null);
  assert.equal(nextUpdates.at(-1).state.recruitment.currentFormAvailable, false);
});
