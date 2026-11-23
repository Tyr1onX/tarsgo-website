// Semantic placements are temporary visual references. Only the bare field mesh
// is source-exact; official separate CAD is needed to verify these coordinates.
export type FacilityId =
  | "red-base" | "red-outpost" | "red-energy"
  | "blue-base" | "blue-outpost" | "blue-energy";
export type Team = "red" | "blue";
export type Kind = "base" | "outpost" | "energy";
export type Facility = {
  id: FacilityId;
  name: string;
  team: Team;
  kind: Kind;
  x: number;
  z: number;
  y: number;
};
export const FACILITIES: readonly Facility[] = [
  { id: "red-base", name: "红方基地", team: "red", kind: "base", x: 1.4, z: 7.0, y: .1 },
  { id: "red-outpost", name: "红方前哨站", team: "red", kind: "outpost", x: 3.8, z: 5.3, y: .3 },
  { id: "red-energy", name: "红方能量单元", team: "red", kind: "energy", x: 1.1, z: 5.55, y: .1 },
  { id: "blue-base", name: "蓝方基地", team: "blue", kind: "base", x: 11.2, z: 1.6, y: .1 },
  { id: "blue-outpost", name: "蓝方前哨站", team: "blue", kind: "outpost", x: 8.8, z: 3.3, y: .3 },
  { id: "blue-energy", name: "蓝方能量单元", team: "blue", kind: "energy", x: 11.5, z: 3.0, y: .1 },
];
