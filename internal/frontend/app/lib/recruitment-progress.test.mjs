import assert from "node:assert/strict";
import test from "node:test";

import { getRecruitmentProgress } from "./recruitment-progress.ts";

const summary = (status, rejectedStage = null) => ({ status, rejectedStage });
const attendance = (value) => ({
  attendance: value,
  availableSessions: [],
  canModify: true,
});

const stepSnapshot = (progress) =>
  progress.steps.map(({ label, state, status }) => [label, state, status]);

test("pending screening shows the first review as the current step", () => {
  const progress = getRecruitmentProgress(summary("pending_screening"), null, false);

  assert.deepEqual(stepSnapshot(progress), [
    ["报名完成", "complete", "已完成"],
    ["初筛", "current", "等待初筛"],
    ["面试确认", "upcoming", "待开始"],
    ["等待线下面试", "upcoming", "待开始"],
    ["最终结果", "upcoming", "待开始"],
  ]);
  assert.equal(progress.activeStepIndex, 1);
});

test("confirmed interview attendance advances to the in-person interview", () => {
  const progress = getRecruitmentProgress(
    summary("pending_interview"),
    attendance("attending"),
    false,
  );

  assert.deepEqual(progress.steps.map(({ state }) => state), [
    "complete",
    "complete",
    "complete",
    "current",
    "upcoming",
  ]);
  assert.equal(progress.steps[2].status, "已确认");
  assert.equal(progress.activeStepIndex, 3);
  assert.equal(progress.currentStage, "等待线下面试");
});

test("not attending remains visible on the interview confirmation step", () => {
  const progress = getRecruitmentProgress(
    summary("pending_interview"),
    attendance("not_attending"),
    false,
  );

  assert.deepEqual(progress.steps.map(({ state }) => state), [
    "complete",
    "complete",
    "current",
    "upcoming",
    "upcoming",
  ]);
  assert.equal(progress.steps[2].status, "暂不参加面试");
  assert.equal(progress.activeStepIndex, 2);
  assert.equal(progress.currentStage, "暂不参加面试");
});

test("screening rejection is shown as a rejection and skips interview stages", () => {
  const progress = getRecruitmentProgress(summary("rejected", "screening"), null, false);

  assert.deepEqual(stepSnapshot(progress), [
    ["报名完成", "complete", "已完成"],
    ["初筛", "rejected", "初筛未通过"],
    ["面试确认", "skipped", "未进入"],
    ["等待线下面试", "skipped", "未进入"],
    ["最终结果", "result", "初筛未通过"],
  ]);
  assert.equal(progress.currentStage, "初筛未通过");
  assert.equal(progress.activeStepIndex, 1);
});

test("interview rejection does not mark the interview or result as complete", () => {
  const progress = getRecruitmentProgress(summary("rejected", "interview"), null, false);

  assert.deepEqual(stepSnapshot(progress), [
    ["报名完成", "complete", "已完成"],
    ["初筛", "complete", "已通过"],
    ["面试确认", "complete", "已确认"],
    ["等待线下面试", "rejected", "面试未通过"],
    ["最终结果", "result", "面试未通过"],
  ]);
  assert.equal(progress.currentStage, "面试未通过");
  assert.equal(progress.steps[3].state, "rejected");
  assert.notEqual(progress.steps[4].state, "complete");
});

test("admission has a distinct final result state", () => {
  const progress = getRecruitmentProgress(summary("admitted"), null, false);

  assert.deepEqual(progress.steps.map(({ state }) => state), [
    "complete",
    "complete",
    "complete",
    "complete",
    "admitted",
  ]);
  assert.equal(progress.steps[4].status, "已录取");
  assert.equal(progress.activeStepIndex, 4);
});

test("withdrawal is shown as a terminal state without advancing later steps", () => {
  const progress = getRecruitmentProgress(summary("withdrawn"), null, false);

  assert.deepEqual(stepSnapshot(progress), [
    ["报名完成", "complete", "已完成"],
    ["初筛", "withdrawn", "已撤回"],
    ["面试确认", "skipped", "未进入"],
    ["等待线下面试", "skipped", "未进入"],
    ["最终结果", "skipped", "未进入"],
  ]);
  assert.equal(progress.isTerminal, true);
  assert.equal(progress.currentStage, "已撤回");
  assert.equal(progress.activeStepIndex, 1);
});
