export interface RadarPoint {
  x: number;
  y: number;
}

export function capabilityRadarPoint(index: number, count: number, score: number, centerX = 180, centerY = 145, radius = 100): RadarPoint {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(count, 1);
  const distance = (Math.min(100, Math.max(0, score)) / 100) * radius;
  return { x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance };
}

export function capabilityRadarPolygon(scores: Array<number | null>, centerX = 180, centerY = 145, radius = 100): string | null {
  if (scores.length < 3 || scores.some((score) => score === null || !Number.isFinite(score))) return null;
  return scores.map((score, index) => {
    const point = capabilityRadarPoint(index, scores.length, score!, centerX, centerY, radius);
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
}
