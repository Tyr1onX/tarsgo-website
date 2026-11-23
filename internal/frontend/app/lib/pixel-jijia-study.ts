import { STUDY_ROOM, type RoomScene, type RoomObject } from "./pixel-jijia-room";

export type StudyFurnitureKind = "desk" | "chair" | "shelf" | "lamp" | "plant";
export type StudyFurniture = { kind: StudyFurnitureKind; x: number; y: number };
export const STUDY_CATALOG: Record<StudyFurnitureKind, string> = {
 desk: "工作台", chair: "座椅", shelf: "书架", lamp: "台灯", plant: "绿植",
};
export function furnitureSize(kind: StudyFurnitureKind) {
 return kind === "desk" ? { width: 3, height: 2 }
   : kind === "shelf" ? { width: 2, height: 1 } : { width: 1, height: 1 };
}
export function canPlaceStudy(items: StudyFurniture[], candidate: StudyFurniture): boolean {
 if (items.length >= 24 || !Object.hasOwn(STUDY_CATALOG, candidate.kind) ||
     !Number.isInteger(candidate.x) || !Number.isInteger(candidate.y)) return false;
 const { width, height } = furnitureSize(candidate.kind);
 if (candidate.x < 2 || candidate.x + width > 34 ||
     candidate.y < 7 || candidate.y + height > 20) return false;
 return !items.some(item => {
   const other = furnitureSize(item.kind);
   return candidate.x < item.x + other.width && candidate.x + width > item.x &&
     candidate.y < item.y + other.height && candidate.y + height > item.y;
 });
}
export function makeStudyRoom(items: StudyFurniture[], guest: boolean): RoomScene {
 const furniture: RoomObject[] = items.map((item, i) => ({
   id: `furniture-${i}`, kind: item.kind, x: item.x, y: item.y,
   ...furnitureSize(item.kind), solid: true,
   title: STUDY_CATALOG[item.kind], description: "研究室中的个人摆设。",
 }));
 return { ...STUDY_ROOM, title: guest ? "受邀参观的研究室" : "我的研究室",
   objects: [...STUDY_ROOM.objects, ...furniture] };
}
