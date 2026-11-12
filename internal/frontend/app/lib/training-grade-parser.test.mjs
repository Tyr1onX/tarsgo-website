import assert from "node:assert/strict";
import test from "node:test";

import { parseTrainingGradeText } from "./training-grade-parser.ts";

test("imports grades and preserves ungraded observations instead of zeroing them", () => {
  const input = "1.田浩雨 60\n2.王新锐 100\n樊思毅 未来版本？\n朱侃然\n尹锦宇 打不开\n";
  const result = parseTrainingGradeText(input);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [
    { name: "田浩雨", score: 60, note: "" },
    { name: "王新锐", score: 100, note: "" },
    { name: "樊思毅", score: null, note: "未来版本？" },
    { name: "朱侃然", score: null, note: "" },
    { name: "尹锦宇", score: null, note: "打不开" },
  ]);
});

test("invalid and duplicate scores cannot be submitted silently", () => {
  const result = parseTrainingGradeText("张三 101\n李四 60\n李四 80");
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 2);
});
