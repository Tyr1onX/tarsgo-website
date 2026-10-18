export type RouteProgressPhase = "hidden" | "waiting" | "moving" | "aligned";

export type RouteProgressEvent =
  | { type: "navigation-started" }
  | { type: "reveal" }
  | { type: "navigation-finished" }
  | { type: "settle" };

export const ROUTE_PROGRESS_REVEAL_DELAY_MS = 120;
export const ROUTE_PROGRESS_SETTLE_DELAY_MS = 240;

export function routeProgressReducer(
  phase: RouteProgressPhase,
  event: RouteProgressEvent,
): RouteProgressPhase {
  switch (event.type) {
    case "navigation-started":
      if (phase === "hidden") return "waiting";
      if (phase === "aligned") return "moving";
      return phase;
    case "reveal":
      return phase === "waiting" ? "moving" : phase;
    case "navigation-finished":
      if (phase === "waiting") return "hidden";
      if (phase === "moving") return "aligned";
      return phase;
    case "settle":
      return phase === "aligned" ? "hidden" : phase;
  }
  return phase;
}
