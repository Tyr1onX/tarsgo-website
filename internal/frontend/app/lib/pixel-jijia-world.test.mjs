import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { inflateSync } from "node:zlib";
import {
  FOUNTAIN, GROUND_AREAS, PLACES, SCENERY, SPAWN, TILE, WALK_SPEED, RUN_SPEED, WORLD_HEIGHT, WORLD_WIDTH,
  benchExit, benchSeat, cameraAt, clampZoom, closestBench, closestPlace, closestStory, isWalkable, movePlayer, outdoorDoorAt, sceneryBlocks, snapCamera,
} from "./pixel-jijia-world.ts";

test("六个场景均有独立地址与可用官网入口", () => {
  assert.equal(PLACES.length, 6);
  assert.equal(PLACES.find((place) => place.id === "ai")?.href, "/pixel-jijia/battle");
  assert.equal(new Set(PLACES.map((p) => p.id)).size, 6);
  for (const place of PLACES) {
    assert.match(place.href, /^\/(?!\/)/);
    assert.equal(isWalkable(place.x + 1, place.y + 2), false);
    assert.ok(closestPlace({x:place.x + place.width/2, y:place.y+place.height+1}));
  }
});

test("同一场景数据驱动地形、装饰和真实碰撞", () => {
  assert.equal(GROUND_AREAS.length, 32);
  for (const area of GROUND_AREAS) {
    assert.ok(area.x >= 0 && area.y >= 0);
    assert.ok(area.x + area.width <= WORLD_WIDTH && area.y + area.height <= WORLD_HEIGHT);
  }
  const props = ["bench","lamp","sign","planter","oak","lime_tree","cherry",
    "rocks","fence","hydrangea","statue","arch"];
  assert.ok(SCENERY.length >= 30);
  for (const obj of SCENERY) {
    assert.ok(props.includes(obj.sprite), obj.sprite);
    assert.ok(obj.x >= 0 && obj.x <= WORLD_WIDTH);
    assert.ok(obj.y >= 0 && obj.y <= WORLD_HEIGHT);
    assert.ok(obj.width > 0 && obj.height > 0);
  }
  assert.ok(isWalkable(SPAWN.x, SPAWN.y));
  assert.equal(isWalkable(FOUNTAIN.x, FOUNTAIN.y), false);
  const obstacle = SCENERY.find(obj => obj.sprite === "statue");
  assert.ok(obstacle);
  assert.equal(isWalkable(obstacle.x, obstacle.y), false);
  const arch = SCENERY.find(obj => obj.sprite === "arch");
  assert.ok(arch);
  assert.ok(!arch.solid, "门廊必须可通行");
});

test("建筑顶部和入口前的实体不会再出现可穿过的缝隙", () => {
  for (const place of PLACES) {
    for (const y of [place.y + 0.25, place.y + place.height - 0.25]) {
      assert.equal(isWalkable(place.x + place.width / 2, y), false,
        `${place.id}: 建筑主体不能出现上下边缘穿模`);
    }
    assert.equal(isWalkable(place.x + place.width / 2, place.y + place.height + 0.6), true,
      `${place.id}: 正面入口必须可停留互动`);
    assert.equal(closestPlace({
      x: place.x + place.width / 2, y: place.y + place.height + 0.6,
    })?.id, place.id);
  }
});

test("桌椅、栅栏、花坛和花丛使用真实宽度脚底碰撞，门廊中央仍可通过", () => {
  for (const type of ["bench", "fence", "planter", "rocks", "hydrangea"]) {
    const object = SCENERY.find(p => p.sprite === type);
    assert.ok(object);
    assert.equal(sceneryBlocks(object, object.x + object.width / TILE * 0.25, object.y), true,
      `${type} 横向边缘也必须阻挡`);
  }
  const decorative = SCENERY.find(p => p.sprite === "hydrangea" && !p.solid);
  assert.ok(decorative);
  assert.equal(isWalkable(decorative.x, decorative.y), false, "未单独配置 solid 的花丛不能穿过");
  const arch = SCENERY.find(p => p.sprite === "arch");
  assert.ok(arch);
  assert.equal(sceneryBlocks(arch, arch.x, arch.y), false, "门廊中间是可通行的");
  const offset = arch.width / (2 * TILE) - 0.8;
  assert.equal(sceneryBlocks(arch, arch.x - offset, arch.y), true, "门廊两侧立柱须有实体");
  assert.equal(sceneryBlocks(arch, arch.x + offset, arch.y), true);
});

test("池塘水面不可穿行，岸边道路仍可通行", () => {
  const ponds = GROUND_AREAS.filter((area) => area.kind === 3);
  assert.equal(ponds.length, 4);
  for (const pond of ponds) {
    const y = pond.y + pond.height / 2;
    assert.equal(isWalkable(pond.x + pond.width / 2, y), false);
    assert.equal(isWalkable(pond.x - 0.31, y), true);
    assert.equal(isWalkable(pond.x + pond.width + 0.31, y), true);
  }
});

test("统一场景图集必须包含十二个真实透明环境素材", () => {
  const path = new URL("../assets/pixel-jijia/plaza-props.png", import.meta.url);
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0,8)], [137,80,78,71,13,10,26,10]);
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 384);
  assert.equal(png[25], 6); // transparent RGBA
  const scene = readFileSync(new URL("./pixel-jijia-scene.ts", import.meta.url), "utf8");
  assert.ok(scene.includes("renderScene("));
  assert.ok(scene.includes("node.y > player.y"), "必须按照脚底深度交错绘制人物和场景");
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  assert.ok(route.includes("plaza-props.png?url"), "场景素材必须使用内容指纹避免旧缓存");
});

test("连续按住方向键按时间推进小数坐标，而非逐格跳跃", () => {
  const start = { ...SPAWN };
  const first = movePlayer(start, 1, 0, 1 / 60);
  assert.ok(first.x > start.x && first.x < start.x + 1);
  assert.equal(first.y, start.y);
  const after = Array.from({length:60}).reduce((p) => movePlayer(p, 1, 0, 1/60), start);
  assert.ok(after.x - start.x > 6.8 && after.x - start.x < 7.1);
  assert.ok(Math.abs(movePlayer(start, 1, 1, 1 / 60).x - start.x) < WALK_SPEED/60);
});

test("碰撞阻止穿墙但允许沿墙滑动，停顿帧不会造成传送", () => {
  const blocked = {x:39, y:37.31};
  assert.equal(isWalkable(blocked.x,blocked.y), true);
  assert.equal(movePlayer(blocked, 0, -1, 0.05).y, blocked.y);
  assert.ok(movePlayer(blocked, 1, -1, 0.05).x > blocked.x);
  const noTeleport = movePlayer(SPAWN, 0, 1, 8);
  assert.ok(noTeleport.y - SPAWN.y <= WALK_SPEED * 0.05 + 1e-8);
});

test("Shift / 按住按钮疾跑更快且仍使用同一条安全碰撞路径", () => {
  assert.ok(RUN_SPEED > WALK_SPEED && RUN_SPEED < WALK_SPEED * 2);
  const walk = Array.from({ length: 60 }).reduce(p => movePlayer(p, 1, 0, 1 / 60), SPAWN);
  const sprint = Array.from({ length: 60 }).reduce(p => movePlayer(p, 1, 0, 1 / 60, true), SPAWN);
  assert.ok(sprint.x > walk.x + 2);
  assert.ok(sprint.x - SPAWN.x < RUN_SPEED + 0.01);
  const wall = { x: 39, y: 37.31 };
  assert.equal(movePlayer(wall, 0, -1, 0.05, true).y, wall.y);
  assert.ok(movePlayer(wall, 1, -1, 0.05, true).x > wall.x);
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  assert.ok(route.includes('event.key === "Shift"'));
  assert.ok(route.includes("movePlayer(previous, x, y, dt, sprinting,"));
  assert.ok(route.includes('aria-label="按住疾跑"'));
  assert.ok(route.includes("sprintTouchRef.current = false"));
});

test("V4 提速约三成，疾跑依然有明确区别且不破坏碰撞", () => {
  assert.equal(WALK_SPEED, 7.0);
  assert.equal(RUN_SPEED, 10.5);
  assert.ok(RUN_SPEED / WALK_SPEED >= 1.4);
  const obstacle = { x: 39, y: 37.31 };
  assert.equal(movePlayer(obstacle, 0, -1, 0.05, true).y, obstacle.y);
});

test("每张石凳有实际坐点和安全起身位置", () => {
  const benches = SCENERY.filter(p => p.sprite === "bench");
  assert.ok(benches.length > 2);
  for (const bench of benches) {
    const seat = benchSeat(bench);
    assert.equal(seat.x, bench.x);
    assert.ok(seat.y < bench.y);
    const exit = benchExit(bench);
    assert.ok(exit, `石凳 ${bench.x},${bench.y} 应能安全起身`);
    assert.ok(isWalkable(exit.x, exit.y));
    assert.equal(closestBench({ x: bench.x, y: bench.y })?.sprite, "bench");
  }
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  const scene = readFileSync(new URL("./pixel-jijia-scene.ts", import.meta.url), "utf8");
  assert.ok(route.includes("setSeated(bench)"));
  assert.ok(route.includes("onClick={standUp}"));
  assert.ok(route.includes("canvas.dataset.seated"));
  assert.ok(scene.includes("if (seated)"));
  assert.ok(scene.includes("const screenCamera = snapCamera(camera)"));
});

test("从出生点可实际步行抵达六个场景", () => {
  const initial = { x: Math.round(SPAWN.x), y: Math.round(SPAWN.y) };
  const queue = [initial];
  const seen = new Set([`${initial.x},${initial.y}`]);
  const reachable = new Set();
  const discovered = new Set();

  for (let index = 0; index < queue.length; index++) {
    const point = queue[index];
    const near = closestPlace(point);
    if (near) reachable.add(near.id);
    const story = closestStory(point);
    if (story?.story) discovered.add(story.story.title);
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
  assert.deepEqual([...discovered].sort(), SCENERY.filter(p => p.story).map(p => p.story.title).sort());
  assert.equal(discovered.size, 17, "新增故事点也必须能从出生点步行发现");
});

test("镜头平滑跟随目标并限制在地图边界", () => {
  for (const p of [{ x: 1, y: 1 }, SPAWN, { x: WORLD_WIDTH - 1, y: WORLD_HEIGHT - 1 }]) {
    const camera = cameraAt(p, 630, 400);
    assert.ok(camera.x >= 0 && camera.x <= WORLD_WIDTH*TILE-630);
    assert.ok(camera.y >= 0 && camera.y <= WORLD_HEIGHT*TILE-400);
  }
});

test("广场人工设施按同一轴线对齐，环境装饰仍可自由错落", () => {
  const at = (name, y) => SCENERY.filter(p => p.sprite === name && p.y === y).map(p => p.x);
  assert.deepEqual(at("bench", 49), [62, 82]);
  assert.deepEqual(at("lamp", 61.3), [62, 82]);
  assert.deepEqual(at("planter", 42.1), [59, 85]);
  assert.deepEqual(at("planter", 59.7), [59, 85]);
  assert.equal(SCENERY.find(p => p.sprite === "arch")?.x, FOUNTAIN.x);
  assert.equal(SCENERY.find(p => p.sprite === "statue")?.x, 82);
  assert.equal(FOUNTAIN.x, 72);
  assert.equal(SPAWN.y, 56);
});

test("故事点复用可见素材和碰撞配置，不制造不可见标记", () => {
  const stories = SCENERY.filter(p => p.story);
  assert.equal(stories.length, 17);
  assert.equal(new Set(stories.map(p => p.story.title)).size, stories.length);
  for (const item of stories) {
    const checkX = item.sprite === "arch" ? item.x + item.width / (2 * TILE) - 0.8 : item.x;
    assert.ok(sceneryBlocks(item, checkX, item.y), "故事地标须有可见实体与碰撞");
    assert.ok(item.story.caption && item.story.description);
    assert.equal(closestStory({ x: item.x + 1.5, y: item.y })?.story?.title, item.story.title);
  }
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  assert.ok(route.includes("closestFeature(playerRef.current)"));
  assert.ok(route.includes("selected.story?.description"));
  assert.ok(route.includes("selected.story?.action"));
  assert.ok(route.includes("selected.story?.result"));
  assert.ok(stories.filter(p => p.story?.action && p.story?.result).length >= 5);
});

test("静态地面、道具和角色使用同一帧像素镜头偏移", () => {
  const scene = readFileSync(new URL("./pixel-jijia-scene.ts", import.meta.url), "utf8");
  assert.match(scene, /const screenCamera = snapCamera\(camera\)/);
  assert.match(scene, /ctx\.drawImage\(terrain, -screenCamera\.x, -screenCamera\.y\)/);
  assert.match(scene, /drawNode\(ctx, node, atlas, sprites, props, screenCamera\)/);
  assert.match(scene, /renderExplorer\(ctx, characterSheet, player, direction, walking, traveled, screenCamera, seated\)/);
  for (const x of [10.1, 10.49, 10.51, 10.9, 11.4]) {
    const camera = snapCamera({ x, y: 20.6 });
    const ground = 100 - camera.x;
    const statue = Math.round(82 * TILE - 49 / 2) - camera.x;
    assert.equal(statue - ground, Math.round(82 * TILE - 49 / 2) - 100);
  }
});

test("缩放可精细调节并根据屏幕尺寸避免露出地图外区域", () => {
  assert.equal(clampZoom(1.35, 1440, 900), 1.35);
  assert.equal(clampZoom(0.5, 1440, 900), 1);
  assert.equal(clampZoom(1, 1920, 1080), 1);
  assert.equal(clampZoom(1.256, 1440, 900), 1.26);
  assert.equal(clampZoom(9, 1440, 900), 3.2);
  for (const [w, h] of [[390, 844], [1440, 900], [1920, 1080], [2560, 1440]]) {
    const zoom = clampZoom(0.5, w, h);
    assert.ok(Math.round(w / zoom) <= WORLD_WIDTH * TILE);
    assert.ok(Math.round(h / zoom) <= WORLD_HEIGHT * TILE);
  }
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  assert.ok(route.includes('canvas.addEventListener("wheel", onWheel, { passive: false })'));
  assert.ok(route.includes("frame = requestAnimationFrame(tick)"), "缩放与地图更新继续使用单一 RAF 循环");
  assert.ok(!route.includes('[assetState, zoom]'), "缩放不能反复重建动画循环");
});

test("小地图缩小真实世界场景，默认紧凑且展开后仍可导航", () => {
  const scene = readFileSync(new URL("./pixel-jijia-scene.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../routes/pixel-jijia.css", import.meta.url), "utf8");
  assert.ok(scene.includes("export function renderWorldPreview("));
  assert.ok(scene.includes("export function renderNavigationMap("));
  assert.ok(scene.includes("for (const node of NODES) drawNode(ctx, node, atlas, sprites, props, { x: 0, y: 0 })"));
  assert.ok(scene.includes("ctx.drawImage(terrain, 0, 0)"));
  assert.ok(scene.includes("ctx.drawImage(preview, 0, 0, width, height)"));
  assert.ok(scene.includes("ctx.fillText(place.title,"));
  assert.ok(scene.includes("for (const place of PLACES)"));
  assert.ok(scene.includes("if (!item.story) continue"));
  assert.ok(!scene.includes("export function renderTown("), "不能保留额外的完整世界小地图缓存");
  assert.ok(route.includes("renderNavigationMap(miniCtx, preview"));
  assert.ok(route.includes("previewRef.current = renderWorldPreview("));
  assert.ok(route.includes("width={432} height={288}"));
  assert.ok(route.includes("handleNavigationClick"));
  assert.ok(route.includes("pixel-world-map-destinations"));
  assert.ok(route.includes("pixel-world-map-discoveries"));
  assert.ok(!route.includes("pixel-world-brand"), "左上角品牌组件必须彻底移除");
  assert.ok(!css.includes(".pixel-world-brand"), "不能留下废弃品牌 CSS");
  assert.ok(!route.includes("townRef"));
  assert.ok(route.includes('event.key.toLowerCase() === "m"'));
  assert.ok(route.includes("aria-expanded={mapOpen}"));
  assert.ok(!route.includes("aria-hidden={!mapOpen}"));
  assert.ok(route.includes("if (!mapOpen) { setMapOpen(true); return; }"));
  assert.ok(css.includes(".pixel-world-map-panel:not(.is-open) canvas { cursor: zoom-in; }"));
  assert.ok(css.includes(".pixel-world-map-panel.is-open {"));
  assert.ok(!css.includes(".pixel-world-map-panel {\n  display: none;"));
  assert.ok(!css.includes(".pixel-world-hud"), "移除常驻区域卡片");
});

test("机械工坊具备可通行室内、独立功能区与真实进出闭环", () => {
  const room = readFileSync(new URL("./pixel-jijia-room.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  const world = readFileSync(new URL("./pixel-jijia-world.ts", import.meta.url), "utf8");
  assert.ok(room.includes("export const MECHANICAL_ROOM: RoomScene"));
  assert.ok(room.includes('id: "mechanical"'));
  assert.ok(room.includes("walls: []"), "重绘房间不能残留图片中不存在的隔墙");
  assert.ok(room.includes('id: "assembly"'));
  assert.ok(room.includes('id: "tool-storage"'));
  assert.ok(room.includes('id: "cad"'));
  assert.ok(room.includes('id: "exit"'));
  assert.ok(room.includes("export function isRoomWalkable("));
  assert.ok(room.includes("overlapsRect(x, y, radius, w)"));
  assert.ok(room.includes("renderExplorer(ctx, character, player, direction, walking, traveled, screenCamera)"));
  assert.ok(world.includes("walkable: (x: number, y: number) => boolean = isWalkable"));
  assert.ok(route.includes("movePlayer(previous, x, y, dt, sprinting,"));
  assert.ok(route.includes("renderRoomScene(ctx, roomTerrain, room, character"));
  assert.ok(route.includes("cameraRef.current = cameraAt(destination.entry"));
  assert.ok(route.includes('canvas.dataset.scene = room?.id ?? "outdoor"'));
  assert.ok(route.includes("roomExitAt(room, next, y)"));
  assert.ok(!route.includes("onClick={() => enterRoom(selected.id)}"), "进入建筑不能再依赖点击按钮");
  assert.ok(route.includes("setRoomId(null)"));
  assert.ok(route.includes("{!room && <aside"));
});

test("六栋建筑都有不同的可进入室内与独立设备，不复制人物控制器", () => {
  const source = readFileSync(new URL("./pixel-jijia-room.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("export const ROOMS: Record<string, RoomScene>"));
  for (const id of PLACES.map(place => place.id)) {
    assert.ok(source.includes(`  ${id}: {`) || (id === "mechanical" && source.includes("mechanical: MECHANICAL_ROOM")),
      `缺少 ${id} 的室内布局`);
  }
  for (const kind of ["display", "camera", "server", "reception"]) {
    assert.ok(source.includes(`kind: "${kind}"`), `缺少 ${kind} 类型设施`);
  }
  assert.ok(route.includes("roomArtRef.current = Object.fromEntries(interiors)"),
    "六栋室内应加载独立原创素材而非旧几何铺装");
  assert.ok(route.includes("renderRoomTerrain(STUDY_ROOM)"),
    "个人研究室应继续使用可编辑家具层");
  assert.ok(route.includes("const destination = ROOMS[placeId]"));
  assert.ok(route.includes("const place = PLACES.find(p => p.id === roomId)"));
  assert.ok(!route.includes("onClick={() => enterRoom(selected.id)}"), "进入建筑不能再依赖点击按钮");
  assert.equal(source.split("export function renderRoomScene(").length, 2,
    "所有室内必须复用同一个渲染入口");
});

test("六栋室内使用六张各自独立的原创图片，比例与世界一致", () => {
  const ids = PLACES.map(p => p.id);
  const seen = new Set();
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  const scene = readFileSync(new URL("./pixel-jijia-room.ts", import.meta.url), "utf8");
  for (const id of ids) {
    const data = readFileSync(new URL(`../assets/pixel-jijia/interior-${id}-v6.webp`, import.meta.url));
    assert.equal(data.toString("ascii", 0, 4), "RIFF", id);
    assert.equal(data.toString("ascii", 8, 12), "WEBP", id);
    assert.equal(data.toString("ascii", 12, 16), "VP8 ", id);
    const w = data.readUInt16LE(26) & 0x3fff, h = data.readUInt16LE(28) & 0x3fff;
    assert.ok(w >= 36 * TILE && h >= 24 * TILE, `${id} 室内图片不得低于场景实际渲染尺寸`);
    assert.ok(Math.abs(w / h - 1.5) < 0.02, `${id} 素材比例会导致拉伸`);
    seen.add(data.toString("base64"));
    assert.ok(route.includes(`interior-${id}-v6.webp?url`), `${id} 尚未加载室内图片`);
  }
  assert.equal(seen.size, ids.length, "六张室内图片不能重复复用");
  assert.ok(scene.includes('room.id !== "study"'), "公开建筑使用图片、研究室保留可编辑家具");
  assert.ok(scene.includes("drawRoomObject(ctx, object, screenCamera)"), "不能破坏研究室家具绘制");
  assert.ok(route.includes('const roomTerrain = room?.id === "study"'));
});

test("生成场景的家具碰撞与可见物件位置对应且入口可通行", () => {
  const source = readFileSync(new URL("./pixel-jijia-room.ts", import.meta.url), "utf8");
  // Old partition walls belonged to hand-drawn geometry and would become invisible blockers.
  assert.ok(!source.includes("width: 1, height: 6 },\n    { x: 17, y: 15"));
  for (const marker of [
    'id: "assembly", kind: "workbench", x: 14, y: 11.5',
    'id: "trophies", kind: "display", x: 14, y: 5.5',
    'id: "embedded", kind: "machine", x: 13.5, y: 14.5',
    'id: "lens-calibration", kind: "console", x: 15, y: 15',
    'id: "welcome", kind: "reception", x: 11, y: 9',
    'id: "planning", kind: "console", x: 14, y: 10',
  ]) assert.ok(source.includes(marker), `室内物件未与新美术对齐：${marker}`);
  // Entry (18, 19.4) remains below each central solid object's footprint.
  assert.ok(source.includes('entry: { x: 18, y: 19.4 }'));
  assert.ok(source.includes('entry: { x: 18, y: 21.7 }'), "电控入口必须在工作台前方");
  assert.ok(source.includes('entry: { x: 18, y: 22.1 }'), "视觉入口必须在中央装置前方");
  assert.ok(source.includes('position.y <= exit.y + exit.height - 0.4'),
    "室内出口触发范围要覆盖入口门槛，避免无法返回");
  assert.ok(source.includes('id: "exit", kind: "exit", x: 16, y: 21'));
});

test("六栋建筑正门自动触发进入，横向经过不会误触发", () => {
  for (const place of PLACES) {
    const x = place.x + place.width / 2;
    const bottom = place.y + place.height;
    const outside = { x, y: bottom + 1.4 };
    assert.ok(isWalkable(outside.x, outside.y), `${place.id} 门前需可行走`);
    let position = outside, entered = null;
    for (let i = 0; i < 12; i++) {
      position = movePlayer(position, 0, -1, 0.05);
      entered = outdoorDoorAt(position, -1);
      if (entered) break;
    }
    assert.equal(entered?.id, place.id, `${place.id} 正门应可实际走到`);
    assert.equal(outdoorDoorAt(position, 0), null);
    assert.equal(outdoorDoorAt(position, 1), null);
    assert.equal(outdoorDoorAt({ x: x + 2, y: bottom + 0.5 }, -1), null);
    assert.equal(outdoorDoorAt(outside, -1), null);
  }
});

test("室内出口、可见门槛和户外入口自动构成进出闭环", () => {
  const source = readFileSync(new URL("./pixel-jijia-room.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("export function roomExitAt("));
  assert.ok(source.includes('object.kind === "exit"'));
  assert.ok(source.includes("position.y >= exit.y - 0.55"));
  assert.ok(source.includes("ctx.fillRect(x, y, exit.width * TILE, 7)"));
  assert.ok(source.includes("entry: { x: 18, y: 19.4 }"));
  assert.ok(route.includes("roomExitAt(room, next, y)"));
  assert.ok(route.includes("outdoorDoorAt(next, y)"));
  assert.ok(route.includes("if (room) exitRoom()"));
  assert.ok(route.includes("enterRoom(door.id)"));
  assert.ok(!route.includes("onClick={() => enterRoom(selected.id)}"));
  assert.ok(!route.includes('if (object.kind === "exit") exitRoom()'));
  assert.ok(route.includes("Keep held directions across room changes"));
  assert.ok(route.includes("place.y + place.height + 1.2"));
});

test("六栋室内均增加不同工作站，并在室内保留真实功能链接", () => {
  const source = readFileSync(new URL("./pixel-jijia-room.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  for (const id of ["calibration", "team-photo", "signal-wall",
      "lens-calibration", "journey-map", "field-log"]) {
    assert.ok(source.includes(`id: "${id}"`), `缺少独立互动设备: ${id}`);
  }
  for (const href of ["/events-and-honors", "/join", "/pixel-jijia/battle", "/about"]) {
    assert.ok(source.includes(`href: "${href}"`), `缺少已存在功能入口: ${href}`);
  }
  assert.ok(route.includes("selectedRoom.href && <Link to={selectedRoom.href}"));
  assert.ok(source.includes("if (object.href)"), "可用终端应有可辨认的视觉标识");
});

test("环境粒子使用统一世界坐标与现有动画循环，数量受控", () => {
  const scene = readFileSync(new URL("./pixel-jijia-scene.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  assert.ok(scene.includes("export function renderParticles("));
  assert.ok(scene.includes("const offset = snapCamera(camera)"));
  assert.ok(route.includes("const particles: PixelParticle[] = []"));
  assert.ok(route.includes("particles.length < 72"));
  assert.ok(route.includes('window.matchMedia("(prefers-reduced-motion: reduce)")'));
  assert.ok(route.includes("if (reducedMotion.matches || room)"));
  assert.ok(route.includes("cherryTrees.find("));
  assert.ok(route.includes("FOUNTAIN.x * TILE"));
  assert.ok(route.includes("renderParticles(ctx, particles, cameraRef.current)"));
  assert.equal(route.split("requestAnimationFrame(tick)").length - 1, 3,
    "初始化、帧末、切门提前结束都必须调度同一个 tick，不得启动独立粒子循环");
  assert.ok(route.includes("const tick = (time: number) => {"));
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

test("地面纹理由构建系统生成带指纹的资源地址，避免旧图集缓存错位", () => {
  const route = readFileSync(new URL("../routes/pixel-jijia.tsx", import.meta.url), "utf8");
  assert.ok(route.includes('import groundTilesUrl from "../assets/pixel-jijia/ground-tiles.png?url"'));
  assert.ok(route.includes("loadImage(groundTiles, groundTilesUrl)"));
  assert.ok(route.includes("ground.naturalWidth !== 384 || ground.naturalHeight !== 528"));
  assert.ok(!route.includes('loadImage(groundTiles, "/assets/pixel-jijia/ground-tiles.png")'));
});

test("新版地面材质纹理丰富且跨变体边缘连续，过渡贴图透明正确", () => {
  const source = readFileSync(new URL("../../../../scripts/assets/pixel-ground-source.png", import.meta.url));
  assert.deepEqual([...source.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(source.readUInt32BE(16), 512);
  assert.equal(source.readUInt32BE(20), 512);
  const path = new URL("../assets/pixel-jijia/ground-tiles.png", import.meta.url);
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 384); // 3 image-derived variations × 128px
  assert.equal(png.readUInt32BE(20), 528); // 4 materials × 128px + edge sprites
  assert.equal(png[25], 6); // RGBA for transparent transition edges

  const parts = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      parts.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(parts));
  const stride = 384 * 4 + 1;
  const rgba = (x, y) => {
    assert.equal(pixels[y * stride], 0, "需使用零过滤，便于逐像素验证");
    const offset = y * stride + 1 + x * 4;
    return [...pixels.subarray(offset, offset + 4)];
  };

  for (let material = 0; material < 4; material++) {
    const row = material * 128;
    const colors = new Set();
    for (let variant = 0; variant < 3; variant++) {
      const col = variant * 128;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const color = rgba(col + x, row + y);
        assert.equal(color[3], 255, "地面材质不能透出黑边");
        colors.add(color.join(","));
      }
      // Every variation shares exactly the same four outer pixel edges,
      // so different 64px patches never introduce a discontinuous seam.
      for (let i = 0; i < 128; i++) {
        for (const [x, y] of [[0, i], [127, i], [i, 0], [i, 127]]) {
          assert.deepEqual(rgba(col + x, row + y), rgba(x, row + y));
        }
        assert.deepEqual(rgba(col, row + i), rgba(col + 127, row + i));
        assert.deepEqual(rgba(col + i, row), rgba(col + i, row + 127));
      }
    }
    assert.ok(colors.size >= 40, "地面必须包含生成美术中的真实纹理细节");
  }

  for (let edge = 0; edge < 12; edge++) {
    const start = edge * 16;
    const alphas = [];
    for (let y = 512; y < 528; y++) for (let x = start; x < start + 16; x++) {
      alphas.push(rgba(x, y)[3]);
    }
    assert.ok(alphas.some(a => a === 0) && alphas.some(a => a > 0),
      "过渡贴图必须既有透明区域也有真实边缘像素");
  }
});
