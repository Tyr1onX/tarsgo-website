import assert from "node:assert/strict";
import test from "node:test";

import { resolveDashboardAuth } from "./dashboard-auth-flow.ts";

test("reuses a cached user without making auth requests", async () => {
  const user = { id: 3, role: "admin" };
  let currentUserRequests = 0;
  let bootstrapRequests = 0;

  const result = await resolveDashboardAuth({
    cachedUser: user,
    getCurrentUser: async () => { currentUserRequests += 1; return user; },
    getBootstrapStatus: async () => { bootstrapRequests += 1; return { setupRequired: false }; },
    isUnauthorized: () => false,
  });

  assert.deepEqual(result, { type: "authenticated", user });
  assert.equal(currentUserRequests, 0);
  assert.equal(bootstrapRequests, 0);
});

test("does not check bootstrap after current-user lookup succeeds", async () => {
  const calls = [];
  const user = { id: 9, role: "super_admin" };

  const result = await resolveDashboardAuth({
    cachedUser: null,
    getCurrentUser: async () => { calls.push("me"); return user; },
    getBootstrapStatus: async () => { calls.push("bootstrap"); return { setupRequired: true }; },
    isUnauthorized: () => false,
  });

  assert.deepEqual(result, { type: "authenticated", user });
  assert.deepEqual(calls, ["me"]);
});

test("uses bootstrap status to distinguish setup from login after a 401", async () => {
  for (const setupRequired of [true, false]) {
    const calls = [];
    const result = await resolveDashboardAuth({
      cachedUser: null,
      getCurrentUser: async () => { calls.push("me"); throw { status: 401 }; },
      getBootstrapStatus: async () => { calls.push("bootstrap"); return { setupRequired }; },
      isUnauthorized: (error) => error?.status === 401,
    });

    assert.deepEqual(result, { type: setupRequired ? "setup-required" : "unauthenticated" });
    assert.deepEqual(calls, ["me", "bootstrap"]);
  }
});

test("does not hide non-authentication errors behind bootstrap lookup", async () => {
  let bootstrapRequests = 0;
  const error = new Error("network unavailable");

  await assert.rejects(
    resolveDashboardAuth({
      cachedUser: null,
      getCurrentUser: async () => { throw error; },
      getBootstrapStatus: async () => { bootstrapRequests += 1; return { setupRequired: false }; },
      isUnauthorized: () => false,
    }),
    error,
  );
  assert.equal(bootstrapRequests, 0);
});
