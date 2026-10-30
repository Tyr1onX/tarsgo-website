import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { layoutSkillTree } from "~/lib/skill-tree-layout";
import { skillStateLabel, type SkillNode } from "~/lib/skills-client";

interface SkillTreeGraphProps {
  nodes: SkillNode[];
  selectedID: number | null;
  onSelect: (node: SkillNode) => void;
  onAutoArrange?: () => void;
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

export function SkillTreeGraph({ nodes, selectedID, onSelect, onAutoArrange }: SkillTreeGraphProps) {
  const layout = useMemo(() => layoutSkillTree(nodes), [nodes]);
  const positionByID = useMemo(() => new Map(layout.positions.map((position) => [position.id, position])), [layout]);
  const nodeByID = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const focusSelected = useCallback(() => {
    const container = scrollRef.current;
    const position = selectedID === null ? null : positionByID.get(selectedID);
    if (!container || !position) {
      container?.scrollTo({ left: 0, top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      return;
    }
    container.scrollTo({
      left: Math.max(0, position.x * zoom - container.clientWidth / 2),
      top: Math.max(0, position.y * zoom - container.clientHeight / 2),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [positionByID, reduceMotion, selectedID, zoom]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
  }, [layout.width, layout.height]);

  function adjustZoom(delta: number) {
    setZoom((current) => Math.max(0.65, Math.min(1.6, Math.round((current + delta) * 100) / 100)));
  }

  return (
    <div className="skill-tree-frame">
      <div className="skill-tree-frame__topline"><span>SKILL ROUTE / NODE MAP</span><span>{nodes.length.toString().padStart(2, "0")} NODES</span></div>
      <div className="skill-tree-controls" aria-label="路线图操作">
        <div className="skill-tree-controls__zoom" aria-label="缩放路线图">
          <button type="button" aria-label="缩小路线图" onClick={() => adjustZoom(-0.15)} disabled={zoom <= 0.65}>−</button>
          <output aria-live="polite">{Math.round(zoom * 100)}%</output>
          <button type="button" aria-label="放大路线图" onClick={() => adjustZoom(0.15)} disabled={zoom >= 1.6}>＋</button>
        </div>
        <button type="button" className="skill-tree-control-button" onClick={focusSelected} disabled={selectedID === null}>定位选中节点</button>
        {onAutoArrange && nodes.length > 1 ? <button type="button" className="skill-tree-control-button" onClick={() => { setZoom(1); onAutoArrange(); }}>自动整理布局</button> : null}
      </div>
      <div ref={scrollRef} className="skill-tree-scroll" role="region" aria-label="技能路线图，可缩放并滚动查看" tabIndex={0}>
        <svg
          className="skill-tree-svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={Math.round(layout.width * zoom)}
          height={Math.round(layout.height * zoom)}
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
            const strength = fromNode?.state === "mastered" && toNode?.state !== "locked" ? "ready" : "quiet";
            const sourceIsLeft = from.depth > to.depth;
            const x1 = from.x + (sourceIsLeft ? -94 : 94);
            const x2 = to.x + (sourceIsLeft ? 94 : -94);
            const path = edge.routeY !== undefined && edge.targetChannelX !== undefined
              ? `M ${x1} ${from.y} H ${edge.channelX} V ${edge.routeY} H ${edge.targetChannelX} V ${to.y} H ${x2}`
              : `M ${x1} ${from.y} H ${edge.channelX} V ${to.y} H ${x2}`;
            return <path key={`${edge.from}-${edge.to}`} className={`skill-tree-edge skill-tree-edge--${strength}`} d={path} />;
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
