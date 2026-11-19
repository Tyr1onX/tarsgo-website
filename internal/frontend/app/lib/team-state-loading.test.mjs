import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("team status reuses the shared delayed skeleton style while its first snapshot loads", async () => {
  const page = await readFile(new URL("../routes/admin/team-state.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");

  assert.match(page, /function TeamStateSkeleton\(\)/);
  assert.match(page, /content-skeleton space-y-4" role="status" aria-label="正在读取战队运行状态"/);
  assert.match(page, /motion-safe:animate-pulse space-y-4" aria-hidden="true"/);
  assert.match(page, /team-state__domains/);
  assert.match(page, /team-state__project-grid/);
  assert.match(page, /team-state__columns/);
  assert.match(page, /loading && !snapshot && <TeamStateSkeleton \/>/);
  assert.match(page, /\{snapshot && <>/);
  assert.doesNotMatch(page, /className="team-state__empty">正在读取战队运行状态/);
  assert.match(styles, /\.content-skeleton\s*\{\s*animation: content-skeleton-appear 0s 300ms both;/);
});
