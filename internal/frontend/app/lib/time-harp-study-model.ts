export const STUDY_VIEW_WIDTH = 1000;
export const STUDY_VIEW_HEIGHT = 1000;
export const STUDY_STRING_COUNT = 9;
export const STUDY_YEARS = Array.from({ length: STUDY_STRING_COUNT }, (_, index) => 2018 + index);

export type HarpForm = "literal" | "abstract" | "array";
export type StringArrangement = "ascending" | "descending" | "artistic";

export type StudyString = {
  index: number;
  year: number;
  x: number;
  startY: number;
  endY: number;
  length: number;
};

export type StudyPoint = {
  x: number;
  y: number;
};

const BASELINE = 830;
const MIN_LENGTH = 455;
const MAX_LENGTH = 665;
const ABSTRACT_OFFSETS = [-13, -7, 5, 13, 7, -4, -12, -3, 14];
const ARRAY_OFFSETS = [0, 7, -8, 10, -11, 8, -7, 12, -2];
const ARTISTIC_LENGTHS = [0.58, 0.72, 0.9, 1, 0.89, 0.73, 0.66, 0.82, 0.95];

export function getStudyLayout(form: HarpForm, arrangement: StringArrangement): StudyString[] {
  return STUDY_YEARS.map((year, index) => {
    const progress = index / (STUDY_STRING_COUNT - 1);
    const lengthRatio = arrangement === "ascending"
      ? 0.58 + 0.42 * progress
      : arrangement === "descending"
        ? 1 - 0.42 * progress
        : ARTISTIC_LENGTHS[index];
    const length = MIN_LENGTH + (MAX_LENGTH - MIN_LENGTH) * lengthRatio;
    const offset = form === "abstract"
      ? ABSTRACT_OFFSETS[index]
      : form === "array"
        ? ARRAY_OFFSETS[index]
        : 0;

    return {
      index,
      year,
      x: 56 + index * 111 + offset,
      startY: BASELINE - length,
      endY: BASELINE,
      length,
    };
  });
}

export function findNearestStudyString(
  strings: readonly StudyString[],
  clientX: number,
  stageLeft: number,
  stageWidth: number,
  hitWidth = 44,
) {
  if (stageWidth <= 0 || strings.length === 0) return null;

  const localX = (clientX - stageLeft) / stageWidth * STUDY_VIEW_WIDTH;
  let nearestIndex: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const string of strings) {
    const distance = Math.abs(string.x - localX) / STUDY_VIEW_WIDTH * stageWidth;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = string.index;
    }
  }

  return nearestDistance <= hitWidth / 2 ? nearestIndex : null;
}

export function getSweepStringIndices(fromIndex: number, toIndex: number, stringCount: number) {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    stringCount < 1 ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= stringCount ||
    toIndex >= stringCount ||
    fromIndex === toIndex
  ) {
    return [];
  }

  const direction = Math.sign(toIndex - fromIndex);
  const crossed: number[] = [];
  for (let index = fromIndex + direction; index !== toIndex + direction; index += direction) {
    crossed.push(index);
  }
  return crossed;
}

export function getStudyNeckPoints(strings: readonly StudyString[], clearance = 32): StudyPoint[] {
  return strings.map(({ x, startY }) => ({ x, y: startY - clearance }));
}

export function getSmoothCurveSegments(points: readonly StudyPoint[]) {
  return points.slice(0, -1).map((from, index) => {
    const to = points[index + 1];
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 2)];

    return {
      from,
      to,
      control1: {
        x: from.x + (to.x - previous.x) / 6,
        y: from.y + (to.y - previous.y) / 6,
      },
      control2: {
        x: to.x - (next.x - from.x) / 6,
        y: to.y - (next.y - from.y) / 6,
      },
    };
  });
}

export function buildSmoothStudyPath(points: readonly StudyPoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  const segments = getSmoothCurveSegments(points);
  const first = points[0];
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${segments.map(({ control1, control2, to }) =>
    `C ${control1.x.toFixed(2)} ${control1.y.toFixed(2)} ${control2.x.toFixed(2)} ${control2.y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`,
  ).join(" ")}`;
}
