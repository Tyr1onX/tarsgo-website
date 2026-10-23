import assert from "node:assert/strict";
import test from "node:test";

import { layoutSkillTree } from "./skill-tree-layout.ts";

function node(id, prerequisiteIds = [], sortOrder = id) {
  return { id, name: `skill-${id}`, prerequisiteIds, sortOrder };
}

function edgeCrossings(layout) {
  const positions = new Map(layout.positions.map((item) => [item.id, item]));
  const groups = new Map();
  for (const edge of layout.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    const key = `${from.depth}:${to.depth}`;
    groups.set(key, [...(groups.get(key) ?? []), { from: from.y, to: to.y }]);
  }
  let crossings = 0;
  for (const edges of groups.values()) {
    for (let left = 0; left < edges.length; left++) {
      for (let right = left + 1; right < edges.length; right++) {
        const fromDelta = edges[left].from - edges[right].from;
        const toDelta = edges[left].to - edges[right].to;
        if (fromDelta * toDelta < 0) crossings++;
      }
    }
  }
  return crossings;
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
  assert.deepEqual(layout.edges.map(({ from, to }) => ({ from, to })), [{ from: 1, to: 3 }, { from: 2, to: 3 }, { from: 3, to: 4 }]);
  assert.ok(layout.width > positions.get(4).x);
  assert.ok(layout.height > positions.get(3).y);
});

test("tree layout stays renderable when stored data contains a dependency cycle", () => {
  const layout = layoutSkillTree([node(1, [2]), node(2, [1])]);

  assert.equal(layout.hasCycle, true);
  assert.equal(layout.positions.length, 2);
  assert.equal(layout.edges.length, 2);
});

test("barycenter layout reduces crossings for branching and merged prerequisites", () => {
  const nodes = [
    node(1), node(2), node(3),
    node(4, [3], 0), node(5, [2, 3], 1), node(6, [1, 2], 2), node(7, [1], 3),
    node(8, [4, 5], 0), node(9, [5, 6], 1), node(10, [6, 7], 2),
    node(11, [8, 9, 10], 0),
  ];
  const layout = layoutSkillTree(nodes);
  const positions = new Map(layout.positions.map((item) => [item.id, item]));

  assert.equal(layout.hasCycle, false);
  assert.equal(edgeCrossings(layout), 0);
  assert.ok(layout.edges.find((edge) => edge.from === 1 && edge.to === 6)?.channelX > positions.get(1).x + 94);
  for (const [left, right] of [[1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [8, 9], [9, 10]]) {
    const a = positions.get(left);
    const b = positions.get(right);
    if (a.depth === b.depth) assert.ok(Math.abs(a.y - b.y) >= 170, `nodes ${left} and ${right} overlap`);
  }
  for (const edge of layout.edges) assert.ok(Number.isFinite(edge.channelX));
});

test("automatic order is stable and does not change dependency depth", () => {
  const nodes = [node(3, [1, 2], 0), node(4, [2], 0), node(2), node(1)];
  const first = layoutSkillTree(nodes, { autoArrange: true });
  const second = layoutSkillTree(nodes, { autoArrange: true });

  assert.deepEqual(first.positions, second.positions);
  const positions = new Map(first.positions.map((item) => [item.id, item]));
  assert.ok(positions.get(1).x < positions.get(3).x);
  assert.ok(positions.get(2).x < positions.get(3).x);
  assert.ok(positions.get(2).x < positions.get(4).x);
});

test("long dependency edges route above intermediate layers instead of crossing their nodes", () => {
  const layout = layoutSkillTree([
    node(1), node(2, [1]), node(3, [2]), node(4), node(5, [3, 4]),
  ]);
  const positions = new Map(layout.positions.map((item) => [item.id, item]));
  const longEdge = layout.edges.find((edge) => edge.from === 4 && edge.to === 5);

  assert.ok(longEdge);
  assert.ok(longEdge.routeY !== undefined);
  assert.ok(longEdge.targetChannelX !== undefined);
  assert.ok(longEdge.routeY < Math.min(...layout.positions.map((position) => position.y - 37)));
  assert.ok(longEdge.channelX > positions.get(4).x + 94);
  assert.ok(longEdge.targetChannelX < positions.get(5).x - 94);
});
