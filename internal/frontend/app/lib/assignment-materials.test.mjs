import assert from "node:assert/strict";
import test from "node:test";

import { validateAssignmentMaterialSelection } from "./assignment-materials.ts";

test("teaching materials enforce file count and nonempty content without legacy size limits", () => {
  const small = { size: 1024 };
  const large = { size: 31 * 1024 * 1024 };
  assert.equal(validateAssignmentMaterialSelection(Array(9).fill(small), [], [small]), "");
  assert.match(validateAssignmentMaterialSelection(Array(10).fill(small), [], [small]), /最多 10 个/);
  assert.match(validateAssignmentMaterialSelection([], [], [{ size: 0 }]), /不能上传空/);
  assert.equal(validateAssignmentMaterialSelection([], [], [large]), "");
  assert.equal(validateAssignmentMaterialSelection([large], [], [large]), "");
  assert.equal(validateAssignmentMaterialSelection([], [large], [large]), "");
});
