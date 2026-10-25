import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../routes/dashboard/weekly-reports.tsx", import.meta.url), "utf8");
const style = await readFile(new URL("../routes/dashboard/weekly-reports.css", import.meta.url), "utf8");
const client = await readFile(new URL("./weekly-report-client.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../../../backend/service/weeklyreport/service.go", import.meta.url), "utf8");
const repository = await readFile(new URL("../../../backend/service/weeklyreport/repository.go", import.meta.url), "utf8");

test("weekly report opens on the current week and history lists saved records only", () => {
  assert.match(route, /useState\("current"\)/);
  assert.match(route, /已有周报/);
  assert.match(route, /dashboard\.reports\.map\(\(report\)/);
  assert.match(route, /仅显示已保存的记录/);
  assert.match(route, /返回本周/);
  assert.doesNotMatch(route, /选择要查看的周报|type="week"/);
});

test("team history choices come from stored weeks and arbitrary weeks are rejected server-side", () => {
  assert.match(client, /availableWeeks: string\[\]/);
  assert.match(route, /teamAvailableWeeks\.map\(\(weekStart\)/);
  assert.match(repository, /Distinct\("week_start"\)[\s\S]*?Where\("group_id = \?", groupID\)/);
  assert.match(service, /ListReportWeeks\(ctx, group\.GroupID\)/);
  assert.match(service, /weekStart != currentWeek && !containsWeek\(availableWeeks, weekStart\)/);
});

test("the team list is a compact one-column disclosure instead of uneven cards", () => {
  assert.match(route, /<details className="weekly-report__member weekly-report__member--submitted"/);
  assert.match(route, /<summary className="weekly-report__member-heading">/);
  assert.match(route, /已提交/);
  assert.match(route, /未提交/);
  assert.match(style, /\.weekly-report__member-list \{\s*display: grid;\s*border-top:/);
  assert.doesNotMatch(style, /grid-template-columns:\s*repeat\(auto-fill/);
});

test("team roster uses the same enabled-account and last-login boundary as account management", () => {
  assert.match(repository, /users\.status = \? AND users\.last_login_at >= \?/);
  assert.match(service, /adminuser\.AccountActivityCutoff\(s\.now\(\)\)/);
});
