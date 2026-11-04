import assert from "node:assert/strict";
import test from "node:test";
import { inferGrade, profileComplete, salonReturnPath } from "./account-profile.ts";

test("JLU verified college families use year digits 3-4; other formats stay manual", () => {
  assert.equal(inferGrade("20241421", 2026), "2024 级");
  assert.equal(inferGrade("35230317", 2026), "2023 级");
  for (const id of ["99241421", "2024142101", "OTHER123", "20271421", "20240000"]) assert.equal(inferGrade(id, 2026), "");
});
test("nonstudents need basic identity and students need academic details", () => {
  const p = { realName: "测试", email: "synthetic@tarsgo.test", isStudent: false, studentId: "", college: "", grade: "" };
  assert(profileComplete(p));
  assert(!profileComplete({ ...p, isStudent: null }));
  assert(!profileComplete({ ...p, isStudent: true }));
  assert(profileComplete({ ...p, isStudent: true, studentId: "OTHER123", college: "学院", grade: "2023 级" }));
});
test("profile return targets are restricted to event detail paths", () => {
  assert.equal(salonReturnPath("/programs/ai-salon/123"), "/programs/ai-salon/123");
  for (const value of [null, "//evil.test", "/dashboard", "/programs/ai-salon/1?x=1"]) assert.equal(salonReturnPath(value), null);
});
