import assert from "node:assert/strict";
import test from "node:test";

import { filterAssignmentMembers, toggleAssignmentMemberSelection } from "./assignment-member-selection.ts";

const members = [
  { userId: 1, name: "张三" },
  { userId: 2, name: "李四" },
  { userId: 3, name: "Alice" },
];

test("member search filters current group names without changing selected IDs", () => {
  const selected = [1, 3];
  assert.deepEqual(filterAssignmentMembers(members, "李"), [{ userId: 2, name: "李四" }]);
  assert.deepEqual(filterAssignmentMembers(members, " alice "), [{ userId: 3, name: "Alice" }]);
  assert.deepEqual(filterAssignmentMembers(members, "无匹配"), []);
  assert.deepEqual(filterAssignmentMembers(members, ""), members);
  assert.deepEqual(selected, [1, 3]);
});

test("selection toggles one member and preserves other recipients", () => {
  assert.deepEqual(toggleAssignmentMemberSelection([1, 3], 2), [1, 3, 2]);
  assert.deepEqual(toggleAssignmentMemberSelection([1, 3], 1), [3]);
});
