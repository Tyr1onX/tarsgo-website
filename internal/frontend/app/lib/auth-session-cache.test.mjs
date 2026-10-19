import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ANONYMOUS_SESSION_CACHE_TTL_MS,
  AUTHENTICATED_SESSION_CACHE_TTL_MS,
  AuthSessionCache,
} from "./auth-session-cache.ts";

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

test("reuses a recently verified user only for a bounded period", () => {
  const cache = new AuthSessionCache();
  const checkedAt = 40_000;
  const user = { id: 13, role: "admin" };

  cache.setAuthenticated(user, checkedAt);

  assert.deepEqual(cache.getUser(checkedAt + AUTHENTICATED_SESSION_CACHE_TTL_MS - 1), user);
  assert.equal(cache.getUser(checkedAt + AUTHENTICATED_SESSION_CACHE_TTL_MS), null);
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
  assert.match(authClientSource, /authSessionCache\.clear\(\);\s*invalidateCurrentUserRequest\(\);\s*invalidateUserGroupConfirmationStateCache\(\);\s*notifyAuthStateChange\(null\);/);
  assert.match(authClientSource, /function invalidateCurrentUserRequest\(\)[\s\S]*?currentUserRequestGeneration \+= 1/);
});

test("dashboard reuses fresh identity and group checks while starting cold checks in parallel", () => {
  const groupRequestIndex = dashboardLayoutSource.indexOf("const groupRequest = getUserGroupConfirmationState(cachedUser?.id)");
  const authRequestIndex = dashboardLayoutSource.indexOf("const auth = await resolveDashboardAuth(");
  assert.ok(groupRequestIndex >= 0 && authRequestIndex > groupRequestIndex);
  assert.match(dashboardLayoutSource, /const cachedUser = getCachedCurrentUser\(\)/);
  assert.match(dashboardLayoutSource, /getUserGroupConfirmationState\(cachedUser\?\.id\)/);
  assert.match(dashboardLayoutSource, /getCurrentUser: \(\) => getCurrentUser\(\)/);
  assert.doesNotMatch(dashboardLayoutSource, /getCurrentUser\(\{\s*force:\s*true\s*\}\)/);
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

test("dashboard route feedback appears immediately and cache invalidation follows a group confirmation", async () => {
  const groupClientSource = await readFile(new URL("./user-group-client.ts", import.meta.url), "utf8");
  assert.match(rootSource, /\{isNavigating \?/);
  assert.match(rootSource, /route-progress__line/);
  assert.doesNotMatch(rootSource, /ROUTE_PROGRESS_REVEAL_DELAY_MS|routeProgressReducer/);
  assert.match(groupClientSource, /CONFIRMATION_CACHE_TTL_MS = 10_000/);
  assert.match(groupClientSource, /confirmationCacheGeneration \+= 1/);
  assert.match(groupClientSource, /confirmationCache\.clear\(\)/);
  assert.match(authClientSource, /invalidateUserGroupConfirmationStateCache\(\)/);
});

test("account-vault setup stays on demand and high-priority workbench pages preload early", () => {
  const openAccountModalIndex = dashboardLayoutSource.indexOf("async function openAccountModal");
  assert.ok(openAccountModalIndex > 0);
  assert.doesNotMatch(dashboardLayoutSource.slice(0, openAccountModalIndex), /initializeAccountSessions\(\)/);
  assert.match(dashboardLayoutSource, /async function openAccountModal[\s\S]*?initializeAccountSessions\(\)/);
  assert.match(dashboardLayoutSource, /new Set\(\["admin-panel", "candidate-processing", "recruitment-analytics"\]\)/);
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
