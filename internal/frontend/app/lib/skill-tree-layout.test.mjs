import assert from "node:assert/strict";
import test from "node:test";

import { layoutSkillTree } from "./skill-tree-layout.ts";

function node(id, prerequisiteIds = [], sortOrder = id) {
  return { id, name: `skill-${id}`, prerequisiteIds, sortOrder };
}

test("tree layout places prerequisites before dependent nodes and draws dependency edges", () => {
  const layout = layoutSkillTree([
    node(3, [1, 2]),
    node(2),
    node(1),
    node(4, [3]),
  ]);
  const positions = new Map(layout.positions.map((item) => [item.id, item]));

  assert.equal(layout.hasCycle, false);
  assert.ok(positions.get(1).x < positions.get(3).x);
  assert.ok(positions.get(2).x < positions.get(3).x);
  assert.ok(positions.get(3).x < positions.get(4).x);
  assert.deepEqual(layout.edges, [{ from: 1, to: 3 }, { from: 2, to: 3 }, { from: 3, to: 4 }]);
  assert.ok(layout.width > positions.get(4).x);
  assert.ok(layout.height > positions.get(3).y);
});

test("tree layout stays renderable when stored data contains a dependency cycle", () => {
  const layout = layoutSkillTree([node(1, [2]), node(2, [1])]);

  assert.equal(layout.hasCycle, true);
  assert.equal(layout.positions.length, 2);
  assert.equal(layout.edges.length, 2);
});
