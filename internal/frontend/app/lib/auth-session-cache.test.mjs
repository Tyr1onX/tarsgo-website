import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ANONYMOUS_SESSION_CACHE_TTL_MS, AuthSessionCache } from "./auth-session-cache.ts";

const rootSource = await readFile(new URL("../root.tsx", import.meta.url), "utf8");
const navbarSource = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");

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
