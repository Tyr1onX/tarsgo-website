import assert from "node:assert/strict";
import test from "node:test";

import { confirmUserGroup, getUserGroupConfirmationState } from "./user-group-client.ts";

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

test("coalesces pending checks and reuses a completed group result only briefly", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let requests = 0;
  let now = 1_000;
  Date.now = () => now;
  globalThis.fetch = async () => {
    requests += 1;
    return confirmationResponse(assignedState);
  };

  try {
    const first = await getUserGroupConfirmationState(91_001);
    const repeated = await getUserGroupConfirmationState(91_001);
    assert.deepEqual(repeated, first);
    assert.equal(requests, 1);

    now += 10_000;
    await getUserGroupConfirmationState(91_001);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("a successful self-confirmation invalidates the cached group state", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let requests = 0;
  Date.now = () => 50_000;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") return confirmationResponse(assignedState);
    requests += 1;
    return confirmationResponse(assignedState);
  };

  try {
    await getUserGroupConfirmationState(91_002);
    await confirmUserGroup(8);
    await getUserGroupConfirmationState(91_002);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
