import test from "node:test";
import assert from "node:assert/strict";
import {createRadar,submitRadarPosition,radarPosition,radarVulnerability,advanceRadar,radarOpportunities,activateRadarDouble,resetRadarDelta,verifiedRadarDecode} from "./rmuc-3d-radar.ts";
const robots=[{id:"r",team:"red",hp:200},{id:"b",team:"blue",hp:200},{id:"b2",team:"blue",hp:200}];
const p={x:0,z:0};
const send=(radar,team,id,n,from=0,reported=p)=>{for(let i=1;i<=n;i++)submitRadarPosition(radar,team,id,reported,p,from+i/5);};
test("official §5.7.4 worked example including interruption and recovery",()=>{
  const r=createRadar(robots),t=r.red.tracks.b;
  send(r,"red","b",5);assert.equal(t.progress,15);
  send(r,"red","b",10,1);assert.equal(t.progress,120);
  send(r,"red","b",5,3,{x:2,z:0});assert.ok(Math.abs(t.progress-108)<1e-8);
  advanceRadar(r,robots,4,5);assert.ok(Math.abs(t.progress-97.6)<1e-8);
  send(r,"red","b",2,5);assert.ok(Math.abs(t.progress-100.6)<1e-8);
});
test("error bounds, localization threshold, no hidden ground truth fallback",()=>{
  const r=createRadar(robots),truth={x:5,z:1};
  assert.equal(radarPosition(r,"red",robots[1],truth),null);
  submitRadarPosition(r,"red","b",{x:.8,z:0},p,.2);assert.equal(r.red.tracks.b.progress,.5);
  submitRadarPosition(r,"red","b",{x:1.6,z:0},p,.4);assert.equal(r.red.tracks.b.progress,0);
  send(r,"red","b",13,.4);assert.equal(r.red.tracks.b.progress,91);
  assert.deepEqual(radarPosition(r,"red",robots[1],truth).point,p);
  assert.equal(radarVulnerability(r,"red",robots[1],3.1),0);
  send(r,"red","b",1,3);assert.equal(r.red.tracks.b.progress,105);
  assert.deepEqual(radarPosition(r,"red",robots[1],truth).point,truth);
  assert.equal(radarVulnerability(r,"red",robots[1],3.2),.15);
  send(r,"red","r",10);assert.equal(r.red.tracks.r.progress,55);
  assert.deepEqual(radarPosition(r,"red",robots[0],truth).point,truth);
  assert.equal(radarVulnerability(r,"red",robots[0],3.2),0);
});
test("union vulnerability time, bounded opportunities, revival, interference",()=>{
  const r=createRadar(robots);
  for(let i=1;i<=650;i++){
    const time=i/5;advanceRadar(r,robots,(i-1)/5,time);
    submitRadarPosition(r,"red","b",p,p,time);submitRadarPosition(r,"red","b2",p,p,time);
  }
  assert.equal(r.red.vulnerableSeconds,120);assert.equal(radarOpportunities(r.red),2);
  assert.equal(activateRadarDouble(r,"red",130),true);
  assert.equal(radarVulnerability(r,"red",robots[1],130),.4);
  assert.equal(activateRadarDouble(r,"red",140),false);
  assert.equal(radarVulnerability(r,"red",robots[1],160),.2);
  assert.equal(activateRadarDouble(r,"red",160),true);assert.equal(radarOpportunities(r.red),0);
  const before=r.red.tracks.b.progress;resetRadarDelta(r,"b");assert.equal(r.red.tracks.b.progress,before);assert.equal(r.red.tracks.b.delta,0);
  assert.equal(verifiedRadarDecode(r,"blue"),true);
  assert.equal(radarVulnerability(r,"red",robots[1],170),0);
  assert.equal(verifiedRadarDecode(r,"red"),true);
  assert.equal(radarVulnerability(r,"red",robots[1],170),.4);
});

import {createMatch,startMatch,updateMatch,damageTarget,reviveRobot} from "./rmuc-3d-match.ts";
test("radar vulnerability enters the existing damage referee; revival resets delta and round reset clears tracks",()=>{
 const m=createMatch(robots.map(r=>({...r,maxHp:r.hp,heavy:false})),1,1);startMatch(m);
 const target={type:"robot",id:"b"};
 for(let i=1;i<=15;i++){updateMatch(m,.2);submitRadarPosition(m.radar,"red","b",p,p,m.elapsed);}
 assert.equal(m.radar.red.tracks.b.progress,120);
 assert.equal(damageTarget(m,m.robots[0],target),24);
 verifiedRadarDecode(m.radar,"blue");
 assert.equal(damageTarget(m,m.robots[0],target),20);
 m.robots[1].hp=0;m.robots[1].revival={state:"dead",progressTicks:10000,required:1};
 const before=m.radar.red.tracks.b.progress;
 assert.equal(reviveRobot(m,"b",true),true);
 assert.equal(m.radar.red.tracks.b.progress,before);
 assert.equal(m.radar.red.tracks.b.delta,0);
 assert.equal(createMatch(robots.map(r=>({...r,maxHp:r.hp,heavy:false}))).radar.red.tracks.b.progress,0);
});

test("same-tick referee report beats a data-loss deadline and coordinates come from authoritative positions",()=>{
 const m=createMatch(robots.map(r=>({...r,maxHp:r.hp,heavy:false})),1,1);startMatch(m);
 const positions=new Map([["b",{x:0,y:0,z:0}]]);
 updateMatch(m,.5,positions,()=>[{team:"red",id:"b",point:p}]);
 assert.equal(m.radar.red.tracks.b.progress,1);
 updateMatch(m,.5,positions,()=>[{team:"red",id:"b",point:p}]);
 assert.equal(m.radar.red.tracks.b.progress,3);
 updateMatch(m,.5,positions,()=>[{team:"red",id:"b",point:{x:2,z:0}}]);
 assert.equal(m.radar.red.tracks.b.progress,2.2);
});
