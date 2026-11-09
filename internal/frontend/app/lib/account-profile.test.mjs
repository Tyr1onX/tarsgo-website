import assert from "node:assert/strict";
import test from "node:test";
import { inferCollege, inferGrade, profileComplete, salonReturnPath, updateAcademicStudentId } from "./account-profile.ts";

test("JLU verified college families use year digits 3-4; other formats stay manual", () => {
  assert.equal(inferGrade("20241421", 2026), "2024 级");
  assert.equal(inferGrade("35230317", 2026), "2023 级");
  for (const id of ["99241421", "2024142101", "OTHER123", "20271421", "20240000"]) assert.equal(inferGrade(id, 2026), "");
});
test("verified JLU student prefixes suggest a college without changing manual choices", () => {
  const cases = {
    "14250801": "机械与航空航天工程学院",
    "16250918": "材料科学与工程学院",
    "17240530": "交通学院",
    "19240412": "电子科学与工程学院",
    "20241421": "通信工程学院",
    "21251029": "计算机科学与技术学院",
    "24241109": "建设工程学院",
    "29240306": "人工智能学院",
    "35261003": "商学与管理学院",
  };
  for (const [id, college] of Object.entries(cases)) assert.equal(inferCollege(id, 2026), college);
  for (const id of ["", "2024142", "99241421", "20271421", "20240000", "2024142101", "OTHER123"]) assert.equal(inferCollege(id, 2026), "");
  const empty = { isStudent: true, studentId: "", college: "", grade: "" };
  const inferred = updateAcademicStudentId(empty, "20241421");
  assert.equal(inferred.college, "通信工程学院");
  assert.equal(inferred.grade, "2024 级");
  assert.equal(updateAcademicStudentId(inferred, "21251029").college, "计算机科学与技术学院");
  assert.equal(updateAcademicStudentId(inferred, "2024142").college, "");
  const manual = { ...inferred, college: "材料科学与工程学院" };
  assert.equal(updateAcademicStudentId(manual, "21251029").college, "材料科学与工程学院");
  assert.equal(updateAcademicStudentId(manual, "2024142").college, "材料科学与工程学院");
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
