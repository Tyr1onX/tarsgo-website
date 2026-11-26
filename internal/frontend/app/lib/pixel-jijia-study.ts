import { STUDY_ROOM, type RoomScene, type RoomObject } from "./pixel-jijia-room.ts";

export type StudyFurnitureKind = "desk" | "chair" | "shelf" | "lamp" | "plant" | "aquarium-small" | "aquarium-large" | "cabinet" | "pedestal" | "table-display" | "pet-bed";
export type StudyFurniture = { id?:string; kind: StudyFurnitureKind; x: number; y: number };
export const STUDY_CATALOG: Record<StudyFurnitureKind, string> = {
 desk: "工作台", chair: "座椅", shelf: "书架", lamp: "台灯", plant: "绿植",
 "aquarium-small":"小鱼缸","aquarium-large":"大鱼缸",cabinet:"收藏柜",pedestal:"机器人展台","table-display":"桌面展座","pet-bed":"宠物窝",
};
export function furnitureSize(kind: StudyFurnitureKind) {
 return ["desk","aquarium-large"].includes(kind) ? { width: 3, height: 2 }
   : ["shelf","aquarium-small","cabinet","pet-bed"].includes(kind) ? { width: 2, height: 1 } : { width: 1, height: 1 };
}
export function canPlaceStudy(items: StudyFurniture[], candidate: StudyFurniture): boolean {
 if (items.length >= 24 || !Object.hasOwn(STUDY_CATALOG, candidate.kind) ||
     !Number.isInteger(candidate.x) || !Number.isInteger(candidate.y)) return false;
 const { width, height } = furnitureSize(candidate.kind);
 if (candidate.x < 2 || candidate.x + width > 34 ||
     candidate.y < 7 || candidate.y + height > 20 || (candidate.x<21&&candidate.x+width>15&&candidate.y+height>18)) return false;
 return !items.some(item => {
   const other = furnitureSize(item.kind);
   return candidate.x < item.x + other.width && candidate.x + width > item.x &&
     candidate.y < item.y + other.height && candidate.y + height > item.y;
 });
}
export function makeStudyRoom(items: StudyFurniture[], guest: boolean): RoomScene {
 const furniture: RoomObject[] = items.map(item => ({
   id: furnitureID(item), kind: item.kind, x: item.x, y: item.y,
   ...furnitureSize(item.kind), solid: true,
   title: STUDY_CATALOG[item.kind],
 }));
 return { ...STUDY_ROOM, title: guest ? "受邀参观的研究室" : "我的研究室",
   objects: [...STUDY_ROOM.objects, ...furniture] };
}

export type StudyDisplay={facilityId:string;slot:number;id:string};
export const furnitureID=(f:StudyFurniture)=>f.id??`furniture-${f.kind}-${f.x}-${f.y}`;
export function displaySlots(kind:string){
 return ({"aquarium-large":5,"aquarium-small":2,shelf:2,cabinet:3,desk:3,pedestal:1,"table-display":1} as Record<string,number>)[kind]??0;
}
export function displayAccepts(kind:string,item:{id:string;kind:string}){
 if(kind.startsWith("aquarium-"))return item.kind==="fish"||item.id==="weed";
 if(kind==="pedestal")return item.kind==="rm";
 return displaySlots(kind)>0&&["rm","nature","keepsake","tool"].includes(item.kind);
}
