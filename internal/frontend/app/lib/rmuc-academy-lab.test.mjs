import assert from "node:assert/strict";
import {test} from "node:test";
import {LAB_CASES,LAB_TOPICS,buildLabTrace,labProgressId,relatedLabs} from "./rmuc-academy-lab.ts";
import {KNOWLEDGE} from "./rmuc-academy.ts";
const val=(f,label)=>f.metrics.find(m=>m.label===label)?.value;
const end=(t,label)=>val(t.frames.at(-1),label);
const ever=(t,label,value)=>t.frames.some(f=>val(f,label)===value);
const peak=(t,label)=>Math.max(...t.frames.map(f=>Number(val(f,label))));
const event=(t,type)=>t.events.find(e=>e.type===type);
const traces=new Map(LAB_CASES.map(c=>[c.id,buildLabTrace(c)]));
const expected={
 "territory-capture":["蓝方前哨阵地","蓝方完全控制"],"territory-contest":["占领 / 恢复进度",2],"territory-interrupt":["占领 / 恢复进度",0],"territory-rebuild":["蓝方前哨血量",500],
 "base-protected":["蓝方基地血量",10000],"base-cover":["护甲展开","是"],"fortress-disabled":["可用储备弹量",0],"fortress-enabled":["可用储备弹量",433],
 "heal-supply":["红方步兵血量",200],"heal-low-base":["红方步兵血量",175],"heal-late":["红方步兵血量",200],"heal-outpost":["红方步兵血量",150],"heal-remote":["红方步兵血量",160],"heal-denied":["红方步兵血量",40],"heal-forfeit":["红方步兵血量",0],
 "revive-read":["步兵血量",20],"revive-fast":["步兵血量",20],"revive-paid":["步兵血量",200],
 "heat-lock":["锁定","未锁定"],"power-normal":["缓冲能量",60],"power-over":["断电剩余",0],
 "economy-local":["允许发弹量",10],"economy-remote":["允许发弹量",100],"xp-cap":["步兵经验",2200],"xp-unlocked":["步兵经验",2204],
 "tech-1-first":["科技等级",1],"tech-2-first":["科技等级",2],"tech-3-first":["科技等级",3],"tech-4-first":["科技等级",4],"tech-1-repeat":["每10秒金币收益",44],"tech-2-early":["科技等级",1],"tech-3-missing":["科技等级",0],"tech-1-cancel":["失败原因","离开装配区超时"],"tech-4-timeout":["失败原因","双核心步骤超时"],"launcher-state":["使用权状态","已就绪"],
 "rune-small":["增益剩余",0],"rune-timeout":["增益剩余",0],"rune-large":["增益剩余",0],"rune-large-low":["增益剩余",0],
 "armor-nine":["已选择强化区域","否"],"armor-ready":["已选择强化区域","是"],
 "sentry-switch":["金币",700],"sentry-semi":["金币",800],"sentry-enhanced":["防御强化剩余额度",0],
 "terrain-road":["经验",300],"terrain-reverse":["经验",0],"terrain-highland":["防御增益",25],"terrain-over":["防御增益",25],"terrain-through":["冷却倍率",1.5],
 "radar-accurate":["标记进度 P",36],"radar-error":["标记进度 P",0],"dart-window":["闸门状态","已关闭"],
 "outcome-control":["结算","红方胜"],"outcome-damage":["结算","红方胜"],"outcome-hp":["结算","红方胜"],"outcome-draw":["结算","平局"],
};
test("all rule cases have unique persisted IDs, citations, valid questions and explicit expected outcome",()=>{
 assert.equal(new Set(LAB_CASES.map(c=>c.id)).size,LAB_CASES.length);
 assert.equal(Object.keys(expected).length,LAB_CASES.length);
 assert.ok(LAB_TOPICS.every(t=>t.cases.length));
 for(const c of LAB_CASES){assert.ok(labProgressId(c).length<=32);assert.ok(KNOWLEDGE[c.knowledge].reference);assert.ok(c.limits);assert.ok(c.question.options[c.question.answer]);assert.ok(relatedLabs(c.knowledge).includes(c));}
});
for(const c of LAB_CASES)test("referee trace: "+c.id,()=>{
 const t=traces.get(c.id);
 assert.deepEqual(buildLabTrace(c),t,"independent replay must be identical");
 const [label,value]=expected[c.id];assert.equal(end(t,label),value);
 assert.ok(t.frames.length>1);
 for(let i=0;i<t.frames.length;i++){
  const f=t.frames[i];assert.ok(Number.isFinite(f.time));if(i)assert.ok(f.time>t.frames[i-1].time);
  for(const m of f.metrics)if(typeof m.value==="number")assert.ok(Number.isFinite(m.value),m.label);
  assert.ok(f.eventCount<=t.events.length&&f.inputCount<=t.inputs.length);
 }
});
test("territory freezes, regresses, restores, and rebuilds through referee events",()=>{
 const c=traces.get("territory-capture");assert.deepEqual(c.events.filter(e=>e.type==="territory").map(e=>[e.team,e.full]),[["red",false],["blue",true]]);
 const contest=traces.get("territory-contest");assert.ok(contest.frames.filter(f=>val(f,"双方争夺")==="是").every(f=>val(f,"占领 / 恢复进度")===2));
 const interrupted=traces.get("territory-interrupt");assert.ok(peak(interrupted,"占领 / 恢复进度")>0);assert.equal(end(interrupted,"占领 / 恢复进度"),0);
 assert.equal(event(traces.get("territory-rebuild"),"outpost-rebuilt").hp,500);
 assert.ok(event(traces.get("base-cover"),"cover-opening"));assert.ok(event(traces.get("base-cover"),"cover-open"));
});
test("healing differences, deferred payment, death and revival",()=>{
 assert.equal(event(traces.get("heal-supply"),"heal").amount,2);
 assert.equal(event(traces.get("heal-late"),"heal").amount,5);
 const remote=traces.get("heal-remote");assert.ok(ever(remote,"远程兑换等待",5.9));assert.equal(remote.events.find(e=>e.status==="completed").amount,120);
 assert.equal(traces.get("heal-denied").inputs[0].accepted,false);
 const death=traces.get("heal-forfeit");assert.ok(event(death,"robot-dead"));assert.ok(!death.events.some(e=>e.type==="heal"&&e.status==="completed"));assert.equal(end(death,"金币"),743);
 assert.ok(event(traces.get("revive-fast"),"robot-revived").at<event(traces.get("revive-read"),"robot-revived").at);
 for(const id of ["revive-read","revive-paid"]){const t=traces.get(id);assert.ok(ever(t,"虚弱","是"));assert.ok(ever(t,"免疫","是"));assert.equal(end(t,"免疫"),"否");}
});
test("heat lock, buffer exhaustion, and deferred economy transitions",()=>{
 const heat=traces.get("heat-lock");assert.ok(ever(heat,"锁定","冷却锁定"));assert.ok(heat.inputs.some(e=>e.accepted===false));assert.equal(end(heat,"热量"),0);
 assert.ok(!event(traces.get("power-normal"),"power-off"));const power=traces.get("power-over");assert.ok(event(power,"power-off"));assert.equal(peak(power,"断电剩余"),5);assert.equal(end(power,"缓冲能量"),60);
 const ammo=traces.get("economy-remote");assert.ok(ever(ammo,"待到账",5.9));assert.equal(end(ammo,"金币"),650);assert.equal(end(traces.get("economy-local"),"金币"),790);
 assert.equal(end(traces.get("xp-unlocked"),"步兵等级上限"),7);
});
test("assembly prerequisites, completion steps, periodic income and interruptions",()=>{
 for(const [level,steps,income,defense] of [[1,2,40,0],[2,3,60,0],[3,5,80,25],[4,10,120,50]]){
  const t=traces.get("tech-"+level+"-first");const e=event(t,"assembly-end");assert.equal(e.completed,steps);assert.equal(e.technology,level);assert.equal(end(t,"每10秒金币收益"),income);assert.equal(end(t,"团队防御增益"),defense);
 }
 for(const id of ["tech-2-early","tech-3-missing"])assert.equal(traces.get(id).inputs[0].accepted,false);
 for(const id of ["tech-1-cancel","tech-4-timeout"])assert.ok(event(traces.get(id),"assembly-end").reason);
 const launcher=traces.get("launcher-state");for(const type of ["launcher-unlocked","launcher-installed","launcher-ready"])assert.ok(event(launcher,type));
});
test("rune success and expiry, armor eligibility, sentry cooldown and enhancement",()=>{
 assert.equal(event(traces.get("rune-small"),"rune-success").defense,.25);
 assert.ok(event(traces.get("rune-timeout"),"rune-failed"));
 assert.equal(event(traces.get("rune-large"),"rune-success").cooling,5);
 assert.equal(event(traces.get("rune-large-low"),"rune-success").cooling,1);
 assert.deepEqual(traces.get("armor-nine").inputs.map(e=>e.accepted),[false,false]);
 assert.deepEqual(traces.get("armor-ready").inputs.map(e=>e.accepted),[false,true]);
 assert.deepEqual(traces.get("sentry-switch").inputs.map(e=>e.accepted),[true,false,true]);
 assert.ok(ever(traces.get("sentry-enhanced"),"强化","是"));
 assert.equal(end(traces.get("sentry-enhanced"),"强化"),"否");
});
test("crossing order, radar decay, dart window and result are live state transitions",()=>{
 assert.ok(ever(traces.get("terrain-road"),"防御增益",25));assert.equal(end(traces.get("terrain-reverse"),"经验"),0);
 const radar=traces.get("radar-accurate");assert.equal(peak(radar,"标记进度 P"),120);assert.ok(peak(radar,"易伤")>0);assert.equal(end(radar,"易伤"),0);
 const dart=traces.get("dart-window");assert.ok(ever(dart,"裁判窗口许可","是"));assert.ok(ever(dart,"闸门状态","开启中"));assert.equal(end(dart,"裁判窗口许可"),"否");
 for(const id of ["outcome-control","outcome-damage","outcome-hp","outcome-draw"])assert.ok(event(traces.get(id),"match-end"));
});
