import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildTrainingGradebook, mechanicalTrainingSkills, summarizeTrainingScores, rankTrainingAssessment, sortGradebookMembers } from "./training-assessment-summary.ts";

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
  assert.deepEqual(rankTrainingAssessment(snapshot, "assignment:9").map(({ userId, rank }) => ({ userId, rank })), [
    { userId: 5, rank: 1 },
  ]);
});

test("all-assessment gradebook shows per-column ranks and opens complete member history", () => {
  const snapshot = {
    members: [
      { userId: 2, name: "同名" }, { userId: 1, name: "同名" }, { userId: 3, name: "未评分" },
    ],
    grades: [
      { userId: 1, assessmentName: "第一次", score: 90, note: "已完成" },
      { userId: 2, assessmentName: "第一次", score: null, note: "待核实" },
    ],
    assignmentGrades: [
      { userId: 1, assignmentId: 8, assessmentName: "第三次", score: 0, decision: "needs_redo" },
      { userId: 2, assignmentId: 8, assessmentName: "第三次", score: 100, decision: "passed" },
    ],
    dimensions: [], ratings: [],
  };
  const book = buildTrainingGradebook(snapshot);
  assert.deepEqual(book.assessments.map((a) => a.key), ["training:第一次", "assignment:8"]);
  assert.deepEqual(book.members[0].results.map((result) => [result.status, result.score, result.rank]), [
    ["missing", null, null], ["graded", 100, 1],
  ]);
  assert.equal(book.members[0].results[0].note, "待核实");
  assert.equal(book.members[0].results[1].decision, "passed");
  assert.deepEqual(book.members[1].results.map((result) => [result.status, result.score, result.rank]), [
    ["graded", 90, 1], ["graded", 0, 2],
  ]);
  assert.equal(book.members[1].results[1].decision, "needs_redo");
  assert.deepEqual(book.members[2].results.map((result) => result.status), ["unrecorded", "unrecorded"]);
  assert.deepEqual(sortGradebookMembers(book.members, "").map((member) => member.userId), [1, 2, 3]);
  assert.deepEqual(sortGradebookMembers(book.members, "training:第一次").map((member) => member.userId), [1, 2, 3]);
  assert.deepEqual(sortGradebookMembers(book.members, "assignment:8").map((member) => member.userId), [2, 1, 3]);
  assert.equal(book.members[0].userId, 2, "sorting must not mutate the snapshot-derived members");
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

test("mechanical composite ranking requires all four grades and skill rankings accept partial evidence", () => {
  const snapshot = {
    members: [1, 2, 3, 4, 5, 6].map((id) => ({ userId: id, name: ({1:"甲",2:"乙",3:"丙",4:"丁",5:"戊",6:"己"})[id] })),
    grades: [
      ...[[1,100,100],[2,80,100],[3,0,0],[4,100,null],[6,100,100]].flatMap(([userId,first,second]) => [
        { userId, assessmentName: "第一次培训作业", score: first, note: "" },
        { userId, assessmentName: "第二次装配体作业", score: second, note: "" },
      ]),
    ],
    assignmentGrades: [
      ...[[1,90],[2,100],[3,0],[4,100],[6,90]].map(([userId,score]) => ({userId,score,assignmentId:8,assessmentName:"第三次作业",decision:"passed"})),
      ...[[1,80],[2,90],[3,0],[4,100],[6,80]].map(([userId,score]) => ({userId,score,assignmentId:16,assessmentName:"轴系设计作业",decision:"passed"})),
    ],
    dimensions: [], ratings: [],
  };
  const book = buildTrainingGradebook(snapshot, 4);
  assert.deepEqual(book.assessments.map((item) => item.key), [
    "overall:mechanical", "skill:0", "skill:1", "skill:2",
    "training:第一次培训作业", "training:第二次装配体作业", "assignment:8", "assignment:16",
  ]);
  assert.deepEqual(book.assessments.slice(0, 4).map((item) => item.name), [
    "综合能力排名", "SolidWorks 软件能力", "零件设计能力", "轴系设计能力",
  ]);
  assert.deepEqual(book.assessments[0], {
    key:"overall:mechanical",name:"综合能力排名",source:"overall",total:6,scored:4,missing:2,average:68.3,
  });
  const get = (id,key) => book.members.find((member) => member.userId === id).results.find((result) => result.key === key);
  assert.deepEqual([1,2,3,4,5,6].map((id) => {
    const {score,rank,status} = get(id,"overall:mechanical");
    return {score,rank,status};
  }), [
    {score:90,rank:2,status:"graded"},
    {score:93.3,rank:1,status:"graded"},
    {score:0,rank:4,status:"graded"},
    {score:null,rank:null,status:"pending"},
    {score:null,rank:null,status:"pending"},
    {score:90,rank:2,status:"graded"},
  ]);
  assert.equal(get(4,"overall:mechanical").note,"已评分 3/4");
  assert.deepEqual(get(4,"skill:0"),{key:"skill:0",score:100,rank:1,status:"graded",note:"已评分 1/2"});
  assert.deepEqual(get(5,"skill:0"),{key:"skill:0",score:null,rank:null,status:"pending",note:"已评分 0/2"});
  const sorted = sortGradebookMembers(book.members,"overall:mechanical").map((member) => member.userId);
  assert.equal(sorted[0],2);
  assert.deepEqual(new Set(sorted.slice(1,3)),new Set([1,6]));
  assert.deepEqual(sorted.slice(3),[3,4,5]);
  assert.equal(get(3,"training:第一次培训作业").score,0);
  assert.equal(get(4,"training:第二次装配体作业").status,"missing");
  assert.equal(get(5,"training:第一次培训作业").status,"unrecorded");
  assert.equal(buildTrainingGradebook(snapshot,2).assessments.length,4);
});

test("selecting one assessment paginates its ranking without changing the individual profile", () => {
  const page = readFileSync(new URL("../routes/admin/training-assessment.tsx", import.meta.url), "utf8");
  assert.match(page, /snapshot \? selectedMember \?/);
  assert.match(page, /选择考核/);
  assert.match(page, /综合与能力维度/);
  assert.match(page, /rawSummaries\.map/);
  assert.match(page, /成绩排名/);
  assert.match(page, /const PAGE_SIZE = 20/);
  assert.match(page, /setAssessmentKey\(event\.target\.value\); setPage\(1\)/);
  assert.match(page, /Math\.min\(page, totalPages\)/);
  assert.match(page, /visibleRows\.slice\(/);
  assert.match(page, /setPage\(currentPage \+ 1\)/);
  assert.match(page, /返回成绩总览/);
  assert.match(page, /个人历次成绩/);
  assert.doesNotMatch(page, /sortKey|setSortKey|missingOnly|detailRef/);
});

test("training analysis no longer offers batch-grade imports", () => {
  const route = readFileSync(new URL("../routes/admin/training-assessment.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("./training-assessment-client.ts", import.meta.url), "utf8");
  const router = readFileSync(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
  assert.doesNotMatch(route, /批量成绩|同步成绩|未来版本？|parseTrainingGradeText/);
  assert.doesNotMatch(client, /importGrades/);
  assert.doesNotMatch(router, /training-assessments\/import/);
});
