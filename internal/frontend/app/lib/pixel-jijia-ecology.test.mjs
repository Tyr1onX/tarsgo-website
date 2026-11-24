import assert from "node:assert/strict";
import test from "node:test";
import { createWildlife,updateWildlife } from "./pixel-jijia-life.ts";
import { equipmentProgress,roomSpriteKey } from "./pixel-jijia-room-art.ts";
import { floatingLeaf,flowerVisit,morningDew } from "./pixel-jijia-scene.ts";
import { changchunClimate } from "./pixel-jijia-climate.ts";
import { PONDS,SPAWN,waterDepthAt,pathIsWalkable } from "./pixel-jijia-world.ts";

test("栖息地地点可达，动物选择多个地点且有真实停留，鱼不离开自己的水域",()=>{
  const animals=createWildlife(),initial=animals.map(a=>({x:a.x,y:a.y}));
  for(const a of animals){
    assert.ok(a.sites.length>1,a.id);
    for(const p of a.sites)assert.ok(a.species==="fish"?waterDepthAt(p.x,p.y)>0:pathIsWalkable(a.home,p,true),a.id);
  }
  const visited=animals.map(()=>new Set()),paused=animals.map(()=>false);
  for(let tick=0;tick<3600;tick++){
    updateWildlife(animals,SPAWN,1/60,12,"clear",true,null,false);
    if(tick%30===0)for(let i=0;i<animals.length;i++){
      const a=animals[i];visited[i].add(`${Math.round(a.x*2)},${Math.round(a.y*2)}`);
      paused[i] ||= a.speed===0&&Math.hypot(a.x-initial[i].x,a.y-initial[i].y)>.1;
      if(a.species==="fish"){
        const pond=PONDS.find(p=>a.home.x>=p.x&&a.home.x<p.x+p.width&&a.home.y>=p.y&&a.home.y<p.y+p.height);
        assert.ok(pond&&a.x>=pond.x&&a.x<pond.x+pond.width&&a.y>=pond.y&&a.y<pond.y+pond.height&&waterDepthAt(a.x,a.y)>0);
      }else assert.ok(pathIsWalkable(a.home,a,true),a.id);
    }
  }
  assert.ok(visited.every(s=>s.size>=3));
  assert.ok(paused.every(Boolean));
});

test("鸟比松鼠更早开始活动，静止观察者不让动物持续受惊",()=>{
  const animals=createWildlife();
  updateWildlife(animals,SPAWN,.05,6,"clear",true,null,false);
  assert.ok(animals.filter(a=>a.species==="sparrow").every(a=>a.behavior==="active"));
  assert.ok(animals.filter(a=>a.species==="squirrel").every(a=>a.behavior==="rest"));
  const bird=animals.find(a=>a.species==="sparrow");
  const player={x:bird.x+.5,y:bird.y};
  updateWildlife([bird],player,.05,12,"clear",true,null,true);
  assert.equal(bird.behavior,"alert");
  for(let i=0;i<180;i++)updateWildlife([bird],player,1/60,12,"clear",true,null,false);
  assert.equal(bird.behavior,"active");
  updateWildlife([bird],{x:bird.x+.2,y:bird.y},.05,12,"clear",true,null,true);
  assert.equal(bird.behavior,"alert");
  updateWildlife([bird],player,.05,12,"rain",true,null,false);
  assert.equal(bird.behavior,"shelter");
});

test("水面漂浮物全程留在水域、花间访客有长静默区间，清晨露水随时间消退",()=>{
  for(const pond of PONDS)for(let i=0;i<3;i++)for(let t=0;t<3600000;t+=1739){
    const leaf=floatingLeaf(pond,i,t,24*Math.sin(t/60000));
    assert.ok(waterDepthAt(leaf.x,leaf.y)>0);
  }
  for(const seed of [0,117,80078]){
    const states=Array.from({length:90},(_,i)=>flowerVisit(seed,i*1000));
    assert.ok(states.some(x=>x!==null)&&states.filter(x=>x===null).length>60);
  }
  const dawn={hour:6,minute:0,temperature:12,weather:"clear",sunHeight:.1,sunX:.8};
  assert.ok(morningDew(dawn)>.5);
  assert.equal(morningDew({...dawn,hour:12}),0);
  assert.equal(morningDew({...dawn,temperature:-2}),0);
  assert.equal(morningDew({...dawn,weather:"rain"}),0);
});

test("深夜自动机械停机，明确交互仍可完成一个周期，服务器保持运行节奏",()=>{
  for(const hour of [0,1,4,23,23.5]){
    assert.equal(equipmentProgress("machine",2000,undefined,hour),-1);
    assert.equal(equipmentProgress("test-robot",2000,1000,hour),1000/5700);
    assert.equal(equipmentProgress("test-robot",8000,1000,hour),-1);
    assert.ok(Array.from({length:30},(_,i)=>equipmentProgress("compute",i*1000,undefined,hour)).some(x=>x>=0));
  }
  assert.equal(equipmentProgress("screen",2000,undefined,12),-1);
  assert.equal(roomSpriteKey({id:"decor-0",kind:"server",decorative:true}),"decor-server");
});

test("完整游戏日的1440分钟太阳位置和作息判定覆盖所有时段",()=>{
  const start=Date.UTC(2026,6,14);
  const minutes=new Set(),nightHours=new Set();
  for(let i=0;i<1440;i++){
    const c=changchunClimate(new Date(start+i*1000),"game");
    minutes.add(c.hour*60+c.minute);
    if(c.night>.2)nightHours.add(c.hour);
    assert.ok(Number.isFinite(c.sunX)&&Number.isFinite(c.sunY)&&Number.isFinite(c.sunHeight));
    assert.ok(c.night>=0&&c.night<=.42);
  }
  assert.equal(minutes.size,1440);assert.ok(nightHours.has(0)&&nightHours.has(23));
});
