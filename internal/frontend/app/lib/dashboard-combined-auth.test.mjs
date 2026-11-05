import assert from "node:assert/strict";
import test from "node:test";

import {
  getCachedCurrentUser,
  getCurrentUser,
  loginWithPassword,
} from "./auth-client.ts";
import {
  getCachedUserGroupConfirmationState,
  getUserGroupConfirmationState,
  markUserGroupConfirmationStateStale,
} from "./user-group-client.ts";

const user = (id) => ({
  id,
  email: `fixture-${id}@example.invalid`,
  role: { id: 3, name: "member", displayName: "成员" },
});
const group = (id) => ({
  state: "assigned",
  groups: [{ groupId: id, name: "[TEST] 运营组", role: 1 }],
  canSelfConfirm: false,
});
const success = (data) => new Response(JSON.stringify({ code: 200, message: "ok", data }), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

test("dashboard identity request populates existing auth and group caches in one round trip", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const account = user(92_101);
  const membership = group(12);
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    assert.equal(url, "/api/me?include=groups");
    return success({ user: account, groupConfirmation: membership });
  };

  try {
    assert.deepEqual(await getCurrentUser({ force: true, includeGroups: true }), account);
    assert.deepEqual(getCachedCurrentUser(), account);
    assert.deepEqual(await getUserGroupConfirmationState(account.id), membership);
    assert.deepEqual(calls, ["/api/me?include=groups"], "no follow-up group request");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing group snapshot falls back to the existing independently authorized endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const account = user(92_105);
  const membership = group(18);
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (url === "/api/me?include=groups") return success({ user: account });
    if (url === "/api/user-group/confirmation") return success(membership);
    assert.fail("unexpected request " + url);
  };
  try {
    assert.deepEqual(await getCurrentUser({ force: true, includeGroups: true }), account);
    assert.deepEqual(await getUserGroupConfirmationState(account.id), membership);
    assert.deepEqual(calls, ["/api/me?include=groups", "/api/user-group/confirmation"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("late merged group response cannot overwrite a newer permission invalidation", async () => {
  const originalFetch = globalThis.fetch;
  const account = user(92_102);
  let resolveRequest;
  globalThis.fetch = async (url) => {
    assert.equal(url, "/api/me?include=groups");
    return new Promise((resolve) => { resolveRequest = resolve; });
  };

  try {
    const request = getCurrentUser({ force: true, includeGroups: true });
    markUserGroupConfirmationStateStale(account.id);
    resolveRequest(success({ user: account, groupConfirmation: group(15) }));
    await request;
    assert.equal(getCachedUserGroupConfirmationState(account.id), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("account switch during in-flight dashboard identity ignores the previous account snapshot", async () => {
  const originalFetch = globalThis.fetch;
  const previous = user(92_103);
  const next = user(92_104);
  let resolvePrevious;
  globalThis.fetch = async (url) => {
    if (url === "/api/me?include=groups") {
      return new Promise((resolve) => { resolvePrevious = resolve; });
    }
    assert.equal(url, "/api/login/email/password");
    return success({ user: next });
  };

  try {
    const previousRequest = getCurrentUser({ force: true, includeGroups: true });
    await loginWithPassword({ email: next.email, password: "test" });
    resolvePrevious(success({ user: previous, groupConfirmation: group(20) }));
    await previousRequest;
    assert.deepEqual(getCachedCurrentUser(), next);
    assert.equal(getCachedUserGroupConfirmationState(previous.id), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("401 dashboard identity result does not populate any group state", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "/api/me?include=groups");
    return new Response(JSON.stringify({ code: 401, message: "未登录", data: null }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(getCurrentUser({ force: true, includeGroups: true }), (error) => error.status === 401);
    assert.equal(getCachedCurrentUser(), null);
    assert.equal(getCachedUserGroupConfirmationState(92_103), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
