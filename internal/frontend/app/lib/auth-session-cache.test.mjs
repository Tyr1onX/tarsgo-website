import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ANONYMOUS_SESSION_CACHE_TTL_MS,
  AUTH_SESSION_REVALIDATE_AFTER_MS,
  AuthSessionCache,
} from "./auth-session-cache.ts";
import {
  getCachedCurrentUser,
  getCurrentUser,
  loginWithPassword,
  logout,
  subscribeAccountSessionChange,
  subscribeAuthStateChange,
  subscribePermissionChange,
  switchAccountSession,
} from "./auth-client.ts";
import { apiRequest } from "./api-client.ts";
import { getPersonalWorkbenchSnapshot, rememberPersonalWorkbenchSnapshot } from "./personal-workbench-cache.ts";

const rootSource = await readFile(new URL("../root.tsx", import.meta.url), "utf8");
const navbarSource = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const homeSource = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const authClientSource = await readFile(new URL("./auth-client.ts", import.meta.url), "utf8");
const dashboardLayoutSource = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");

test("keeps an anonymous result briefly, then requires a fresh check", () => {
  const cache = new AuthSessionCache();
  const checkedAt = 10_000;

  cache.setAnonymous(checkedAt);

  assert.equal(cache.getUser(), null);
  assert.equal(cache.hasFreshAnonymousResult(checkedAt), true);
  assert.equal(cache.hasFreshAnonymousResult(checkedAt + ANONYMOUS_SESSION_CACHE_TTL_MS - 1), true);
  assert.equal(cache.hasFreshAnonymousResult(checkedAt + ANONYMOUS_SESSION_CACHE_TTL_MS), false);
});

test("does not let an older unauthorized response erase a later login", () => {
  const cache = new AuthSessionCache();
  const requestVersion = cache.version;
  const user = { id: 7, role: "admin" };

  cache.setAuthenticated(user);

  assert.equal(cache.acceptAnonymousRequest(requestVersion, 20_000), false);
  assert.deepEqual(cache.getUser(), user);
});

test("accepts the current session lookup and expires its anonymous result", () => {
  const cache = new AuthSessionCache();
  const requestVersion = cache.version;
  const user = { id: 11, role: "user" };

  assert.equal(cache.acceptAuthenticatedRequest(requestVersion, user), true);
  assert.deepEqual(cache.getUser(), user);

  const nextRequestVersion = cache.version;
  assert.equal(cache.acceptAnonymousRequest(nextRequestVersion, 30_000), true);
  assert.equal(cache.getUser(), null);
  assert.equal(cache.hasFreshAnonymousResult(30_001), true);
});

test("keeps a verified user available across ordinary navigation lifetimes", () => {
  const cache = new AuthSessionCache();
  const checkedAt = 40_000;
  const user = { id: 13, role: "admin" };

  cache.setAuthenticated(user, checkedAt);

  assert.equal(cache.needsRevalidation(checkedAt + AUTH_SESSION_REVALIDATE_AFTER_MS - 1), false);
  assert.equal(cache.needsRevalidation(checkedAt + AUTH_SESSION_REVALIDATE_AFTER_MS), true);
  assert.deepEqual(cache.getUser(), user);
});

test("clearing a session cache invalidates both identity and in-flight response generations", () => {
  const cache = new AuthSessionCache();
  const oldRequestVersion = cache.version;
  cache.setAuthenticated({ id: 12 });
  const activeRequestVersion = cache.version;

  cache.clear();

  assert.equal(cache.getUser(), null);
  assert.equal(cache.hasFreshAnonymousResult(), false);
  assert.equal(cache.acceptAuthenticatedRequest(activeRequestVersion, { id: 12 }), false);
  assert.equal(cache.acceptAnonymousRequest(oldRequestVersion), false);
});

test("coalesces active identity checks and invalidates them on cross-tab account changes", () => {
  assert.match(authClientSource, /if \(currentUserRequest\) \{\s*return currentUserRequest;/);
  assert.doesNotMatch(authClientSource, /if \(options\.force\) currentUserRequest = null/);
  assert.match(authClientSource, /authSessionCache\.clear\(\);\s*invalidateCurrentUserRequest\(\);\s*invalidateUserGroupConfirmationStateCache\(\);\s*for \(const listener of accountSessionListeners\) listener\(\);/);
  assert.match(authClientSource, /function invalidateCurrentUserRequest\(\)[\s\S]*?currentUserRequestGeneration \+= 1/);
});

test("auth identity requests are deduplicated and API 500 keeps the last verified user", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let failWith500 = false;
  let failWith401 = false;
  let failProtectedRequest = false;
  const user = { id: 91_321, email: "cache@example.test", role: { id: 1, name: "admin", displayName: "管理员" } };
  globalThis.fetch = async (url) => {
    requests += 1;
    if (String(url) === "/api/private") {
      assert.equal(failProtectedRequest, true);
      return new Response(JSON.stringify({ code: 401, message: "protected" }), { status: 401 });
    }
    assert.equal(String(url), "/api/me");
    if (failWith500) return new Response(JSON.stringify({ code: 500, message: "temporary" }), { status: 500 });
    if (failWith401) return new Response(JSON.stringify({ code: 401, message: "session expired" }), { status: 401 });
    return new Response(JSON.stringify({ code: 0, message: "ok", data: { user } }), { status: 200 });
  };
  try {
    assert.deepEqual(await getCurrentUser(), user);
    assert.deepEqual(await getCurrentUser(), user);
    assert.equal(requests, 1);
    failWith500 = true;
    await assert.rejects(getCurrentUser({ force: true }), /temporary/);
    assert.deepEqual(getCachedCurrentUser(), user);
    assert.deepEqual(await getCurrentUser(), user);
    assert.equal(requests, 2);

    failWith500 = false;
    failProtectedRequest = true;
    await assert.rejects(apiRequest("/api/private"), /protected/);
    assert.equal(getCachedCurrentUser(), null);
    failProtectedRequest = false;
    assert.deepEqual(await getCurrentUser({ force: true }), user);
    assert.equal(requests, 4);

    failWith401 = true;
    const privateSnapshotKey = JSON.stringify([user.id, "member", false, false, "none"]);
    rememberPersonalWorkbenchSnapshot(privateSnapshotKey, { private: true });
    await assert.rejects(getCurrentUser({ force: true }), /session expired/);
    assert.equal(getCachedCurrentUser(), null);
    assert.equal(getPersonalWorkbenchSnapshot(privateSnapshotKey), undefined);
    assert.equal(requests, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("logout clears the previous account's in-memory workbench snapshot", async () => {
  const originalFetch = globalThis.fetch;
  const user = { id: 91_323, email: "logout@example.test", role: { id: 1, name: "admin", displayName: "管理员" } };
  const snapshotKey = JSON.stringify([user.id, "admin", true, true, "8:1"]);
  globalThis.fetch = async (url) => String(url) === "/api/me"
    ? new Response(JSON.stringify({ code: 0, message: "ok", data: { user } }), { status: 200 })
    : new Response(JSON.stringify({ code: 0, message: "ok", data: null }), { status: 200 });
  try {
    assert.deepEqual(await getCurrentUser({ force: true }), user);
    rememberPersonalWorkbenchSnapshot(snapshotKey, { private: true });
    await logout();
    assert.equal(getCachedCurrentUser(), null);
    assert.equal(getPersonalWorkbenchSnapshot(snapshotKey), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("login, account switching, and cross-tab messages keep identity, profile, and permissions distinct", async () => {
  const originalFetch = globalThis.fetch;
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  const firstUser = { id: 91_324, email: "first@example.test", realName: "First", role: { id: 1, name: "admin", displayName: "管理员" } };
  const secondUser = { id: 91_325, email: "second@example.test", realName: "Second", role: { id: 2, name: "member", displayName: "成员" } };
  class BroadcastChannelMock {
    static active = new Set();
    listeners = new Set();
    constructor(name) { this.name = name; BroadcastChannelMock.active.add(this); }
    addEventListener(_type, listener) { this.listeners.add(listener); }
    removeEventListener(_type, listener) { this.listeners.delete(listener); }
    postMessage(message) {
      for (const channel of BroadcastChannelMock.active) {
        if (channel !== this && channel.name === this.name) channel.dispatch(message);
      }
    }
    dispatch(data) { for (const listener of this.listeners) listener({ data }); }
    close() { BroadcastChannelMock.active.delete(this); }
    static sendFromAnotherTab(data) {
      for (const channel of BroadcastChannelMock.active) channel.dispatch(data);
    }
  }
  let accountChanges = 0;
  let permissionChanges = [];
  const observedUsers = [];
  globalThis.BroadcastChannel = BroadcastChannelMock;
  globalThis.fetch = async (url) => {
    if (String(url) === "/api/login/email/password") {
      return new Response(JSON.stringify({ code: 0, message: "ok", data: { user: firstUser } }), { status: 200 });
    }
    if (String(url) === "/api/account-sessions/switch") {
      return new Response(JSON.stringify({ code: 0, message: "ok", data: { user: secondUser, accounts: [] } }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${String(url)}`);
  };
  const unsubscribeAccount = subscribeAccountSessionChange(() => { accountChanges += 1; });
  const unsubscribeAuth = subscribeAuthStateChange((user) => observedUsers.push(user));
  const unsubscribePermission = subscribePermissionChange((userId) => permissionChanges.push(userId));
  try {
    assert.deepEqual(await loginWithPassword({ email: firstUser.email, password: "not-stored" }), firstUser);
    assert.deepEqual(getCachedCurrentUser(), firstUser);
    const oldSnapshotKey = JSON.stringify([firstUser.id, "admin", true, true, "8:1"]);
    rememberPersonalWorkbenchSnapshot(oldSnapshotKey, { private: true });
    assert.deepEqual((await switchAccountSession(44)).user, secondUser);
    assert.deepEqual(getCachedCurrentUser(), secondUser);
    assert.equal(getPersonalWorkbenchSnapshot(oldSnapshotKey), undefined);

    BroadcastChannelMock.sendFromAnotherTab({ type: "profile-updated", source: "other-tab", user: { ...secondUser, realName: "Updated" } });
    assert.equal(getCachedCurrentUser()?.realName, "Updated");
    assert.equal(accountChanges, 0);
    assert.equal(observedUsers.at(-1)?.realName, "Updated");

    BroadcastChannelMock.sendFromAnotherTab({ type: "permissions-changed", source: "other-tab", userId: secondUser.id });
    assert.deepEqual(permissionChanges, [secondUser.id]);
    assert.equal(accountChanges, 0);

    BroadcastChannelMock.sendFromAnotherTab({ type: "identity-changed", source: "other-tab" });
    assert.equal(getCachedCurrentUser(), null);
    assert.equal(accountChanges, 1);
  } finally {
    unsubscribeAccount();
    unsubscribeAuth();
    unsubscribePermission();
    globalThis.fetch = originalFetch;
    globalThis.BroadcastChannel = originalBroadcastChannel;
  }
});

test("a rejected profile update clears the current session on 401", async () => {
  const originalFetch = globalThis.fetch;
  const user = { id: 91_322, email: "profile@example.test", role: { id: 1, name: "admin", displayName: "管理员" } };
  let profileUpdate = false;
  globalThis.fetch = async (url, options) => {
    if (String(url) === "/api/me" && options?.method === "PUT") {
      profileUpdate = true;
      return new Response(JSON.stringify({ code: 401, message: "session expired" }), { status: 401 });
    }
    assert.equal(String(url), "/api/me");
    return new Response(JSON.stringify({ code: 0, message: "ok", data: { user } }), { status: 200 });
  };
  try {
    assert.deepEqual(await getCurrentUser({ force: true }), user);
    await assert.rejects(apiRequest("/api/me", { method: "PUT", body: { realName: "Updated" } }), /session expired/);
    assert.equal(profileUpdate, true);
    assert.equal(getCachedCurrentUser(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dashboard verifies identity before a single account-scoped group query", () => {
  const clientLoaderSource = dashboardLayoutSource.slice(dashboardLayoutSource.indexOf("export async function clientLoader"), dashboardLayoutSource.indexOf("clientLoader.hydrate"));
  const groupRequestIndex = dashboardLayoutSource.indexOf("getUserGroupConfirmationState(currentUser.id)");
  const authRequestIndex = dashboardLayoutSource.indexOf("const auth = await resolveDashboardAuth(");
  assert.ok(groupRequestIndex > authRequestIndex);
  assert.doesNotMatch(clientLoaderSource, /const groupRequest =/);
  assert.match(dashboardLayoutSource, /getUserGroupConfirmationState\(currentUser\.id\)/);
  assert.match(dashboardLayoutSource, /getCurrentUser: \(\) => getCurrentUser\(\)/);
  assert.match(dashboardLayoutSource, /refreshUserGroupConfirmationState/);
});

test("ordinary navigation reuses auth and group data while focus rechecks stale state in the background", () => {
  const resumeStart = dashboardLayoutSource.indexOf("const revalidateOnResume =");
  const resumeEnd = dashboardLayoutSource.indexOf('window.addEventListener("focus", revalidateOnResume)', resumeStart);
  assert.match(dashboardLayoutSource, /window\.addEventListener\("focus", revalidateOnResume\)/);
  assert.match(dashboardLayoutSource, /needsCurrentUserRevalidation\(\)/);
  assert.match(dashboardLayoutSource, /needsUserGroupConfirmationRefresh\(currentUser\.id\)/);
  assert.match(dashboardLayoutSource, /Promise\.allSettled\(\[userRequest, groupRequest\]\)/);
  assert.doesNotMatch(dashboardLayoutSource.slice(resumeStart, resumeEnd), /setAccountSyncing\(true\)|lastAuthRevalidationAtRef/);
  assert.match(dashboardLayoutSource.slice(resumeStart, resumeEnd), /revalidateOnResume\(\);/);
  assert.match(dashboardLayoutSource, /\[currentUser, location\.key, navigate, revalidator\]/);
  assert.doesNotMatch(dashboardLayoutSource, /window\.location\.assign/);
  assert.match(dashboardLayoutSource, /subscribeAccountSessionChange\(\(\) => \{\s*void refreshAccountIdentity\(\)/);
});

test("profile updates synchronize as profile data without being announced as account changes", () => {
  const updateProfileSource = authClientSource.slice(authClientSource.indexOf("export async function updateProfile"), authClientSource.indexOf("export function getCachedCurrentUser"));
  assert.match(updateProfileSource, /announceProfileUpdate\(data\.user\)/);
  assert.doesNotMatch(updateProfileSource, /announceAccountSessionChange\(\)/);
  assert.match(authClientSource, /type: "profile-updated"/);
  assert.match(homeSource, /<Navbar \/>/);
  assert.doesNotMatch(homeSource, /getOptionalCurrentUser|subscribeAuthStateChange|subscribeAccountSessionChange/);
});

test("a request from an older session cannot overwrite a newer account", () => {
  const cache = new AuthSessionCache();
  const oldRequestVersion = cache.version;

  cache.setAuthenticated({ id: 1, role: "user" });
  const newRequestVersion = cache.version;
  cache.setAuthenticated({ id: 2, role: "admin" });

  assert.equal(cache.acceptAuthenticatedRequest(newRequestVersion, { id: 1, role: "user" }), false);
  assert.equal(cache.acceptAnonymousRequest(oldRequestVersion), false);
  assert.deepEqual(cache.getUser(), { id: 2, role: "admin" });
});

test("dashboard route feedback appears immediately and stale group results stay visible during refresh", async () => {
  const groupClientSource = await readFile(new URL("./user-group-client.ts", import.meta.url), "utf8");
  assert.match(rootSource, /\{isNavigating \?/);
  assert.match(rootSource, /route-progress__line/);
  assert.doesNotMatch(rootSource, /ROUTE_PROGRESS_REVEAL_DELAY_MS|routeProgressReducer/);
  assert.doesNotMatch(groupClientSource, /TTL|expiresAt/);
  assert.match(groupClientSource, /confirmationCache\.set\(accountId, \{ state, stale: false, verifiedAt:/);
  assert.match(groupClientSource, /needsUserGroupConfirmationRefresh/);
  assert.match(groupClientSource, /markUserGroupConfirmationStateStale/);
  assert.match(authClientSource, /invalidateUserGroupConfirmationStateCache\(\)/);
});

test("account-vault setup stays on demand and high-priority workbench pages preload early", () => {
  const openAccountModalIndex = dashboardLayoutSource.indexOf("async function openAccountModal");
  assert.ok(openAccountModalIndex > 0);
  assert.doesNotMatch(dashboardLayoutSource.slice(0, openAccountModalIndex), /initializeAccountSessions\(\)/);
  assert.match(dashboardLayoutSource, /async function openAccountModal[\s\S]*?initializeAccountSessions\(\)/);
  assert.match(dashboardLayoutSource, /new Set\(\["management"\]\)/);
  assert.match(navbarSource, /requestIdleCallback\([\s\S]*?timeout: 250/);
});

test("the default homepage preloads the small login route without preloading dashboards for guests", () => {
  assert.match(navbarSource, /<PrefetchPageLinks page="\/login"\s*\/>/);
  assert.match(navbarSource, /variant === "default" && visibleUser && dashboardPrefetchUserId === visibleUser\.id/);
});

test("critical navigation paths keep route prefetch and load analytics data after render", async () => {
  const routesSource = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
  const analyticsSource = await readFile(new URL("../routes/admin/recruitment-analytics.tsx", import.meta.url), "utf8");

  assert.match(navbarSource, /<PrefetchPageLinks page=\{getDefaultDashboardPath\(visibleUser\.role\.name\)\}\s*\/>/);
  assert.match(dashboardLayoutSource, /prefetch=\{HIGH_PRIORITY_RENDER_PREFETCH_KEYS\.has\(item\.key\) \? "render" : "intent"\}/);
  assert.match(routesSource, /route\("admin\/recruitment-analytics", "routes\/admin\/recruitment-analytics\.tsx"\)/);
  assert.match(analyticsSource, /useEffect\(\(\) => \{[\s\S]*?getRecruitmentAnalytics\(controller\.signal\)/);
  assert.doesNotMatch(analyticsSource, /export\s+(?:async\s+)?function\s+(?:clientLoader|loader)\b/);
});
