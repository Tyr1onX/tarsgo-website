import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { inflateSync } from "node:zlib";
import {
  PLACES, SPAWN, TILE, WALK_SPEED, WORLD_HEIGHT, WORLD_WIDTH,
  cameraAt, closestPlace, isWalkable, movePlayer,
} from "./pixel-jijia-world.ts";

test("六个场景均有独立地址与可用官网入口", () => {
  assert.equal(PLACES.length, 6);
  assert.equal(new Set(PLACES.map((p) => p.id)).size, 6);
  for (const place of PLACES) {
    assert.match(place.href, /^\/(?!\/)/);
    assert.equal(isWalkable(place.x + 1, place.y + 2), false);
    assert.ok(closestPlace({x:place.x + place.width/2, y:place.y+place.height+1}));
  }
});

test("连续按住方向键按时间推进小数坐标，而非逐格跳跃", () => {
  const start = { ...SPAWN };
  const first = movePlayer(start, 1, 0, 1 / 60);
  assert.ok(first.x > start.x && first.x < start.x + 1);
  assert.equal(first.y, start.y);
  const after = Array.from({length:60}).reduce((p) => movePlayer(p, 1, 0, 1/60), start);
  assert.ok(after.x - start.x > 4 && after.x - start.x < 6);
  assert.ok(Math.abs(movePlayer(start, 1, 1, 1 / 60).x - start.x) < WALK_SPEED/60);
});

test("碰撞阻止穿墙但允许沿墙滑动，停顿帧不会造成传送", () => {
  const blocked = {x:15, y:20.7};
  assert.equal(isWalkable(blocked.x,blocked.y), true);
  assert.equal(movePlayer(blocked, 0, -1, 0.05).y, blocked.y);
  assert.ok(movePlayer(blocked, 1, -1, 0.05).x > blocked.x);
  const noTeleport = movePlayer(SPAWN, 0, 1, 8);
  assert.ok(noTeleport.y - SPAWN.y <= WALK_SPEED * 0.05 + 1e-8);
});

test("从出生点可实际步行抵达六个场景", () => {
  const initial = { x: Math.round(SPAWN.x), y: Math.round(SPAWN.y) };
  const queue = [initial];
  const seen = new Set([`${initial.x},${initial.y}`]);
  const reachable = new Set();

  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    const near = closestPlace(point);
    if (near) reachable.add(near.id);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: point.x + dx, y: point.y + dy };
      const key = `${next.x},${next.y}`;
      if (isWalkable(next.x, next.y) && !seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  assert.deepEqual([...reachable].sort(), PLACES.map((p) => p.id).sort());
});

test("镜头平滑跟随目标并限制在地图边界", () => {
  for (const p of [{ x: 1, y: 1 }, SPAWN, { x: WORLD_WIDTH - 1, y: WORLD_HEIGHT - 1 }]) {
    const camera = cameraAt(p, 630, 400);
    assert.ok(camera.x >= 0 && camera.x <= WORLD_WIDTH*TILE-630);
    assert.ok(camera.y >= 0 && camera.y <= WORLD_HEIGHT*TILE-400);
  }
});

test("场景使用经抠图的真实生成素材，而不是 Canvas 模拟图", () => {
  const base = new URL("../../../../public/assets/pixel-jijia/", import.meta.url);
  const image = new URL("actual-imagegen-atlas.png", base);
  assert.ok(existsSync(image), "缺少真实生成并抠图的 PNG：不能部署模拟素材");
  const png = readFileSync(image);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const explorer = readFileSync(new URL("explorer-4dir.png", base));
  assert.deepEqual([...explorer.subarray(0, 8)], [...png.subarray(0, 8)]);
  assert.equal(explorer.readUInt32BE(16), 160); // 4 directions × 4 frames, 40 px per frame
  assert.equal(explorer.readUInt32BE(20), 216); // 54 px per frame
  const { sprites } = JSON.parse(readFileSync(new URL("actual-imagegen-atlas.json", base), "utf8"));
  for (const id of [...PLACES.map((place) => place.id), "green_tree", "pink_tree", "fountain"]) {
    assert.ok(sprites[id]?.[2] > 0 && sprites[id]?.[3] > 0, `${id} 素材缺失`);
  }
  assert.equal(Object.keys(sprites).filter((key) => key.startsWith("terrain_")).length, 0);
});

test("专用地面图块全部无透明像素、重复边缘一致，不会产生贴图接缝", () => {
  const path = new URL("../../../../public/assets/pixel-jijia/ground-tiles.png", import.meta.url);
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 160);
  assert.equal(png.readUInt32BE(20), 16);
  assert.equal(png[25], 2); // RGB, no transparent or partially keyed pixels

  const parts = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      parts.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(parts));
  const stride = 160 * 3 + 1;
  const rgb = (tile, x, y) => {
    assert.equal(pixels[y * stride], 0, "地面图集必须使用零过滤，便于边缘校验");
    const index = y * stride + 1 + (tile * 16 + x) * 3;
    return [...pixels.subarray(index, index + 3)];
  };

  for (let tile = 0; tile < 10; tile++) {
    const base = rgb(tile, 0, 0);
    for (let i = 0; i < 16; i++) {
      assert.deepEqual(rgb(tile, i, 0), base);
      assert.deepEqual(rgb(tile, i, 15), base);
      assert.deepEqual(rgb(tile, 0, i), base);
      assert.deepEqual(rgb(tile, 15, i), base);
    }
  }
  for (const group of [[0, 1, 2, 3], [4, 5], [6, 7], [8, 9]]) {
    for (const tile of group.slice(1)) {
      assert.deepEqual(rgb(tile, 0, 0), rgb(group[0], 0, 0));
    }
  }
});
