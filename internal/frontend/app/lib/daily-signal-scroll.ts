type HorizontalRect = Pick<DOMRect, "left" | "right" | "width">;

type HeatmapCell = {
  getBoundingClientRect(): HorizontalRect;
};

type HeatmapViewport = {
  scrollLeft: number;
  clientLeft: number;
  clientWidth: number;
  scrollWidth: number;
  getBoundingClientRect(): HorizontalRect;
  querySelector(selector: string): HeatmapCell | null;
  scrollTo(options: ScrollToOptions): void;
};

export function scrollHeatmapToDate(date: string, viewport: HeatmapViewport | null, behavior: ScrollBehavior) {
  if (!viewport) return;
  const target = viewport.querySelector(`[data-signal-date="${date}"]`);
  if (!target) return;

  const targetRect = target.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const targetCenter = viewport.scrollLeft + targetRect.left - viewportRect.left + targetRect.width / 2;
  const targetLeft = targetCenter - viewport.clientWidth * 0.58;
  scrollHeatmap(viewport, targetLeft, behavior);
}

export function scrollHeatmapCellIntoView(
  target: HeatmapCell | null,
  viewport: HeatmapViewport | null,
  behavior: ScrollBehavior,
) {
  if (!target || !viewport) return;

  const targetRect = target.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const visibleLeft = viewportRect.left + viewport.clientLeft;
  const visibleRight = visibleLeft + viewport.clientWidth;
  let targetLeft = viewport.scrollLeft;

  if (targetRect.left < visibleLeft) targetLeft += targetRect.left - visibleLeft;
  else if (targetRect.right > visibleRight) targetLeft += targetRect.right - visibleRight;

  scrollHeatmap(viewport, targetLeft, behavior);
}

function scrollHeatmap(viewport: HeatmapViewport, targetLeft: number, behavior: ScrollBehavior) {
  const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const left = Math.max(0, Math.min(maxScrollLeft, targetLeft));
  if (Math.abs(left - viewport.scrollLeft) < 1) return;
  viewport.scrollTo({ left, behavior });
}
