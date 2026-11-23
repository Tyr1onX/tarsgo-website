import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("research room shares one indoor rendering and movement pipeline", () => {
  const room = source("./pixel-jijia-room.ts");
  const study = source("./pixel-jijia-study.ts");
  const route = source("../routes/pixel-jijia.tsx");
  assert.ok(room.includes('id: "study"'));
  assert.ok(room.includes("study: STUDY_ROOM"));
  assert.ok(study.includes("STUDY_ROOM.objects"));
  assert.ok(study.includes("makeStudyRoom(items"));
  assert.ok(study.includes("canPlaceStudy("));
  assert.ok(route.includes('roomId === "study"'));
  assert.ok(route.includes("renderRoomScene(ctx, roomTerrain, room"));
  assert.ok(route.includes("movePlayer(previous, x, y, dt, sprinting"));
  assert.ok(route.includes("isRoomWalkable(room, px, py)"));
});

test("furniture catalog and sizes match the canonical server contract", () => {
  const study = source("./pixel-jijia-study.ts");
  const api = source("../../../backend/handler/pixel_home.go");
  for (const kind of ["desk", "chair", "shelf", "lamp", "plant"]) {
    assert.ok(study.includes(kind));
    assert.ok(api.includes('"' + kind + '"'));
  }
  assert.ok(study.includes('width: 3, height: 2'));
  assert.ok(study.includes('width: 2, height: 1'));
  assert.ok(study.includes('items.length >= 24'));
});

test("owner edits existing API; guest visits render without editing controls", () => {
  const route = source("../routes/pixel-jijia.tsx");
  const router = source("../../../backend/router/router.go");
  assert.ok(route.includes('/api/pixel-home/me'));
  assert.ok(route.includes('/api/pixel-home/visit?token='));
  assert.ok(route.includes('/api/pixel-home/invite'));
  assert.ok(router.includes('homeAPI.Use(middleware.RequireAuthenticated(authService))'));
  assert.ok(router.includes('homeAPI.PUT("/me", requireSameOriginRequest(cfg), pixelHomeHandler.Save)'));
  assert.ok(route.includes('room?.id === "study" && !studyGuest'));
  assert.ok(route.includes('room?.id === "study" && studyGuest'));
  assert.ok(route.includes('studyHasInvite'));
  assert.ok(route.includes('revokeStudyInvite'));
});
