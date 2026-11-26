import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {STUDY_CATALOG,canPlaceStudy,makeStudyRoom,furnitureID,displaySlots,displayAccepts} from "./pixel-jijia-study.ts";
import {roomObjectAt,roomInteractable,isRoomWalkable} from "./pixel-jijia-room.ts";
import {worldItems} from "./pixel-jijia-items.ts";

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
  const panel = route.slice(route.indexOf('room?.id === "study" && <div className="pixel-world-study-panel"'), route.indexOf('{studyNotice &&'));
  assert.ok(panel.startsWith('room?.id === "study"'));
  assert.ok(panel.includes('{!studyGuest && <div className="pixel-world-study-tools"'));
  assert.ok(panel.includes('{studyGuest && <div className="pixel-world-study-guest"'));
  assert.ok(panel.includes('{!studyGuest&&<button type="button" disabled={studySaving} aria-pressed={item.displayed}'));
  assert.ok(route.includes('studyHasInvite'));
  assert.ok(route.includes('revokeStudyInvite'));
});

test("stable legacy and new display ids survive furniture movement; actual room objects are interactive",()=>{
 const old={kind:"desk",x:4,y:8},id=furnitureID(old);
 const moved={...old,id,x:7,y:9};
 assert.equal(furnitureID(moved),id);
 const tank={kind:"aquarium-large",id:"tank-1",x:10,y:11};
 assert.ok(canPlaceStudy([moved],tank));
 assert.ok(!canPlaceStudy([moved],{...tank,x:8,y:9}));
 assert.ok(!canPlaceStudy([],{...tank,x:17,y:18}));
 const room=makeStudyRoom([moved,tank],false);
 assert.equal(roomObjectAt(room,{x:11,y:11}).id,"tank-1");
 assert.ok(roomInteractable(room,room.objects.find(o=>o.id==="tank-1")));
 assert.ok(!isRoomWalkable(room,11.5,11.5));
 assert.ok(isRoomWalkable(room,18,19.4));
 for(const kind of ["aquarium-small","aquarium-large","cabinet","pedestal","table-display","pet-bed"])assert.ok(STUDY_CATALOG[kind]);
 assert.equal(displaySlots("aquarium-large"),5);
 assert.ok(displayAccepts("aquarium-small",worldItems.get("crucian")));
 assert.ok(!displayAccepts("cabinet",worldItems.get("crucian")));
 assert.ok(displayAccepts("pedestal",worldItems.get("robot-model")));
 assert.ok(!displayAccepts("desk",worldItems.get("cat-food")));
});
