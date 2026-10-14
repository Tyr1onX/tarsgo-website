import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../routes/admin/recruitment-analytics.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("./recruitment-analytics-client.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
const backendService = readFileSync(new URL("../../../backend/service/recruitmentanalytics/service.go", import.meta.url), "utf8");
const styles = readFileSync(new URL("../admin-design.css", import.meta.url), "utf8");

test("analytics route is super-admin only and uses a dedicated read-only summary endpoint", () => {
  assert.match(route, /currentUser\.role\.name !== "super_admin"/);
  assert.match(client, /api\/admin\/recruitment-analytics/);
  assert.match(router, /superAdminAPI\.GET\("\/recruitment-analytics", recruitmentAnalyticsHandler\.GetReport\)/);
  assert.match(backendService, /roleName != RoleNameSuperAdmin/);
  assert.doesNotMatch(client, /contactName|contactEmail|contactPhone|formData|userId/);
  assert.doesNotMatch(backendService, /Select\([^\n]*(contact_name|contact_email|contact_phone|form_data|user_id)/i);
});

test("overview separates form cohorts, registration records, admission, and member relations", () => {
  assert.match(route, /招新届次（独立报名表）/);
  assert.match(route, /累计报名记录/);
  assert.match(route, /累计录取记录/);
  assert.match(route, /录取率/);
  assert.match(route, /未通过/);
  assert.match(route, /撤回/);
  assert.match(route, /已匹配正式成员关系/);
  assert.match(route, /不代表单独登记的入队事件/);
  assert.match(route, /同一年多个批次分别统计，不按年份合并/);
  assert.match(route, /跨届累计不做用户去重/);
});

test("cohort selection and group comparison have accessible table alternatives and empty states", () => {
  assert.match(route, /id="analytics-cohort-select"/);
  assert.match(route, /aria-label="各届招新报名记录与录取记录对比柱状图"/);
  assert.match(route, /caption className="sr-only"/);
  assert.match(route, /暂无数据/);
  assert.match(route, /各届组别意向变化/);
  assert.match(route, /generatedAt/);
  assert.match(styles, /\.recruitment-analytics__chart-scroll[\s\S]*?overflow-x: auto/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.recruitment-analytics__overview[\s\S]*?grid-template-columns: 1fr/);
});
