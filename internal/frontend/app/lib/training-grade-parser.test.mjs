import assert from "node:assert/strict";
import test from "node:test";

import { parseTrainingGradeText } from "./training-grade-parser.ts";

test("imports grades and preserves ungraded observations instead of zeroing them", () => {
  const input = "1.测试甲 60\n2.测试乙 100\n测试丙 未来版本？\n测试丁\n测试戊 打不开\n";
  const result = parseTrainingGradeText(input);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [
    { name: "测试甲", score: 60, note: "" },
    { name: "测试乙", score: 100, note: "" },
    { name: "测试丙", score: null, note: "未来版本？" },
    { name: "测试丁", score: null, note: "" },
    { name: "测试戊", score: null, note: "打不开" },
  ]);
});

test("invalid and duplicate scores cannot be submitted silently", () => {
  const result = parseTrainingGradeText("张三 101\n李四 60\n李四 80");
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 2);
});
