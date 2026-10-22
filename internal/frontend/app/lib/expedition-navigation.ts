import type { ExpeditionFacilityId } from "./expedition-data";

export const EXPEDITION_FACILITY_IDS: readonly ExpeditionFacilityId[] = [
  "hangar",
  "mechanical",
  "controls",
  "vision",
  "ai",
  "operations",
];

export function parseExpeditionArea(value: string | null): ExpeditionFacilityId | null {
  return EXPEDITION_FACILITY_IDS.find((id) => id === value) ?? null;
}

export function withExpeditionArea(params: URLSearchParams, area: ExpeditionFacilityId | null) {
  const next = new URLSearchParams(params);
  if (area) next.set("area", area);
  else next.delete("area");
  return next;
}
