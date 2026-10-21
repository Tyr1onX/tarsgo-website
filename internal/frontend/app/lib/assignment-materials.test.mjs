import assert from "node:assert/strict";
import test from "node:test";

import {
  maxAssignmentMaterialFileSize,
  validateAssignmentMaterialSelection,
} from "./assignment-materials.ts";

test("teaching materials enforce count, per-file, and aggregate upload limits", () => {
  const small = { size: 1024 };
  assert.equal(validateAssignmentMaterialSelection(Array(9).fill(small), [], [small]), "");
  assert.match(validateAssignmentMaterialSelection(Array(10).fill(small), [], [small]), /最多 10 个/);
  assert.match(validateAssignmentMaterialSelection([], [], [{ size: maxAssignmentMaterialFileSize + 1 }]), /单个/);
  assert.equal(validateAssignmentMaterialSelection([], [], [{ size: maxAssignmentMaterialFileSize }]), "");
  assert.match(validateAssignmentMaterialSelection([], [], [18, 18, 18].map((size) => ({ size: size * 1024 * 1024 }))), /总大小/);
});
