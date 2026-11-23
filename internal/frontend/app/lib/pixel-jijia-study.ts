import { STUDY_ROOM, type RoomScene, type RoomObject } from "./pixel-jijia-room";

export type StudyFurnitureKind = "desk" | "chair" | "bookshelf" | "lamp" | "plant" | "terminal";
export type StudyFurniture = { kind: StudyFurnitureKind; x: number; y: number; rotation: number };
export const STUDY_CATALOG: Record<StudyFurnitureKind, string> = {
  desk: "工作台", chair: "座椅", bookshelf: "书架",
  lamp: "台灯", plant: "绿植", terminal: "研究终端",
};
export function canPlaceStudy(items: StudyFurniture[], candidate: StudyFurniture): boolean {
  return items.length < 24 && Object.hasOwn(STUDY_CATALOG, candidate.kind) &&
    Number.isInteger(candidate.x) && Number.isInteger(candidate.y) &&
    candidate.x >= 2 && candidate.x <= 17 && candidate.y >= 5 && candidate.y <= 13 &&
    candidate.rotation >= 0 && candidate.rotation <= 3 &&
    !(candidate.y >= 12 && candidate.x >= 8 && candidate.x <= 12) &&
    !items.some(item => item.x === candidate.x && item.y === candidate.y);
}
export function makeStudyRoom(items: StudyFurniture[], guest: boolean): RoomScene {
  const furniture: RoomObject[] = items.map((item, i) => ({
    id: `furniture-${i}`, kind: item.kind, x: item.x, y: item.y,
    width: 1, height: 1, solid: true,
    title: STUDY_CATALOG[item.kind], description: "研究室中的个人摆设。",
  }));
  return { ...STUDY_ROOM, title: guest ? "受邀参观的研究室" : "我的研究室",
    objects: [...STUDY_ROOM.objects, ...furniture] };
}
