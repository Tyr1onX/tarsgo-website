import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ANONYMOUS_SESSION_CACHE_TTL_MS, AuthSessionCache } from "./auth-session-cache.ts";

const rootSource = await readFile(new URL("../root.tsx", import.meta.url), "utf8");
const navbarSource = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
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
  assert.match(authClientSource, /authSessionCache\.clear\(\);\s*invalidateCurrentUserRequest\(\);\s*notifyAuthStateChange\(null\);/);
  assert.match(authClientSource, /function invalidateCurrentUserRequest\(\)[\s\S]*?currentUserRequestGeneration \+= 1/);
});

test("dashboard starts group confirmation alongside a server-verified identity lookup", () => {
  const groupRequestIndex = dashboardLayoutSource.indexOf("const groupRequest = getUserGroupConfirmationState()");
  const authRequestIndex = dashboardLayoutSource.indexOf("const auth = await resolveDashboardAuth(");
  assert.ok(groupRequestIndex >= 0 && authRequestIndex > groupRequestIndex);
  assert.doesNotMatch(dashboardLayoutSource, /cachedUser:\s*getCachedCurrentUser/);
});

test("dashboard revalidates authorization after a resumed session without polling on every focus", () => {
  assert.match(dashboardLayoutSource, /lastAuthRevalidationAtRef = useRef\(Date\.now\(\)\)/);
  assert.match(dashboardLayoutSource, /Date\.now\(\) - lastAuthRevalidationAtRef\.current < 30_000/);
  assert.match(dashboardLayoutSource, /lastAuthRevalidationAtRef\.current = Date\.now\(\);\s*void revalidator\.revalidate\(\)/);
  assert.match(dashboardLayoutSource, /window\.addEventListener\("focus", revalidateAuthWhenResumed\)/);
});

test("a request from an older session cannot overwrite a newer account", () => {
  const cache = new AuthSessionCache();
  const oldRequestVersion = cache.version;

  cache.setAuthenticated({ id: 1, role: "user" });
  const newRequestVersion = cache.version;
  cache.setAuthenticated({ id: 2, role: "admin" });

  assert.equal(cache.acceptAuthenticatedRequest(newRequestVersion, { id: 1, role: "user" }), false);
  assert.equal(cache.acceptFailedRequest(oldRequestVersion), false);
  assert.deepEqual(cache.getUser(), { id: 2, role: "admin" });
});

test("global route loading uses the gold progress bar and no legacy full-screen spinner", () => {
  assert.match(rootSource, /route-progress/);
  assert.match(rootSource, /#D0AD69/);
  assert.doesNotMatch(rootSource, /TARS-GO|animate-spin|primary-300/);
  assert.match(rootSource, /setTimeout\([\s\S]*?120/);
});

test("the default homepage preloads the small login route without preloading dashboards for guests", () => {
  assert.match(navbarSource, /<PrefetchPageLinks page="\/login"\s*\/>/);
  assert.match(navbarSource, /variant === "default" && visibleUser && dashboardPrefetchUserId === visibleUser\.id/);
});
