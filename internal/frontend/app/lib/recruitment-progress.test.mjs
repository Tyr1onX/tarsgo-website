import assert from "node:assert/strict";
import test from "node:test";

import { getRecruitmentProgress } from "./recruitment-progress.ts";

test("screening rejection skips interview steps and marks the final result current", () => {
  const progress = getRecruitmentProgress(
    { status: "rejected", rejectedStage: "screening" },
    null,
    false,
  );

  assert.deepEqual(
    progress.steps.map(({ label, state }) => [label, state]),
    [
      ["报名完成", "complete"],
      ["初筛", "complete"],
      ["面试确认", "skipped"],
      ["等待线下面试", "skipped"],
      ["最终结果", "current"],
    ],
  );
  assert.equal(progress.currentStage, "初筛未通过");
});
