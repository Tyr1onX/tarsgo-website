import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { summarizeTrainingScores } from "./training-assessment-summary.ts";

test("groups existing scores by assessment and distinguishes missing from zero", () => {
  const result = summarizeTrainingScores({
    members: [{ userId: 1, name: "甲" }, { userId: 2, name: "乙" }, { userId: 3, name: "丙" }],
    grades: [
      { id: 1, groupId: 4, assessmentName: "第一次", userId: 1, score: 80, note: "", updatedAt: "" },
      { id: 2, groupId: 4, assessmentName: "第一次", userId: 2, score: null, note: "待核实", updatedAt: "" },
      { id: 3, groupId: 4, assessmentName: "第一次", userId: 3, score: 0, note: "", updatedAt: "" },
      { id: 4, groupId: 4, assessmentName: "第一次", userId: 99, score: 100, note: "", updatedAt: "" },
      { id: 5, groupId: 4, assessmentName: "第二次", userId: 2, score: null, note: "", updatedAt: "" },
    ],
    assignmentGrades: [
      { assignmentId: 8, assessmentName: "第一次", userId: 1, score: 100, decision: "passed" },
      { assignmentId: 8, assessmentName: "第一次", userId: 2, score: 60, decision: "needs_redo" },
    ],
    dimensions: [], ratings: [],
  });
  assert.deepEqual(result, [
    { key: "training:第一次", name: "第一次", source: "training", total: 3, scored: 2, missing: 1, average: 40 },
    { key: "training:第二次", name: "第二次", source: "training", total: 1, scored: 0, missing: 1, average: null },
    { key: "assignment:8", name: "第一次", source: "assignment", total: 2, scored: 2, missing: 0, average: 80 },
  ]);
});

test("training analysis no longer offers batch-grade imports", () => {
  const route = readFileSync(new URL("../routes/admin/training-assessment.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("./training-assessment-client.ts", import.meta.url), "utf8");
  const router = readFileSync(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
  assert.doesNotMatch(route, /批量成绩|同步成绩|未来版本？|parseTrainingGradeText/);
  assert.doesNotMatch(client, /importGrades/);
  assert.doesNotMatch(router, /training-assessments\/import/);
});
