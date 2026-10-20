import type { KeyboardEvent } from "react";

import { layoutSkillTree } from "~/lib/skill-tree-layout";
import { skillStateLabel, type SkillNode } from "~/lib/skills-client";

interface SkillTreeGraphProps {
  nodes: SkillNode[];
  selectedID: number | null;
  onSelect: (node: SkillNode) => void;
}

function nodeTone(node: SkillNode) {
  if (node.active === false) return "inactive";
  return node.state ?? "available";
}

function readableState(node: SkillNode) {
  if (node.active === false) return "已停用";
  if (node.startedAt && node.state === "available") return "正在学习";
  return skillStateLabel(node.state ?? "available");
}

function nodeTitle(value: string) {
  return Array.from(value).length > 15 ? `${Array.from(value).slice(0, 14).join("")}…` : value;
}

export function SkillTreeGraph({ nodes, selectedID, onSelect }: SkillTreeGraphProps) {
  const layout = layoutSkillTree(nodes);
  const positionByID = new Map(layout.positions.map((position) => [position.id, position]));
  const nodeByID = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="skill-tree-frame">
      <div className="skill-tree-frame__topline"><span>SKILL ROUTE / NODE MAP</span><span>{nodes.length.toString().padStart(2, "0")} NODES</span></div>
      <div className="skill-tree-scroll" role="region" aria-label="技能树，可横向滑动查看">
        <svg
          className="skill-tree-svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          role="group"
          aria-label="技能节点依赖路线图"
        >
          <defs>
            <pattern id="skill-grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <path d="M 26 0 L 0 0 0 26" fill="none" className="skill-tree-grid-line" />
              <circle cx="1" cy="1" r="1" className="skill-tree-grid-dot" />
            </pattern>
            <filter id="skill-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect className="skill-tree-backdrop" width={layout.width} height={layout.height} rx="18" />
          <rect className="skill-tree-grid" width={layout.width} height={layout.height} rx="18" />
          {layout.edges.map((edge) => {
            const from = positionByID.get(edge.from);
            const to = positionByID.get(edge.to);
            if (!from || !to) return null;
            const fromNode = nodeByID.get(edge.from);
            const toNode = nodeByID.get(edge.to);
            const x1 = from.x + 88;
            const x2 = to.x - 88;
            const strength = fromNode?.state === "mastered" && toNode?.state !== "locked" ? "ready" : "quiet";
            return <path key={`${edge.from}-${edge.to}`} className={`skill-tree-edge skill-tree-edge--${strength}`} d={`M ${x1} ${from.y} C ${x1 + 52} ${from.y}, ${x2 - 52} ${to.y}, ${x2} ${to.y}`} />;
          })}
          {nodes.map((node) => {
            const position = positionByID.get(node.id);
            if (!position) return null;
            const selected = node.id === selectedID;
            const tone = nodeTone(node);
            const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(node);
              }
            };
            return (
              <g
                key={node.id}
                className={`skill-tree-node skill-tree-node--${tone}${selected ? " is-selected" : ""}`}
                transform={`translate(${position.x}, ${position.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${node.name}，${readableState(node)}`}
                aria-pressed={selected}
                onClick={() => onSelect(node)}
                onKeyDown={onKeyDown}
              >
                <polygon className="skill-tree-node__shape" points="-70,-37 70,-37 88,-19 88,19 70,37 -70,37 -88,19 -88,-19" />
                <polygon className="skill-tree-node__inner" points="-64,-31 64,-31 80,-15 80,15 64,31 -64,31 -80,15 -80,-15" />
                <circle className="skill-tree-node__core" cx="-58" cy="0" r="5" />
                <text className="skill-tree-node__name" x="-44" y="-3">{nodeTitle(node.name)}</text>
                <text className="skill-tree-node__status" x="-44" y="16">{readableState(node)}</text>
                {node.state === "mastered" ? <path className="skill-tree-node__check" d="M 62 0 l 5 5 10 -12" /> : null}
                <title>{`${node.name} · ${readableState(node)}`}</title>
              </g>
            );
          })}
          {layout.hasCycle ? <text x="20" y={layout.height - 18} className="skill-tree-warning">路线配置存在循环，请管理员检查依赖关系。</text> : null}
        </svg>
      </div>
      <div className="skill-tree-legend" aria-label="技能状态图例">
        <span className="skill-tree-legend__item skill-tree-legend__item--mastered">已掌握</span>
        <span className="skill-tree-legend__item skill-tree-legend__item--practiced">已实践</span>
        <span className="skill-tree-legend__item skill-tree-legend__item--available">可挑战</span>
        <span className="skill-tree-legend__item skill-tree-legend__item--locked">未解锁</span>
      </div>
    </div>
  );
}
