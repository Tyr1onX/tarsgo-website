import type { ExpeditionFacilityId } from "~/lib/expedition-data";

export interface FacilityInfo {
  id: ExpeditionFacilityId;
  name: string;
  englishName: string;
  groupName: string | null;
  x: number;
  y: number;
}

export const FACILITIES: readonly FacilityInfo[] = [
  { id: "hangar", name: "总装机库", englishName: "ASSEMBLY HANGAR", groupName: null, x: 50, y: 51 },
  { id: "mechanical", name: "机械工坊", englishName: "MECHANICAL WORKSHOP", groupName: "机械组", x: 27, y: 27 },
  { id: "controls", name: "电控实验室", englishName: "CONTROL LAB", groupName: "电控组", x: 74, y: 27 },
  { id: "vision", name: "视觉研究所", englishName: "VISION INSTITUTE", groupName: "视觉组", x: 19, y: 58 },
  { id: "ai", name: "AI 研究中心", englishName: "AI RESEARCH CENTER", groupName: "AI组", x: 81, y: 58 },
  { id: "operations", name: "战队指挥室", englishName: "TEAM OPERATIONS", groupName: "运营组", x: 50, y: 79 },
];
