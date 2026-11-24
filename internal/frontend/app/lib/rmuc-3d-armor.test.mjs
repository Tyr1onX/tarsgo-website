import assert from "node:assert/strict";
import {test} from "node:test";
import {createMatch,startMatch,updateMatch,purchaseAmmo,fireRound,damageTarget,armorStatus,armorAccuracy,armorFraction,fortifyArmor,recommendedArmorCenter,reviveRobot,revivalStatus} from "./rmuc-3d-match.ts";
const roster=[{id:"r",team:"red",heavy:false,maxHp:200},{id:"b",team:"blue",heavy:false,maxHp:200},{id:"rh",team:"red",heavy:true,maxHp:400},{id:"bh",team:"blue",heavy:true,maxHp:400}];
const point=(x=.06,y=.05)=>({x,y,area:.12*.1});
const positions=new Map([["rh",{x:12,y:.13,z:-6.4}],["bh",{x:-12,y:.13,z:6.4}]]);
function fixture(){
 const m=createMatch(roster,1,1);startMatch(m);
 const locations=new Map(positions);const advance=dt=>updateMatch(m,dt,locations);
 const shoot=(i,target,hit)=>{const r=fireRound(m,roster[i].id);assert.ok(r);const d=target?damageTarget(m,r,target,hit):0;advance(1);return d;};
 assert.ok(purchaseAmmo(m,"r"));assert.ok(purchaseAmmo(m,"b"));advance(6);
 return {m,advance,shoot,locations};
}
test("cumulative 10 hits, minute boundary, median of even samples, miss and rune denominator, invulnerability",()=>{
 const {m,advance,shoot}=fixture();
 for(let i=0;i<9;i++)assert.equal(shoot(0,{type:"robot",id:"bh"},point(i%2?.04:.08)),0);
 assert.equal(armorStatus(m,"red").hits,9);assert.equal(fortifyArmor(m,"red",{x:.06,y:.05}),false);
 assert.equal(shoot(0,{type:"robot",id:"bh"},point(.04)),0);
 assert.equal(m.robots[3].hp,400);
 assert.ok(Math.abs(armorAccuracy(m,"red")-50)<1e-8);
 shoot(0,undefined);shoot(0,{type:"rune",team:"red",arm:0,ring:10},point());
 assert.equal(m.sides.red.armor.shots,12);assert.equal(armorStatus(m,"red").hits,10);
 assert.ok(Math.abs(armorAccuracy(m,"red")-(10/12/.02))<1e-8);
 advance(59.9-m.elapsed);assert.equal(fortifyArmor(m,"red",point()),false);
 advance(.1);assert.ok(fortifyArmor(m,"red",point()));assert.equal(fortifyArmor(m,"red",point()),false);
 advance(120-m.elapsed);assert.ok(fortifyArmor(m,"red",{x:0,y:0}));
 assert.deepEqual(armorStatus(m,"red").center,{x:0,y:0});
 assert.equal(armorStatus(createMatch(roster),"red").center,null);
});
test("relative accuracy area, both multipliers and real defense multiply, no friendly or dart count",()=>{
 const {m,advance,shoot,locations}=fixture();
 for(let i=0;i<10;i++){
   assert.equal(shoot(0,{type:"robot",id:"bh"},point(i%2?.04:.08)),0);
   assert.equal(shoot(1,{type:"robot",id:"rh"},point(i%2?.04:.08)),0);
 }
 assert.ok(Math.abs(armorFraction(m,"red")-1/3)<1e-8);
 assert.deepEqual(recommendedArmorCenter(m,"red"),{x:.06,y:.05});
 advance(60-m.elapsed);
 assert.ok(fortifyArmor(m,"blue",point()));
 assert.equal(shoot(0,{type:"robot",id:"b"},point()),10);
 assert.equal(shoot(0,{type:"robot",id:"b"},point(0,0)),30);
 assert.equal(shoot(0,{type:"robot",id:"bh"},point()),0);
 assert.equal(armorStatus(m,"blue").lastHit,"reinforced");
 locations.set("bh",{x:4,y:.5,z:4});advance(2.1);
 assert.equal(shoot(0,{type:"robot",id:"bh"},point()),5); // early heavy 50% defense * 0.5
 assert.equal(shoot(0,{type:"robot",id:"bh"},point(0,0)),15);
 const count=m.sides.red.armor.hits.length;
 shoot(0,{type:"robot",id:"rh"},point());assert.equal(m.sides.red.armor.hits.length,count);
 assert.equal(shoot(0,{type:"outpost",team:"blue"},point()),10);
 assert.equal(shoot(0,{type:"base",team:"blue"},point()),0);
 assert.equal(m.sides.red.armor.hits.length,count+2); // protected base still records real hit
});
