import type { RoomObject } from "./pixel-jijia-room";

export type HomeFurnitureKind = "desk" | "chair" | "lamp" | "plant" | "shelf";
export type HomeFurniture = { kind: HomeFurnitureKind; x: number; y: number };

export const HOME_FURNITURE: Record<HomeFurnitureKind, { title: string; width: number; height: number }> = {
  desk: { title: "研究工作台", width: 3, height: 2 },
  chair: { title: "座椅", width: 1, height: 1 },
  lamp: { title: "暖光台灯", width: 1, height: 1 },
  plant: { title: "绿植", width: 1, height: 1 },
  shelf: { title: "资料书架", width: 2, height: 1 },
};

export function validHomeFurniture(items: HomeFurniture[]): boolean {
  if (items.length > 24) return false;
  return items.every((item, index) => {
    const spec = HOME_FURNITURE[item.kind];
    if (!spec || !Number.isInteger(item.x) || !Number.isInteger(item.y) ||
        item.x < 2 || item.x + spec.width > 34 ||
        item.y < 7 || item.y + spec.height > 20) return false;
    return items.slice(0, index).every(other => {
      const size = HOME_FURNITURE[other.kind];
      return item.x >= other.x + size.width || item.x + spec.width <= other.x ||
        item.y >= other.y + size.height || item.y + spec.height <= other.y;
    });
  });
}

export function homeFurnitureObjects(items: HomeFurniture[]): RoomObject[] {
  return items.map((item, index) => ({
    id: `home-${index}`, kind: item.kind,
    x: item.x, y: item.y,
    width: HOME_FURNITURE[item.kind].width,
    height: HOME_FURNITURE[item.kind].height,
    title: HOME_FURNITURE[item.kind].title,
    description: `亲手摆放的${HOME_FURNITURE[item.kind].title}。每一件小家具，让研究室多了一点属于自己的气息。`,
    solid: true,
  }));
}
