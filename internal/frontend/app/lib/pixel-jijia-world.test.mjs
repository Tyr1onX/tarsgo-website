import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  PLACES, WORLD_HEIGHT, WORLD_WIDTH,
  cameraAt, closestPlace, isWalkable,
} from "./pixel-jijia-world.ts";

test("小镇的六个地点具有可用的站内内容入口", () => {
  assert.equal(PLACES.length, 6);
  assert.equal(new Set(PLACES.map((place) => place.id)).size, PLACES.length);
  for (const place of PLACES) {
    assert.match(place.href, /^\/(?!\/)/);
    assert.equal(isWalkable(place.x, place.y), false);
  }
});

test("从广场出发可以走近每一座建筑", () => {
  const seen = new Set(["20,15"]);
  const queue = [{ x: 20, y: 15 }];
  const visited = new Set();

  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    const nearest = closestPlace(point);
    if (nearest) visited.add(nearest.id);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const x = point.x + dx;
      const y = point.y + dy;
      const key = `${x},${y}`;
      if (isWalkable(x, y) && !seen.has(key)) {
        seen.add(key);
        queue.push({ x, y });
      }
    }
  }

  assert.deepEqual([...visited].sort(), PLACES.map((place) => place.id).sort());
  assert.equal(isWalkable(-1, 0), false);
  assert.equal(isWalkable(WORLD_WIDTH, WORLD_HEIGHT - 1), false);
});

test("移动端镜头始终保持在地图边界内", () => {
  for (const point of [{ x: 0, y: 0 }, { x: 20, y: 15 }, { x: WORLD_WIDTH - 1, y: WORLD_HEIGHT - 1 }]) {
    const camera = cameraAt(point, 23, 21);
    assert.ok(camera.x >= 0 && camera.x <= WORLD_WIDTH - 23);
    assert.ok(camera.y >= 0 && camera.y <= WORLD_HEIGHT - 21);
  }
});

test("素材在网站静态目录且许可证随包保留", () => {
  assert.ok(existsSync(new URL("../../../../public/assets/pixel-jijia/tiles.png", import.meta.url)));
  assert.ok(existsSync(new URL("../../../../public/assets/pixel-jijia/KENNEY-LICENSE.txt", import.meta.url)));
});
