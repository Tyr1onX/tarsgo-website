import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMMUNITY_ROOM_OBJECTS, COMMUNITY_POSES, communityDiscoveryId, communitySourceHref } from "./pixel-jijia-community.ts";
import { ROOMS, closestRoomObject, isRoomWalkable } from "./pixel-jijia-room.ts";

const entries = Object.values(COMMUNITY_ROOM_OBJECTS).flat();
test("20 件共建实体使用稳定发现标识，覆盖已确认的 24 条原始回复", () => {
  assert.equal(entries.length, 20);
  assert.equal(new Set(entries.map(communityDiscoveryId)).size, entries.length);
  const ids = new Set(entries.flatMap(object => object.community.sources.map(s => s.comment)));
  assert.deepEqual([...ids].sort((a,b)=>a-b), [38,41,42,43,44,45,48,49,50,51,53,56,57,58,59,61,62,63,64,66,67,69,70,71]);
  assert.deepEqual(entries.find(o=>o.id==="burger").community.sources.map(s=>[s.comment,s.role]), [[42,"suggestion"],[56,"support"],[61,"support"]]);
  assert.deepEqual(entries.find(o=>o.id==="test-robot").community.sources.map(s=>[s.comment,s.role]), [[48,"suggestion"],[71,"suggestion"]]);
  assert.deepEqual(entries.find(o=>o.id==="burnt-stm32").community.sources.map(s=>[s.comment,s.role]), [[38,"suggestion"],[66,"reply"],[67,"reply"]]);
  for (const source of entries.flatMap(o=>o.community.sources)) {
    assert.match(source.date, /^2026\.11\.0[2-8]$/);
    assert.equal(communitySourceHref(source), "/dashboard/community/28#community-comment-"+source.comment);
    assert.deepEqual(Object.keys(source).sort(), ["comment","date","role"]);
  }
});
test("每件共建物件有稳定可达交互范围，桌面小物件只复用宿主碰撞",()=>{
  for(const [roomId,objects] of Object.entries(COMMUNITY_ROOM_OBJECTS)){
    const room=ROOMS[roomId];
    for(const o of objects){
      if(o.host){
        assert.equal(o.solid,false);
        assert.ok(room.objects.some(host=>host.id===o.host&&host.solid),o.id);
      }
      let found=false;
      for(let y=0;y<room.height*2&&!found;y++)for(let x=0;x<room.width*2&&!found;x++){
        found=[-.16,0,.16].every(dx=>[-.16,0,.16].every(dy=>isRoomWalkable(room,x/2+dx,y/2+dy)&&closestRoomObject(room,{x:x/2+dx,y:y/2+dy})?.id===o.id));
      }
      assert.ok(found,o.id+" no stable interaction area");
    }
  }
});
test("36 个原生透明区域包含装配部件、实体姿态与两个独立大笑帧",()=>{
  const index=JSON.parse(readFileSync(new URL("../assets/pixel-jijia/room-community-v31.json",import.meta.url),"utf8"));
  const png=readFileSync(new URL("../assets/pixel-jijia/room-community-v31.png",import.meta.url));
  assert.equal(png[25],6);
  assert.equal(Object.keys(index).length,36);
  const regions=Object.values(index);
  for(const [x,y,w,h] of regions){assert.ok(w>8&&h>8&&x+w<=png.readUInt32BE(16)&&y+h<=png.readUInt32BE(20));}
  for(const [i,a] of regions.entries())for(const b of regions.slice(i+1))assert.ok(a[0]+a[2]<=b[0]||b[0]+b[2]<=a[0]||a[1]+a[3]<=b[1]||b[1]+b[3]<=a[1],"sprite bounds overlap");
  for(const [id,poses] of Object.entries(COMMUNITY_POSES)){
    assert.equal(poses.length,id==="chip-poster"||id==="milk-frog"?4:3);
    for(const key of poses)assert.deepEqual(index[key].slice(2),index[id].slice(2));
  }
  for(const key of ["part-armor","part-turret","part-chassis","part-drive"])assert.ok(index[key]);
});
