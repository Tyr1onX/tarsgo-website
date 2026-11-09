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

test("selected cohort is the primary view with four current-cohort metrics", () => {
  assert.match(route, /findSelectedCohort\(report, selectedFormId\)/);
  assert.match(route, /report\.cohorts\[report\.cohorts\.length - 1\]/);
  assert.match(route, /id="analytics-cohort-select"/);
  assert.match(route, /onChange=\{\(event\) => setSelectedFormId\(Number\(event\.currentTarget\.value\)\)\}/);
  assert.ok(route.indexOf('id="analytics-cohort-select"') < route.indexOf("{selectedCohort ? <CohortDetails"));
  assert.match(route, /aria-label="所选届次概况"/);
  for (const label of ["报名记录", "待处理", "录取记录", "录取率"]) {
    assert.match(route, new RegExp('label: "' + label + '"'));
  }
  assert.match(route, /formatPercent\(cohort\.admissionRate\)/);
  assert.match(route, /本届报名表暂无报名数据/);
  assert.match(styles, /\.recruitment-analytics__overview\s*\{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.recruitment-analytics__overview\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("status breakdown uses actual mutually exclusive counts and keeps member matching distinct from admission", () => {
  assert.match(route, /cohort\.pendingCount/);
  assert.match(route, /cohort\.admittedCount/);
  assert.match(route, /cohort\.rejectedCount/);
  assert.match(route, /cohort\.withdrawnCount/);
  assert.match(route, /cohort\.otherStatusCount > 0/);
  assert.match(route, /statuses\.filter\(\(status\) => status\.count > 0\)/);
  assert.match(route, /flexGrow: status\.count/);
  assert.match(route, /recruitment-analytics__status-list/);
  assert.match(route, /已录取记录中匹配到正式成员关系/);
  assert.match(route, /不代表单独登记的入队事件/);
  assert.match(styles, /\.recruitment-analytics__status-track/);
});

test("groups show count and proportion of all registrations without inventing missing groups", () => {
  assert.match(route, /cohort\.groups\.length === 0/);
  assert.match(route, /cohort\.groups\.map\(\(group\)/);
  assert.match(route, /formatPercent\(group\.registrationCount \* 100 \/ cohort\.registrationCount\)/);
  assert.match(route, /width: group\.registrationCount \* 100 \/ cohort\.registrationCount \+ "%"/);
  assert.match(route, /各组百分比以该届全部报名记录为分母/);
  assert.match(styles, /\.recruitment-analytics__group-track/);
});

test("history and statistical methodology stay accessible but collapsed by default", () => {
  assert.match(route, /<details className="recruitment-analytics__panel recruitment-analytics__history">/);
  assert.match(route, /<summary>历届招新比较<\/summary>/);
  assert.match(route, /<details className="recruitment-analytics__trend-data">/);
  assert.match(route, /<summary>查看趋势数据表<\/summary>/);
  assert.match(route, /<details className="recruitment-analytics__method">/);
  assert.match(route, /<summary>统计口径<\/summary>/);
  assert.ok(route.indexOf("{selectedCohort ? <CohortDetails") < route.indexOf('<details className="recruitment-analytics__panel recruitment-analytics__history">'));
  assert.match(route, /report\.totalRegistrations/);
  assert.match(route, /report\.totalAdmitted/);
  assert.match(route, /跨届累计不对用户去重/);
  assert.match(route, /同一年多个批次分别统计/);
  assert.match(route, /不读取或传输报名者姓名、联系方式及表单答案/);
  assert.match(route, /各届主要组别变化/);
  assert.match(route, /aria-label="各届招新报名记录与录取记录对比柱状图"/);
  assert.match(route, /caption className="sr-only"/);
  assert.match(styles, /\.recruitment-analytics__chart-scroll[\s\S]*?overflow-x: auto/);
  assert.match(route, /generatedAt/);
});
