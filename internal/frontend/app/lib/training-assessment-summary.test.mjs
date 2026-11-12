import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mechanicalTrainingSkills, summarizeTrainingScores, rankTrainingAssessment, trainingScoreDistribution } from "./training-assessment-summary.ts";

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

test("ranking uses one assessment, shares tied positions and excludes missing scores", () => {
  const snapshot = {
    members: [
      { userId: 1, name: "同名" }, { userId: 2, name: "同名" },
      { userId: 3, name: "丙" }, { userId: 4, name: "丁" }, { userId: 5, name: "戊" },
    ],
    grades: [
      { userId: 4, assessmentName: "第一次", score: null, note: "待核实" },
      { userId: 2, assessmentName: "第一次", score: 95, note: "" },
      { userId: 1, assessmentName: "第一次", score: 95, note: "" },
      { userId: 3, assessmentName: "第一次", score: 70, note: "" },
      { userId: 5, assessmentName: "第一次", score: 0, note: "" },
      { userId: 4, assessmentName: "第二次", score: 100, note: "" },
      { userId: 99, assessmentName: "第一次", score: 100, note: "" },
    ],
    assignmentGrades: [{ userId: 5, assignmentId: 9, assessmentName: "第一次", score: 100 }],
    dimensions: [], ratings: [],
  };
  const ranking = rankTrainingAssessment(snapshot, "training:第一次");
  assert.deepEqual(ranking.map(({ userId, score, rank }) => ({ userId, score, rank })), [
    { userId: 1, score: 95, rank: 1 },
    { userId: 2, score: 95, rank: 1 },
    { userId: 3, score: 70, rank: 3 },
    { userId: 5, score: 0, rank: 4 },
    { userId: 4, score: null, rank: null },
  ]);
  assert.equal(ranking[4].note, "待核实");
  assert.deepEqual(trainingScoreDistribution(ranking), [
    { label: "90–100", count: 2 }, { label: "80–89", count: 0 },
    { label: "70–79", count: 1 }, { label: "60–69", count: 0 },
    { label: "0–59", count: 1 }, { label: "缺失", count: 1 },
  ]);
  assert.deepEqual(rankTrainingAssessment(snapshot, "assignment:9").map(({ userId, rank }) => ({ userId, rank })), [
    { userId: 5, rank: 1 },
  ]);
});

test("mechanical radar maps the four actual assignments to three percent-based dimensions", () => {
  const snapshot = {
    members: [],
    grades: [
      { userId: 1, assessmentName: "第一次培训作业", score: 60 },
      { userId: 1, assessmentName: "第二次装配体作业", score: 100 },
      { userId: 2, assessmentName: "第一次培训作业", score: null },
      { userId: 2, assessmentName: "第二次装配体作业", score: 95 },
      { userId: 3, assessmentName: "第一次培训作业", score: 0 },
      { userId: 3, assessmentName: "第二次装配体作业", score: null },
      { userId: 1, assessmentName: "其他作业", score: 20 },
    ],
    assignmentGrades: [
      { userId: 1, assignmentId: 8, assessmentName: "第三次作业", score: 70 },
      { userId: 1, assignmentId: 16, assessmentName: "轴系设计作业", score: 95 },
      { userId: 1, assignmentId: 99, assessmentName: "其他作业", score: 10 },
    ],
    dimensions: [], ratings: [],
  };
  const complete = mechanicalTrainingSkills(snapshot, 1);
  assert.deepEqual(complete.map(({ name, score, graded, total }) => ({ name, score, graded, total })), [
    { name: "SolidWorks", score: 80, graded: 2, total: 2 },
    { name: "零件设计", score: 70, graded: 1, total: 1 },
    { name: "轴系设计", score: 95, graded: 1, total: 1 },
  ]);
  assert.deepEqual(complete[0].sources.map((source) => source.score), [60, 100]);
  const partial = mechanicalTrainingSkills(snapshot, 2);
  assert.deepEqual(partial.map(({ score, graded }) => ({ score, graded })), [
    { score: 95, graded: 1 }, { score: null, graded: 0 }, { score: null, graded: 0 },
  ]);
  assert.deepEqual(partial[0].sources.map(({ score, recorded }) => ({ score, recorded })), [
    { score: null, recorded: true }, { score: 95, recorded: true },
  ]);
  assert.equal(mechanicalTrainingSkills(snapshot, 3)[0].score, 0);
  assert.deepEqual(mechanicalTrainingSkills(snapshot, 4).map((skill) => skill.score), [null, null, null]);
  assert.equal(mechanicalTrainingSkills(snapshot, 4)[1].sources[0].recorded, false);
});

test("training analysis no longer offers batch-grade imports", () => {
  const route = readFileSync(new URL("../routes/admin/training-assessment.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("./training-assessment-client.ts", import.meta.url), "utf8");
  const router = readFileSync(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
  assert.doesNotMatch(route, /批量成绩|同步成绩|未来版本？|parseTrainingGradeText/);
  assert.doesNotMatch(client, /importGrades/);
  assert.doesNotMatch(router, /training-assessments\/import/);
});
