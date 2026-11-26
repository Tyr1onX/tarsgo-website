import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {ITEM_SOURCES,availableSources,closestItemSource,worldItems} from "./pixel-jijia-items.ts";
import {SCENERY,groundAt,isWalkable,PLACES,TRAINING_FIELD} from "./pixel-jijia-world.ts";
import {freshLoans,lifeObjects,outdoorPlacement,studyPlacement,plantStage,placementClear,plantPoint,lifeBlocks,plantCarrySprite} from "./pixel-jijia-nature.ts";

test("自然采集点唯一且位于实际可通行地面，秋季落叶增多",()=>{
 const keys=new Set();
 for(const point of ITEM_SOURCES){
  assert.ok(isWalkable(point.x,point.y)&&groundAt(point.x,point.y)!==3,point.key);
  assert.ok(!keys.has(point.key));keys.add(point.key);
  assert.ok(worldItems.get(point.id).gather>0);
 }
 const count=season=>availableSources(season,new Map(),0).filter(p=>p.id==="leaf").length;
 assert.ok(count("autumn")>count("summer"));
 for(const id of ["pinecone","pine-nut"]){
  const p=ITEM_SOURCES.find(p=>p.id===id);
  assert.ok(SCENERY.some(t=>t.sprite==="pine"&&Math.hypot(t.x-p.x,t.y-p.y)<3));
 }
 const p=ITEM_SOURCES.find(p=>p.id==="daisy-seed"), taken=new Map([[p.key,12000]]);
 assert.ok(!availableSources("summer",taken,1).some(s=>s.key===p.key));
 assert.ok(availableSources("summer",taken,12000).some(s=>s.key===p.key));
 assert.equal(closestItemSource(p,"summer",new Map(),0)?.key,p.key);
});
test("临时物件不属于账号库存且一次只能处于地面或手中",()=>{
 const loans=freshLoans("outdoor"),pot=loans.find(x=>x.itemId==="flowerpot");
 assert.ok(loans.every(x=>outdoorPlacement(x)));
 assert.ok(loans.every(x=>!worldItems.get(x.itemId).gather&&!worldItems.get(x.itemId).ponds.length));
 const held={item:worldItems.get(pot.itemId),loan:pot};
 assert.ok(!lifeObjects(loans.filter(x=>x!==pot),[],held).some(o=>o.value.key===pot.key));
 assert.ok(freshLoans("outdoor").some(x=>x.key===pot.key&&x.x===pot.x&&x.y===pot.y));
 assert.ok(!freshLoans("mechanical").length);
 assert.ok(lifeBlocks(lifeObjects(loans,[],null),pot.x,pot.y));
 const mat=loans.find(x=>x.itemId==="picnic-mat");assert.ok(!lifeBlocks(lifeObjects(loans,[],null),mat.x,mat.y));
});
test("种植位置排除道路、建筑、训练区、入口和占用物件",()=>{
 assert.ok(outdoorPlacement({x:60.5,y:62.5}));
 assert.ok(!outdoorPlacement({x:69.5,y:64.5}));
 assert.ok(!outdoorPlacement({x:TRAINING_FIELD.x+3,y:TRAINING_FIELD.y+3}));
 for(const b of PLACES)assert.ok(!outdoorPlacement({x:b.x+b.width/2,y:b.y+b.height+1}));
 assert.ok(studyPlacement({x:8.5,y:9.5}));
 assert.ok(!studyPlacement({x:18.5,y:18.5}));
 const p=freshLoans("outdoor").find(o=>o.itemId==="flowerpot");
 assert.ok(!placementClear(p,lifeObjects(freshLoans("outdoor"),[],null),{x:p.x,y:p.y+1},outdoorPlacement));
});
test("种子、发芽、生长、开花由一次浇水时间决定且移动不重置",()=>{
 const p={id:"daisy-seed:1",seed:"daisy-seed",x:8,y:9,wateredAt:0,revision:1};
 assert.equal(plantStage(p,50000),0);
 const watered={...p,wateredAt:1000,revision:2};
 assert.equal(plantStage(watered,1000),1);assert.equal(plantStage(watered,13000),2);assert.equal(plantStage(watered,25000),3);
 const moved={...watered,x:10,y:11,revision:3};
 assert.equal(plantStage(moved,25000),3);assert.deepEqual(plantPoint(moved),{x:10.5,y:11.5});
 assert.equal(lifeObjects([], [moved],{item:worldItems.get("flowerpot"),plant:moved}).length,0);
 assert.ok(plantCarrySprite(moved).pixels.length>worldItems.get("flowerpot").pixels.length);
});

test("合法物件放置优先于宠物观察，鼠标与触控共享场景点击",()=>{
 const route=readFileSync(new URL("../routes/pixel-jijia.tsx",import.meta.url),"utf8");
 const click=route.slice(route.indexOf("const handleMapClick"),route.indexOf("const handleTouchDown"));
 assert.ok(click.indexOf("interactLife(nearLife")>=0);
 assert.ok(click.indexOf("placeHeld(placePoint")>click.indexOf("interactLife(nearLife"));
 assert.ok(click.indexOf("placeHeld(placePoint")<click.indexOf("const clickedAnimal"));
 assert.equal(click.match(/placeHeld\(placePoint/g)?.length,1);
});
