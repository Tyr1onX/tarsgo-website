import assert from "node:assert/strict";
import {test} from "node:test";
import {createMatch,startMatch,updateMatch,pickupEnergy,energyStatus,assemblyStatus,beginAssembly,assemblyAction,cancelAssembly,technologyLevel,infantryCap,robotLevel,damageTarget,revivalStatus,reviveRobot,launcherStatus,installLauncher,purchaseAmmo,fireRound,coreFrame} from "./rmuc-3d-match.ts";

const roster=[{id:"r",team:"red",heavy:true,maxHp:400},{id:"b",team:"blue",heavy:true,maxHp:400},{id:"ri",team:"red",heavy:false,maxHp:200},{id:"bi",team:"blue",heavy:false,maxHp:200}];
const rack={red:{x:12,y:.13,z:-6.4},blue:{x:-12,y:.13,z:6.4}};
const zone={red:{x:1.05,y:.7,z:1.05},blue:{x:-1.05,y:.7,z:-1.05}};
const outside={x:4,y:.5,z:4};
const sockets={red:{position:{x:.471,y:1.243,z:.069},axis:{x:Math.SQRT1_2,y:0,z:Math.SQRT1_2}},blue:{position:{x:-.475,y:1.243,z:-.073},axis:{x:-Math.SQRT1_2,y:0,z:-Math.SQRT1_2}}};
const spawns=["red","blue"].flatMap(team=>Array.from({length:6},(_,i)=>({id:team+i,team,position:{x:rack[team].x+(team==="red"?1:-1),y:.9,z:rack[team].z+i*.01}})));
function fixture(){
 const m=createMatch(roster,1,1,spawns,sockets);startMatch(m);
 const positions=new Map([["r",rack.red],["b",rack.blue],["ri",outside],["bi",outside]]);
 const robot=team=>m.robots[team==="red"?0:1];
 const advance=dt=>updateMatch(m,dt,positions);
 const at=(team,p)=>{positions.set(robot(team).id,p);advance(.1);};
 const pickup=(team,count=1)=>{at(team,rack[team]);for(let i=0;i<count;i++){const u=energyStatus(m,robot(team),rack[team]).pickup;assert.ok(u);assert.ok(pickupEnergy(m,robot(team).id,rack[team],u));}at(team,zone[team]);};
 const begin=(team,level)=>{pickup(team,level===4?2:1);assert.ok(beginAssembly(m,robot(team).id,zone[team],level));advance(1);};
 const action=(team,core,step,dt=step===5?1:step===6?0:.6)=>{
   const a=assemblyStatus(m,robot(team),zone[team]).actions.find(a=>a.core===core&&a.step===step);
   assert.ok(a,JSON.stringify({team,core,step,t:m.elapsed,status:assemblyStatus(m,robot(team),zone[team])}));
   assert.ok(assemblyAction(m,robot(team).id,zone[team],core,step,a.angle));
   if(dt)advance(dt);
 };
 const complete=(team,level)=>{begin(team,level);for(const step of level===1?[2,6]:level===2?[2,3,6]:[2,3,4,5,6]){action(team,team,step);if(level===4)action(team,team==="red"?"blue":"red",step);}};
 const reachLevel3=team=>{complete(team,1);advance(60-m.elapsed);complete(team,2);advance(120-m.elapsed);complete(team,3);advance(180-m.elapsed);};
 return {m,positions,robot,advance,at,pickup,begin,action,complete,reachLevel3};
}
test("four difficulty rewards: legal steps, 5/7/10 caps, no backdated XP, periodic gold, launcher and defense",()=>{
 const f=fixture(),{m,robot,advance,at,pickup,begin,action,complete}=f,r=robot("red"),ri=m.robots[2],bi=m.robots[3];
 assert.equal(beginAssembly(m,"r",zone.red,1),false);
 pickup("red");
 assert.equal(beginAssembly(m,"ri",zone.red,1),false);
 assert.equal(beginAssembly(m,"r",outside,1),false);
 assert.equal(beginAssembly(m,"r",zone.red,2),false);
 assert.equal(beginAssembly(m,"r",zone.red,1),true);
 assert.equal(assemblyAction(m,"r",zone.red,"red",2),false);
 advance(1);action("red","red",2);
 assert.equal(technologyLevel(m,"red"),0);
 assert.equal(m.energyUnits.filter(u=>u.location.kind==="mounted").length,1);
 action("red","red",6);
 assert.equal(technologyLevel(m,"red"),1);assert.equal(robotLevel(r,m),5);assert.equal(r.maxHp,450);assert.equal(infantryCap(m,"red"),5);
 assert.equal(assemblyAction(m,"r",zone.red,"red",6),false);
 assert.equal(m.energyUnits.filter(u=>u.location.kind==="spent").length,1);
 const coins=m.sides.red.coins;advance(9.9);assert.equal(m.sides.red.coins,coins);advance(.1);assert.equal(m.sides.red.coins,coins+40);
 // XP from actual damage events stops at the cap.
 for(let i=0;i<50;i++)damageTarget(m,ri,{type:"outpost",team:"blue"});
 for(let i=0;i<10;i++)damageTarget(m,ri,{type:"robot",id:"bi"});
 assert.equal(ri.xp,2200);assert.equal(robotLevel(ri),5);
 advance(60-m.elapsed);complete("red",2);
 assert.equal(technologyLevel(m,"red"),2);assert.equal(r.maxHp,500);assert.equal(robotLevel(r,m),7);
 assert.equal(infantryCap(m,"red"),7);assert.equal(ri.xp,2200);
 assert.ok(reviveRobot(m,"bi",true));advance(3);
 for(let i=0;i<10;i++)damageTarget(m,ri,{type:"robot",id:"bi"});
 assert.ok(ri.xp>2200);assert.ok(robotLevel(ri)>5);assert.ok(ri.xp<=3300);
 advance(120-m.elapsed);complete("red",3);
 assert.equal(technologyLevel(m,"red"),3);assert.equal(infantryCap(m,"red"),10);
 assert.equal(robotLevel(r,m),10);assert.equal(r.maxHp,600);assert.equal(launcherStatus(m,r).state,"unlocked");
 assert.equal(installLauncher(m,"r"),false);
 const bench={x:12.7,y:.16,z:-5.4};at("red",bench);assert.ok(installLauncher(m,"r",bench));assert.ok(purchaseAmmo(m,"r"));assert.ok(fireRound(m,"r"));assert.equal(r.launcher,"ready");
 assert.equal(damageTarget(m,bi,{type:"robot",id:"ri"}),15);
 assert.equal(damageTarget(m,bi,{type:"outpost",team:"red"}),15);
 advance(180-m.elapsed);complete("red",4);
 assert.equal(technologyLevel(m,"red"),4);assert.equal(assemblyStatus(m,r,zone.red).income,120);
 assert.equal(damageTarget(m,bi,{type:"robot",id:"ri"}),10);
 assert.equal(damageTarget(m,bi,{type:"outpost",team:"red"}),10);
 assert.equal(m.energyUnits.filter(u=>u.location.kind==="spent").length,5);
 assert.equal(assemblyAction(m,"r",zone.red,"blue",6),false);
 complete("red",1);assert.equal(assemblyStatus(m,r,zone.red).income,124);
 assert.equal(m.energyUnits.filter(u=>u.location.kind==="spent").length,6);
 const reset=createMatch(roster,1,1,spawns,sockets);
 assert.equal(technologyLevel(reset,"red"),0);assert.equal(reset.sides.red.tech.attempt,null);assert.equal(reset.sides.red.coins,800);
 assert.ok(reset.energyUnits.every(u=>u.location.kind==="rack"));
});
test("dual core exclusivity, two distinct energy units, actual paired steps and random target",()=>{
 const f=fixture(),{m,robot,advance,pickup,begin,action,reachLevel3}=f;reachLevel3("red");
 pickup("red",1);assert.equal(beginAssembly(m,"r",zone.red,4),false);
 pickup("red",1);begin("blue",1);assert.equal(beginAssembly(m,"r",zone.red,4),false);
 assert.ok(cancelAssembly(m,"b"));assert.ok(beginAssembly(m,"r",zone.red,4));advance(1);
 assert.equal(beginAssembly(m,"b",zone.blue,1),false);
 const target=coreFrame(m,"blue");assert.ok(target.head.x>0);assert.ok(Math.hypot(target.head.x-coreFrame(m,"red").head.x,target.head.z-coreFrame(m,"red").head.z)<=.4);
 action("red","red",2);assert.equal(assemblyAction(m,"r",zone.red,"red",6),false);
 advance(1);
 action("red","blue",2);assert.equal(m.energyUnits.filter(u=>u.location.kind==="mounted").length,2);
 for(const step of [3,4,5,6]){action("red","red",step);assert.equal(technologyLevel(m,"red"),3);action("red","blue",step);}
 assert.equal(technologyLevel(m,"red"),4);
 assert.equal(m.sides.red.tech.counts[3],1);
 assert.equal(beginAssembly(m,"r",zone.red,4),false);
});
for(const delay of [4.3,4.4,4.5])test("dual step completion boundary "+(delay+.6),()=>{
 const f=fixture();f.reachLevel3("red");f.begin("red",4);f.action("red","red",2);f.advance(delay);
 const a=assemblyStatus(f.m,f.robot("red"),zone.red).actions.find(a=>a.core==="blue"&&a.step===2);
 assert.ok(a);assert.ok(assemblyAction(f.m,"r",zone.red,"blue",2,a.angle));f.advance(.6);
 assert.equal(!!f.m.sides.red.tech.attempt,delay<=4.4);
 assert.equal(technologyLevel(f.m,"red"),3);
 if(delay>4.4)assert.equal(f.m.sides.red.tech.failure,"双核心步骤超时");
});
for(const delta of [-.1,0,.1])test("dual total deadline boundary "+delta,()=>{
 const f=fixture();f.reachLevel3("red");f.begin("red",4);
 const deadline=f.m.sides.red.tech.attempt.start+46;
 for(const step of [2,3,4,5]){f.action("red","red",step);f.action("red","blue",step);}
 // The rule also requires the two confirmations within 5s. Keep the
 // last 5-step pair complete, then place confirmations at the total boundary.
 f.advance(deadline-f.m.elapsed-.5+delta);
 f.action("red","red",6);
 if(delta>0){
   f.advance(.5);
   assert.equal(assemblyAction(f.m,"r",zone.red,"blue",6),false);
   assert.equal(technologyLevel(f.m,"red"),3);
 }else{
   f.advance(.5);f.action("red","blue",6);assert.equal(technologyLevel(f.m,"red"),4);
 }
});
test("cancel, leave-zone timeout, real damage death, revival and no duplicate rewards",()=>{
 const f=fixture();f.begin("red",1);f.action("red","red",2);
 assert.ok(cancelAssembly(f.m,"r"));assert.equal(technologyLevel(f.m,"red"),0);assert.equal(f.m.energyUnits.filter(u=>u.location.kind==="spent").length,1);
 f.begin("red",1);f.action("red","red",2);f.positions.set("r",outside);
 f.advance(14.9);assert.ok(f.m.sides.red.tech.attempt);f.advance(.1);assert.equal(f.m.sides.red.tech.attempt,null);
 f.begin("red",1);f.action("red","red",2);f.positions.set("r",outside);f.advance(2.1);
 const r=f.robot("red"),b=f.robot("blue");
 for(let i=0;i<10&&r.hp>0;i++)damageTarget(f.m,b,{type:"robot",id:"r"});
 assert.equal(r.hp,0);assert.ok(f.m.sides.red.tech.attempt);assert.equal(assemblyAction(f.m,"r",zone.red,"red",6),false);
 f.advance(14.9);assert.ok(f.m.sides.red.tech.attempt);f.advance(.1);assert.equal(f.m.sides.red.tech.attempt,null);
 assert.ok(revivalStatus(f.m,r).canPay);assert.ok(reviveRobot(f.m,"r",true));
 assert.equal(technologyLevel(f.m,"red"),0);assert.equal(assemblyStatus(f.m,r,outside).income,0);
});

test("assembly notifications distinguish accepted timed steps from completion and final rewards",()=>{
 const f=fixture(),{m,robot,advance,pickup}=f,events=[];
 m.onEvent=e=>events.push(e);
 pickup("red");assert.equal(events.filter(e=>e.type==="energy-picked").length,1);
 assert.ok(beginAssembly(m,"r",zone.red,1));assert.equal(technologyLevel(m,"red"),0);
 assert.equal(assemblyAction(m,"r",zone.red,"red",2),false);
 assert.equal(events.filter(e=>e.type==="assembly-step-start").length,0);
 advance(1);
 assert.ok(assemblyAction(m,"r",zone.red,"red",2));assert.equal(events.at(-1).type,"assembly-step-start");
 assert.equal(events.at(-1).completed,0);assert.equal(events.at(-1).total,2);
 assert.equal(assemblyAction(m,"r",zone.red,"red",2),false);
 advance(.6);assert.equal(events.at(-1).type,"assembly-step-complete");assert.equal(events.at(-1).completed,1);
 assert.equal(technologyLevel(m,"red"),0);
 assert.ok(assemblyAction(m,"r",zone.red,"red",6));assert.equal(events.at(-1).type,"assembly-end");assert.equal(events.at(-1).technology,1);assert.equal(events.at(-1).completed,2);
 assert.equal(events.filter(e=>e.type==="energy-spent").length,1);
 assert.equal(events.filter(e=>e.type==="assembly-end").length,1);
 pickup("red");assert.ok(beginAssembly(m,"r",zone.red,1));assert.ok(cancelAssembly(m,"r"));
 assert.equal(events.at(-1).reason,"已取消装配");assert.equal(events.at(-1).technology,undefined);
 assert.equal(technologyLevel(m,"red"),1);
 assert.ok(events.every(e=>e.visibility==="red"));
});
