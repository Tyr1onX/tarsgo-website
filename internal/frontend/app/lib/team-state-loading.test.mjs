import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("technical dashboard reuses shared delayed skeleton and matches the six-group layout", async () => {
  const page = await readFile(new URL("../routes/admin/team-state.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");

  assert.match(page, /function TeamStateSkeleton\(\)/);
  assert.match(page, /content-skeleton space-y-4" role="status" aria-label="正在读取技术研发进度"/);
  assert.match(page, /motion-safe:animate-pulse space-y-4" aria-hidden="true"/);
  assert.match(page, /team-state__stats/);
  assert.match(page, /team-state__project-grid/);
  assert.match(page, /\[0, 1, 2, 3, 4, 5\]/);
  assert.match(page, /loading && !snapshot && <TeamStateSkeleton \/>/);
  assert.match(page, /\{snapshot && <>/);
  assert.match(styles, /\.content-skeleton\s*\{\s*animation: content-skeleton-appear 0s 300ms both;/);
});

test("technical dashboard uses registered task progress without confusing it with season completion", async () => {
  const page = await readFile(new URL("../routes/admin/team-state.tsx", import.meta.url), "utf8");
  const nav = await readFile(new URL("./dashboard-navigation.ts", import.meta.url), "utf8");

  assert.match(page, /const percent = \(done: number, total: number\) => total > 0/);
  assert.match(page, /已录入任务完成率/);
  assert.match(page, /比例不代表赛季研发完成度/);
  assert.match(page, /lastMeetingDate/);
  assert.match(page, /project\.updates\[0\]/);
  assert.match(page, /project\.meetingUrl/);
  assert.match(page, /project\.blocker/);
  assert.match(page, /project\.nextAction/);
  assert.match(page, /setSelectedID\(p\.id\)/);
  assert.match(page, /currentUser\.role\.name !== "super_admin"/);
  assert.match(nav, /label: "技术研发总览"[^\n]+allowedRoles: \["super_admin"\]/);
  assert.doesNotMatch(page, /snapshot\.domains\.technology|snapshot\.operations|organizationFocus|AcceptanceMeters/);
});

test("technical dashboard uses fast cached reads and automatically revalidates", async () => {
  const page = await readFile(new URL("../routes/admin/team-state.tsx", import.meta.url), "utf8");

  assert.match(page, /\/api\/admin\/team-state\?refresh=1/);
  assert.match(page, /data\.refreshing/);
  assert.match(page, /setTimeout\(\(\) => void load\(\), 3000\)/);
  assert.match(page, /setInterval\(\(\) => \{ if \(!document\.hidden\) void load\(\); \}, 60000\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", onVisible\)/);
  assert.match(page, /document\.removeEventListener\("visibilitychange", onVisible\)/);
  assert.match(page, /数据更新于/);
  assert.match(page, /正在后台同步/);
  assert.match(page, /if \(inFlight \|\| controller\.signal\.aborted\) return/);
  assert.match(page, /controller\.abort\(\)/);
});

test("technical progress shows source-dated history and actionable task data-quality issues", async () => {
  const page = await readFile(new URL("../routes/admin/team-state.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../routes/admin/team-state.css", import.meta.url), "utf8");

  assert.match(page, /project\.history\.slice\(1\)\.map/);
  assert.match(page, /此前组会进展/);
  assert.match(page, /record\.date/);
  assert.match(page, /<SourceLink url=\{record\.url\}>查看组会原文<\/SourceLink>/);
  assert.match(page, /record\.updates/);
  assert.match(page, /record\.blocker/);
  assert.match(page, /record\.nextAction/);
  assert.match(page, /summary\.missingCompletedDate/);
  assert.match(page, /summary\.conflictingCompletedDate/);
  assert.match(page, /project\.missingCompletedDate/);
  assert.match(page, /project\.conflictingCompletedDate/);
  assert.match(page, /task\.status !== "已完成" && task\.completedAt/);
  assert.match(page, /请到飞书|请核对|核对具体任务|请到飞书核对|进入兵种详情查看具体任务/);
  assert.match(styles, /\.team-state__history-entry/);
  assert.match(styles, /\.team-state__quality-note/);
});
