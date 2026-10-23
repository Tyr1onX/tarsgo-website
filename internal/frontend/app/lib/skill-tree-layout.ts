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
  channelX: number;
  targetChannelX?: number;
  routeY?: number;
}

export interface SkillTreeLayout {
  positions: SkillTreePosition[];
  edges: SkillTreeEdge[];
  width: number;
  height: number;
  hasCycle: boolean;
}

export interface SkillTreeLayoutOptions {
  /** Use a stable name-based starting order before dependency crossing reduction. */
  autoArrange?: boolean;
}

const NODE_HALF_WIDTH = 94;
const COLUMN_GAP = 320;
const ROW_GAP = 172;
const SIDE_MARGIN = 128;
const TOP_MARGIN = 104;

/**
 * Lay out the dependency DAG in longest-path layers, then use alternating
 * barycenter sweeps to reduce crossings at branches and joins. Dependency
 * edges are routed through reserved vertical channels between columns.
 */
export function layoutSkillTree(nodes: readonly SkillNode[], options: SkillTreeLayoutOptions = {}): SkillTreeLayout {
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
  const maxDepth = Math.max(0, ...layers.keys());
  for (const layer of layers.values()) {
    layer.sort((a, b) => options.autoArrange
      ? a.name.localeCompare(b.name, "zh-CN") || a.id - b.id
      : a.sortOrder - b.sortOrder || a.id - b.id);
  }

  const incoming = new Map<number, number[]>();
  const outgoing = new Map<number, number[]>();
  const edgePairs: Array<{ from: number; to: number }> = [];
  for (const node of nodes) {
    for (const prerequisiteID of node.prerequisiteIds) {
      if (!byID.has(prerequisiteID)) continue;
      edgePairs.push({ from: prerequisiteID, to: node.id });
      incoming.set(node.id, [...(incoming.get(node.id) ?? []), prerequisiteID]);
      outgoing.set(prerequisiteID, [...(outgoing.get(prerequisiteID) ?? []), node.id]);
    }
  }

  const rankByID = () => {
    const ranks = new Map<number, number>();
    for (const layer of layers.values()) layer.forEach((node, index) => ranks.set(node.id, index));
    return ranks;
  };

  function sweep(depth: number, neighbors: Map<number, number[]>, ranks: Map<number, number>) {
    const layer = layers.get(depth);
    if (!layer || layer.length < 2) return;
    const stableIndex = new Map(layer.map((node, index) => [node.id, index]));
    const score = (node: SkillNode) => {
      const related = (neighbors.get(node.id) ?? [])
        .filter((id) => ranks.has(id))
        .map((id) => ranks.get(id) ?? 0);
      return related.length ? related.reduce((sum, value) => sum + value, 0) / related.length : null;
    };
    layer.sort((a, b) => {
      const aScore = score(a);
      const bScore = score(b);
      if (aScore === null && bScore !== null) return 1;
      if (aScore !== null && bScore === null) return -1;
      if (aScore !== null && bScore !== null && Math.abs(aScore - bScore) > 0.0001) return aScore - bScore;
      return (stableIndex.get(a.id) ?? 0) - (stableIndex.get(b.id) ?? 0) || a.id - b.id;
    });
  }

  // Alternating passes let both branches and joins influence each other while
  // preserving stable ties so the layout does not jump between renders.
  for (let pass = 0; pass < 8; pass++) {
    for (let depth = 1; depth <= maxDepth; depth++) sweep(depth, incoming, rankByID());
    for (let depth = maxDepth - 1; depth >= 0; depth--) sweep(depth, outgoing, rankByID());
  }

  const routedEdges = edgePairs
    .filter((edge) => (depthByID.get(edge.to) ?? 0) - (depthByID.get(edge.from) ?? 0) !== 1)
    .sort((a, b) =>
      (depthByID.get(a.from) ?? 0) - (depthByID.get(b.from) ?? 0)
      || (depthByID.get(a.to) ?? 0) - (depthByID.get(b.to) ?? 0)
      || a.from - b.from || a.to - b.to,
    );
  // Long edges travel in dedicated lanes above the graph instead of crossing
  // intermediate dependency columns and the nodes placed there.
  const topMargin = TOP_MARGIN + routedEdges.length * 12;
  const positions: SkillTreePosition[] = [];
  for (const [depth, layer] of layers) {
    layer.forEach((node, index) => {
      positions.push({ id: node.id, x: SIDE_MARGIN + NODE_HALF_WIDTH + depth * COLUMN_GAP, y: topMargin + index * ROW_GAP, depth });
    });
  }
  positions.sort((a, b) => a.depth - b.depth || a.y - b.y || a.id - b.id);
  const positionByID = new Map(positions.map((position) => [position.id, position]));

  type EdgeChannel = { edge: typeof edgePairs[number]; side: "direct" | "source" | "target" };
  const channelsByGap = new Map<number, EdgeChannel[]>();
  const addChannel = (gap: number, edge: EdgeChannel) => channelsByGap.set(gap, [...(channelsByGap.get(gap) ?? []), edge]);
  for (const edge of edgePairs) {
    const fromDepth = depthByID.get(edge.from) ?? 0;
    const toDepth = depthByID.get(edge.to) ?? 0;
    if (toDepth - fromDepth === 1) {
      addChannel(fromDepth, { edge, side: "direct" });
    } else if (toDepth - fromDepth > 1) {
      addChannel(fromDepth, { edge, side: "source" });
      addChannel(toDepth - 1, { edge, side: "target" });
    }
  }
  const channelPosition = new Map<string, number>();
  for (const [depth, channels] of channelsByGap) {
    channels.sort((a, b) => {
      const fromA = positionByID.get(a.edge.from)?.y ?? 0;
      const fromB = positionByID.get(b.edge.from)?.y ?? 0;
      const toA = positionByID.get(a.edge.to)?.y ?? 0;
      const toB = positionByID.get(b.edge.to)?.y ?? 0;
      return fromA - fromB || toA - toB || a.edge.from - b.edge.from || a.edge.to - b.edge.to || a.side.localeCompare(b.side);
    });
    const gapStart = SIDE_MARGIN + NODE_HALF_WIDTH * 2 + depth * COLUMN_GAP;
    const gapEnd = SIDE_MARGIN + NODE_HALF_WIDTH + (depth + 1) * COLUMN_GAP - NODE_HALF_WIDTH;
    channels.forEach(({ edge, side }, index) => {
      const x = gapStart + (gapEnd - gapStart) * ((index + 1) / (channels.length + 1));
      channelPosition.set(`${edge.from}:${edge.to}:${side}`, x);
    });
  }
  const routeYByEdge = new Map(routedEdges.map((edge, index) => [`${edge.from}:${edge.to}`, 18 + index * 12]));
  const edges: SkillTreeEdge[] = edgePairs.map((edge) => {
    const fromDepth = depthByID.get(edge.from) ?? 0;
    const toDepth = depthByID.get(edge.to) ?? 0;
    if (toDepth - fromDepth > 1) {
      return {
        ...edge,
        channelX: channelPosition.get(`${edge.from}:${edge.to}:source`) ?? 0,
        targetChannelX: channelPosition.get(`${edge.from}:${edge.to}:target`) ?? 0,
        routeY: routeYByEdge.get(`${edge.from}:${edge.to}`),
      };
    }
    if (toDepth - fromDepth !== 1) {
      const from = positionByID.get(edge.from);
      const to = positionByID.get(edge.to);
      const channelX = from && to ? (from.x + to.x) / 2 : 0;
      return { ...edge, channelX, targetChannelX: channelX, routeY: routeYByEdge.get(`${edge.from}:${edge.to}`) };
    }
    return { ...edge, channelX: channelPosition.get(`${edge.from}:${edge.to}:direct`) ?? 0 };
  });
  edges.sort((a, b) =>
    (depthByID.get(a.from) ?? 0) - (depthByID.get(b.from) ?? 0)
    || (positionByID.get(a.from)?.y ?? 0) - (positionByID.get(b.from)?.y ?? 0)
    || (positionByID.get(a.to)?.y ?? 0) - (positionByID.get(b.to)?.y ?? 0)
    || a.from - b.from || a.to - b.to,
  );

  const maxRows = Math.max(1, ...Array.from(layers.values(), (layer) => layer.length));
  return {
    positions,
    edges,
    width: Math.max(520, SIDE_MARGIN * 2 + NODE_HALF_WIDTH * 2 + maxDepth * COLUMN_GAP),
    height: Math.max(252, topMargin + TOP_MARGIN + (maxRows - 1) * ROW_GAP),
    hasCycle,
  };
}
