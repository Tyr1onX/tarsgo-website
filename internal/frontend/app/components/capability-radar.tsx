import type { CapabilityDimensionResult } from "~/lib/capabilities-client";
import { capabilityRadarPoint, capabilityRadarPolygon } from "~/lib/capability-radar";

const CENTER_X = 180;
const CENTER_Y = 145;
const RADIUS = 100;

export function CapabilityRadar({ dimensions, title }: { dimensions: CapabilityDimensionResult[]; title: string }) {
  if (dimensions.length === 0) {
    return <div className="capability-radar-empty">本组能力维度尚未配置。</div>;
  }

  const scores = dimensions.map((dimension) => dimension.score);
  const polygon = capabilityRadarPolygon(scores, CENTER_X, CENTER_Y, RADIUS);
  const labelRadius = RADIUS + 28;
  const labelPoints = dimensions.map((_, index) => capabilityRadarPoint(index, dimensions.length, 100, CENTER_X, CENTER_Y, labelRadius));

  return (
    <div className="capability-radar-wrap">
      <svg className="capability-radar" viewBox="0 0 360 290" role="img" aria-label={`${title}。${dimensions.map((item) => `${item.name}：${item.score === null ? "暂无评价" : `${formatScore(item.score)} 分`}`).join("；")}`}>
        {dimensions.length >= 3 ? [20, 40, 60, 80, 100].map((level) => (
          <polygon
            key={level}
            className="capability-radar__grid"
            points={capabilityRadarPolygon(dimensions.map(() => level), CENTER_X, CENTER_Y, RADIUS) ?? ""}
          />
        )) : [20, 40, 60, 80, 100].map((level) => (
          <circle key={level} className="capability-radar__grid" cx={CENTER_X} cy={CENTER_Y} r={(RADIUS * level) / 100} />
        ))}
        {polygon ? <polygon className="capability-radar__area" points={polygon} /> : null}
        {dimensions.map((dimension, index) => {
          const edge = capabilityRadarPoint(index, dimensions.length, 100, CENTER_X, CENTER_Y, RADIUS);
          const label = labelPoints[index];
          const anchor = label.x < CENTER_X - 4 ? "end" : label.x > CENTER_X + 4 ? "start" : "middle";
          const point = dimension.score === null ? null : capabilityRadarPoint(index, dimensions.length, dimension.score, CENTER_X, CENTER_Y, RADIUS);
          return <g key={dimension.id}>
            <line className="capability-radar__axis" x1={CENTER_X} y1={CENTER_Y} x2={edge.x} y2={edge.y} />
            {point ? <circle className="capability-radar__point" cx={point.x} cy={point.y} r="4" /> : null}
            <text className="capability-radar__label" x={label.x} y={label.y} textAnchor={anchor}>{dimension.name}</text>
          </g>;
        })}
      </svg>
      {polygon === null && dimensions.some((item) => item.score !== null) ? <p className="capability-radar-note">完整评价各维度后显示整体雷达。</p> : null}
    </div>
  );
}

export function formatScore(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
