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

test("team dashboard shows two evidence-based metrics, unknown baselines and drill-down", async () => {
  const page = await readFile(new URL("../routes/admin/team-state.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../routes/admin/team-state.css", import.meta.url), "utf8");

  assert.match(page, /value === null \? "—"/);
  assert.match(page, /已证实达成/);
  assert.match(page, /验收证据覆盖/);
  assert.match(page, /aria-valuetext=\{row\.value === null \? "尚未建立有效验收基线"/);
  assert.match(page, /snapshot\.domains\.technology/);
  assert.match(page, /snapshot\.domains\.operations/);
  assert.match(page, /snapshot\.domains\.organization/);
  assert.match(page, /item\.acceptance/);
  assert.match(page, /function GoalState/);
  assert.match(page, /setSelectedID\(item\.id\)/);
  assert.match(page, /task\.status === "已完成" && !task\.completedAt/);
  assert.match(styles, /\.team-state__meter--passed/);
  assert.match(styles, /\.team-state__meter--evidence/);
  assert.match(styles, /\.team-state__goal-state--failed/);
});
