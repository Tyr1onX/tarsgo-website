import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmUserGroup,
  getCachedUserGroupConfirmationState,
  getUserGroupConfirmationState,
  markUserGroupConfirmationStateStale,
  needsUserGroupConfirmationRefresh,
  refreshUserGroupConfirmationState,
} from "./user-group-client.ts";

function confirmationResponse(state) {
  return new Response(JSON.stringify({ code: 0, message: "ok", data: state }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const assignedState = {
  state: "assigned",
  groups: [{ groupId: 8, name: "[TEST] Group", role: 1 }],
  canSelfConfirm: false,
};

test("coalesces pending checks and reuses completed group results by account", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return confirmationResponse(assignedState);
  };

  try {
    const first = await getUserGroupConfirmationState(91_001);
    const repeated = await getUserGroupConfirmationState(91_001);
    assert.deepEqual(repeated, first);
    assert.equal(requests, 1);
    await getUserGroupConfirmationState(91_001);
    assert.deepEqual(await getUserGroupConfirmationState(91_003), assignedState);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a successful self-confirmation replaces the cached group state", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  const confirmedState = { ...assignedState, groups: [{ ...assignedState.groups[0], role: 2 }] };
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") return confirmationResponse(confirmedState);
    requests += 1;
    return confirmationResponse(assignedState);
  };

  try {
    await getUserGroupConfirmationState(91_004);
    await confirmUserGroup(8, 91_004);
    assert.deepEqual(await getUserGroupConfirmationState(91_004), confirmedState);
    assert.deepEqual(getCachedUserGroupConfirmationState(91_004), confirmedState);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed background refresh keeps the last good state and retries stale entries", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let fail = false;
  const changedState = { ...assignedState, groups: [{ ...assignedState.groups[0], role: 2 }] };
  globalThis.fetch = async () => {
    requests += 1;
    if (fail) return new Response(JSON.stringify({ code: 500, message: "temporary" }), { status: 500 });
    return confirmationResponse(requests > 1 ? changedState : assignedState);
  };

  try {
    assert.deepEqual(await getUserGroupConfirmationState(91_005), assignedState);
    markUserGroupConfirmationStateStale(91_005);
    fail = true;
    await assert.rejects(refreshUserGroupConfirmationState(91_005), /temporary/);
    assert.deepEqual(getCachedUserGroupConfirmationState(91_005), assignedState);
    fail = false;
    assert.deepEqual(await getUserGroupConfirmationState(91_005), changedState);
    assert.equal(requests, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("group data stays available after its short verification window and is marked for background refresh", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 20_000;
  let requests = 0;
  Date.now = () => now;
  globalThis.fetch = async () => {
    requests += 1;
    return confirmationResponse(assignedState);
  };

  try {
    await getUserGroupConfirmationState(91_006);
    assert.equal(needsUserGroupConfirmationRefresh(91_006, now + 9_999), false);
    assert.equal(needsUserGroupConfirmationRefresh(91_006, now + 10_000), true);
    assert.deepEqual(await getUserGroupConfirmationState(91_006), assignedState);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
