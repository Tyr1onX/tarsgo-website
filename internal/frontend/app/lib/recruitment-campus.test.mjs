import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ui = await readFile(new URL("../routes/admin/recruitment-analytics.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("./recruitment-analytics-client.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../../../backend/service/recruitmentanalytics/service.go", import.meta.url), "utf8");

test("recruitment data displays campus counts and percentages in the selected cohort", () => {
  assert.match(ui, /校区报名分布（按学院推算）/);
  assert.match(ui, /cohort\.campuses\.map/);
  assert.match(ui, /campus\.registrationCount \* 100 \/ cohort\.registrationCount/);
  assert.match(client, /campuses: RecruitmentAnalyticsCampus\[\]/);
  assert.match(service, /json:"campuses"/);
});

test("campus totals use submission college snapshots with account fallback", () => {
  assert.match(service, /JSON_TABLE\(f\.fields_schema/);
  assert.match(service, /JSON_EXTRACT\(r\.form_data/);
  assert.match(service, /NULLIF\(TRIM\(u\.college\)/);
  assert.match(service, /COUNT\(\*\) AS count/);
  assert.match(service, /campusByForm\[college\.FormID\]\[campusForCollege/);
});
