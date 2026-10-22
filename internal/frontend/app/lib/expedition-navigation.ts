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
  next.delete("terminal");
  if (area) next.set("area", area);
  else next.delete("area");
  return next;
}

export const EXPEDITION_TERMINALS = ["assignments", "skills", "questions", "projects", "weekly", "growth", "journal", "challenges"] as const;
export type ExpeditionTerminal = (typeof EXPEDITION_TERMINALS)[number];

export function parseExpeditionTerminal(value: string | null): ExpeditionTerminal | null {
  return EXPEDITION_TERMINALS.find((id) => id === value) ?? null;
}

export function withExpeditionTerminal(params: URLSearchParams, terminal: ExpeditionTerminal | null) {
  const next = new URLSearchParams(params);
  if (terminal) next.set("terminal", terminal);
  else next.delete("terminal");
  return next;
}
