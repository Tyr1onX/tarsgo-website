import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = name => readFileSync(new URL(name, import.meta.url), "utf8");

test("personal study reuses one indoor renderer, movement and collision pipeline", () => {
 const room = file("./pixel-jijia-room.ts");
 const study = file("./pixel-jijia-study.ts");
 const route = file("../routes/pixel-jijia.tsx");
 assert.ok(room.includes('id: "study"'));
 assert.ok(room.includes('study: STUDY_ROOM'));
 assert.ok(study.includes("makeStudyRoom(items"));
 assert.ok(study.includes("STUDY_ROOM.objects"));
 assert.ok(study.includes("canPlaceStudy("));
 assert.ok(route.includes('roomId === "study"'));
 assert.ok(route.includes("renderRoomScene(ctx, roomTerrain, room"));
 assert.ok(route.includes("movePlayer(previous, x, y, dt, sprinting"));
 assert.ok(route.includes("isRoomWalkable(room, px, py)"));
 assert.ok(!route.includes("localStorage.setItem("));
});

test("study saving is authenticated; invited visitors never receive editing controls", () => {
 const route = file("../routes/pixel-jijia.tsx");
 const router = file("../../../backend/router/router.go");
 assert.ok(router.includes('studyAPI.Use(middleware.RequireAuthenticated(authService), requireSameOriginRequest(cfg))'));
 assert.ok(router.includes('studyAPI.PUT("", studyHandler.Save)'));
 assert.ok(router.includes('api.GET("/pixel-jijia/study/visit/:token", studyHandler.Visit)'));
 assert.ok(route.includes('room?.id === "study" && !studyGuest'));
 assert.ok(route.includes('room?.id === "study" && studyGuest'));
 assert.ok(route.includes("setStudyRevision(result.revision)"));
 assert.ok(route.includes("studyHasInvite"));
 assert.ok(route.includes("revokeStudyInvite"));
});
