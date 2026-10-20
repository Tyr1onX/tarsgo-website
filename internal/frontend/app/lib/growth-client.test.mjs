import assert from "node:assert/strict";
import test from "node:test";

import { formatGrowthDate, growthEventLabel, growthEventTone } from "./growth-presentation.ts";

test("growth milestones use clear labels without claiming answers solved questions", () => {
  assert.equal(growthEventLabel("discussion_participation"), "讨论参与");
  assert.equal(growthEventLabel("question_solved"), "问题解决");
  assert.notEqual(growthEventLabel("discussion_participation"), growthEventLabel("question_solved"));
  assert.equal(growthEventLabel("assignment_review_needs_redo"), "复盘反馈");
  assert.equal(growthEventLabel("skill_mastered"), "技能解锁");
  assert.equal(growthEventLabel("skill_mastery_revoked"), "审核记录");
});

test("growth milestones distinguish completed, returned, and identity events", () => {
  assert.equal(growthEventTone("assignment_review_passed"), "bright");
  assert.equal(growthEventTone("assignment_review_needs_redo"), "warm");
  assert.equal(growthEventTone("membership"), "origin");
  assert.equal(growthEventTone("skill_mastered"), "bright");
});

test("growth timestamps are formatted in Beijing time", () => {
  assert.match(formatGrowthDate("2026-01-01T00:00:00.000Z"), /2026/);
  assert.match(formatGrowthDate("2026-01-01T00:00:00.000Z"), /01/);
});
