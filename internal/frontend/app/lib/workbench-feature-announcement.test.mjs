import assert from "node:assert/strict";
import test from "node:test";

import { FEATURE_GUIDE_DATE, FEATURE_GUIDE_TITLE, GROUP_ACCESS_HELP, WORKBENCH_FEATURES, getWorkbenchAdminAction, getWorkbenchFeaturesForMember } from "./workbench-feature-announcement.ts";

test("feature guide exposes the agreed title, date, statuses, and destinations", () => {
  assert.equal(FEATURE_GUIDE_TITLE, "吉甲大师工作台调整｜日常事务与作业指南");
  assert.equal(FEATURE_GUIDE_DATE, "2026 年 10 月 30 日");
  assert.match(GROUP_ACCESS_HELP, /联系战队运营负责人核对/);
  assert.deepEqual(WORKBENCH_FEATURES.map(({ status }) => status), [
    "已开放",
    "暂未开放",
    "暂未开放",
    "暂未开放",
    "暂未开放",
    "暂未开放",
  ]);
  assert.ok(WORKBENCH_FEATURES.every(({ href }) => href.startsWith("/dashboard/")));
});

test("only assignment workflow is announced and all five groups can use it", () => {
  for (const group of ["机械组", "电控组", "视觉组", "AI组", "运营组"]) {
    assert.deepEqual(getWorkbenchFeaturesForMember("user", [group]).map(({ key }) => key), ["assignments"]);
  }
});

test("unassigned members get no assignment card and super admins retain all-group entry", () => {
  assert.deepEqual(getWorkbenchFeaturesForMember("user").map(({ key }) => key), []);
  assert.deepEqual(getWorkbenchFeaturesForMember("super_admin").map(({ key }) => key), ["assignments"]);
});

test("admin-only links are hidden from members and constrained to assigned groups", () => {
  const assignments = WORKBENCH_FEATURES.find(({ key }) => key === "assignments");
  const skills = WORKBENCH_FEATURES.find(({ key }) => key === "skills");
  assert.ok(assignments && skills);
  assert.equal(getWorkbenchAdminAction(assignments, "user", ["机械组"]), null);
  assert.equal(getWorkbenchAdminAction(assignments, "admin", ["运营组"])?.href, "/dashboard/admin/training/assignments");
  assert.equal(getWorkbenchAdminAction(assignments, "admin", ["机械组"])?.href, "/dashboard/admin/training/assignments");
  assert.equal(getWorkbenchAdminAction(skills, "admin", ["运营组"]), null);
  assert.equal(getWorkbenchAdminAction(assignments, "super_admin")?.href, "/dashboard/admin/training/assignments");
});
