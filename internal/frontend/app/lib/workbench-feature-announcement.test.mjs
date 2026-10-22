import assert from "node:assert/strict";
import test from "node:test";

import { FEATURE_GUIDE_DATE, FEATURE_GUIDE_TITLE, WORKBENCH_FEATURES, getWorkbenchAdminAction, getWorkbenchFeaturesForMember } from "./workbench-feature-announcement.ts";

test("feature guide exposes the agreed title, date, statuses, and destinations", () => {
  assert.equal(FEATURE_GUIDE_TITLE, "吉甲大师官网更新｜新人培养与 TARS BASE 使用指南");
  assert.equal(FEATURE_GUIDE_DATE, "2026 年 10 月 22 日");
  assert.deepEqual(WORKBENCH_FEATURES.map(({ status }) => status), [
    "已上线 · 试运行",
    "已上线 · 试运行",
    "已上线 · 持续完善",
    "测试阶段 · 待配置",
    "V1 体验版",
    "测试阶段 · 待开放",
  ]);
  assert.ok(WORKBENCH_FEATURES.every(({ href }) => href.startsWith("/dashboard/")));
});

test("technical members see technical learning features and operations members do not", () => {
  const technical = getWorkbenchFeaturesForMember("user", ["机械组"]).map(({ key }) => key);
  assert.deepEqual(technical, ["assignments", "questions", "growth", "skills", "base", "collaboration"]);

  const operations = getWorkbenchFeaturesForMember("user", ["运营组"]).map(({ key }) => key);
  assert.deepEqual(operations, ["growth", "skills", "base", "collaboration"]);
});

test("ungrouped members see general growth information and super admins can review all features", () => {
  assert.deepEqual(getWorkbenchFeaturesForMember("user").map(({ key }) => key), ["growth"]);
  assert.equal(getWorkbenchFeaturesForMember("super_admin").length, 6);
});

test("admin-only links are hidden from members and constrained to assigned groups", () => {
  const assignments = WORKBENCH_FEATURES.find(({ key }) => key === "assignments");
  const skills = WORKBENCH_FEATURES.find(({ key }) => key === "skills");
  assert.ok(assignments && skills);
  assert.equal(getWorkbenchAdminAction(assignments, "user", ["机械组"]), null);
  assert.equal(getWorkbenchAdminAction(assignments, "admin", ["运营组"]), null);
  assert.equal(getWorkbenchAdminAction(assignments, "admin", ["机械组"])?.href, "/dashboard/admin/training/assignments");
  assert.equal(getWorkbenchAdminAction(skills, "admin", ["运营组"])?.href, "/dashboard/admin/training/skills");
  assert.equal(getWorkbenchAdminAction(assignments, "super_admin")?.href, "/dashboard/admin/training/assignments");
});
