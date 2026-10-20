import type { SkillNode } from "~/lib/skills-client";

export interface SkillTreePosition {
  id: number;
  x: number;
  y: number;
  depth: number;
}

export interface SkillTreeEdge {
  from: number;
  to: number;
}

export interface SkillTreeLayout {
  positions: SkillTreePosition[];
  edges: SkillTreeEdge[];
  width: number;
  height: number;
  hasCycle: boolean;
}

export function layoutSkillTree(nodes: readonly SkillNode[]): SkillTreeLayout {
  const byID = new Map(nodes.map((node) => [node.id, node]));
  const depthByID = new Map<number, number>();
  const visiting = new Set<number>();
  let hasCycle = false;

  function getDepth(id: number): number {
    const known = depthByID.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) {
      hasCycle = true;
      return 0;
    }
    const node = byID.get(id);
    if (!node) return 0;
    visiting.add(id);
    let depth = 0;
    for (const prerequisiteID of node.prerequisiteIds) {
      if (!byID.has(prerequisiteID)) continue;
      depth = Math.max(depth, getDepth(prerequisiteID) + 1);
    }
    visiting.delete(id);
    depthByID.set(id, depth);
    return depth;
  }

  for (const node of nodes) getDepth(node.id);
  const layers = new Map<number, SkillNode[]>();
  for (const node of nodes) {
    const depth = depthByID.get(node.id) ?? 0;
    const layer = layers.get(depth) ?? [];
    layer.push(node);
    layers.set(depth, layer);
  }
  for (const layer of layers.values()) {
    layer.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  const maxRows = Math.max(1, ...Array.from(layers.values(), (layer) => layer.length));
  const positions: SkillTreePosition[] = [];
  for (const [depth, layer] of layers) {
    layer.forEach((node, index) => {
      positions.push({ id: node.id, x: 132 + depth * 220, y: 84 + index * 118, depth });
    });
  }
  positions.sort((a, b) => a.depth - b.depth || a.y - b.y || a.id - b.id);

  const edges: SkillTreeEdge[] = [];
  for (const node of nodes) {
    for (const prerequisiteID of node.prerequisiteIds) {
      if (byID.has(prerequisiteID)) edges.push({ from: prerequisiteID, to: node.id });
    }
  }

  return {
    positions,
    edges,
    width: Math.max(480, 264 + (Math.max(0, ...layers.keys()) * 220)),
    height: Math.max(238, 168 + (maxRows - 1) * 118),
    hasCycle,
  };
}
