import {test} from "node:test";
import assert from "node:assert/strict";
import {chooseTask,defaultStrategy,STRATEGY_PRESETS,WEIGHT_KEYS,validStrategy,aiSample,aiBurst,aiFireDelay,aiDartPlan} from "./rmuc-3d-strategy.ts";
import {validExperiment,roundConfig,pairedSummary,createRoundTelemetry,summarizeRound} from "./rmuc-3d-experiment.ts";
import {createMatch,startMatch,fireRound,updateMatch,canFire} from "./rmuc-3d-match.ts";
const kinds=["attack","defend","resource","technology","support"];
const candidates=WEIGHT_KEYS.map((weight,i)=>({kind:kinds[i],weight,priority:10-i,urgency:1,distance:1,execute:()=>i}));
test("both algorithms rank the same legal candidates differently; all five weights alter selection",()=>{
  assert.equal(chooseTask(defaultStrategy(),candidates).task.kind,"attack");
  for(const [i,key] of WEIGHT_KEYS.entries()){
    const weights={...STRATEGY_PRESETS.balanced,[key]:100};
    const s={algorithm:"utility",weights};
    assert.equal(chooseTask(s,candidates).task.kind,kinds[i]);
    assert.equal(chooseTask(s,candidates).task.execute(),i);
  }
  const required={...candidates[3],required:true};
  assert.equal(chooseTask({algorithm:"utility",weights:STRATEGY_PRESETS.attack},[...candidates,required]).task,required);
  assert.equal(validStrategy({algorithm:"utility",weights:{...STRATEGY_PRESETS.balanced,attack:101}}),false);
});
test("pairing swaps only strategies and repeats the seed, with explicit incomplete pair counts",()=>{
 const a=defaultStrategy(),b={algorithm:"utility",weights:STRATEGY_PRESETS.technology};
 const c={seed:0xffffffff,pairs:2,strategies:{red:a,blue:b}};
 assert.equal(validExperiment(c),true);assert.equal(validExperiment({...c,pairs:21}),false);
 assert.equal(roundConfig(c,0).seed,0xffffffff);assert.equal(roundConfig(c,1).seed,0xffffffff);
 assert.equal(roundConfig(c,1).strategies.red,b);assert.equal(roundConfig(c,2).seed,0);
 assert.deepEqual(pairedSummary([{seed:c.seed,swapped:false,winner:"red"},{seed:c.seed,swapped:true,winner:"blue"}]),{aWins:2,bWins:0,draws:0,redWins:1,blueWins:1,completePairs:1});
});
test("round telemetry counts actual transitions and spending, not requested commands",()=>{
 const m=createMatch([{id:"r",team:"red",heavy:false,maxHp:200},{id:"b",team:"blue",heavy:false,maxHp:200}],1,1);
 const t=createRoundTelemetry(m);m.elapsed=1;m.robots[0].hp=0;t.observe(m);
 m.elapsed=2;m.robots[0].hp=20;t.observe(m);t.spend("red",100);t.damage({target:{type:"robot",id:"r"},radarExtra:5,amount:20,at:2,source:"projectile"});
 const config={seed:1,pairs:1,strategies:{red:defaultStrategy(),blue:defaultStrategy()}};
 const r=summarizeRound(m,config,0,[],t);
 assert.equal(r.sides.red.deaths,1);assert.equal(r.sides.blue.kills,1);assert.equal(r.sides.red.armorHitRate,null);assert.equal(r.sides.red.revivals,1);assert.equal(r.sides.red.spent,100);assert.equal(r.sides.blue.radar.extraDamage,5);
});


test("virtual AI cadence is seeded per robot and independent of unrelated draws",()=>{
 const id="blue-2027-infantry-03";
 const seq=Array.from({length:16},(_,i)=>aiSample(2061,id,i,3));
 assert.deepEqual(seq,Array.from({length:16},(_,i)=>aiSample(2061,id,i,3)));
 assert.notDeepEqual(seq,Array.from({length:16},(_,i)=>aiSample(2061,"red-2027-infantry-03",i,3)));
 assert.notDeepEqual(seq,Array.from({length:16},(_,i)=>aiSample(2062,id,i,3)));
 assert.ok(seq.every(x=>x>=0&&x<1));
 for(let tick=0;tick<100;tick++){
   assert.equal(aiBurst(2061,id,tick,"heavy"),1);
   assert.ok(aiBurst(2061,id,tick,"infantry")>=2&&aiBurst(2061,id,tick,"infantry")<=4);
   assert.ok(aiBurst(2061,id,tick,"sentry")>=3&&aiBurst(2061,id,tick,"sentry")<=6);
   const short=aiFireDelay(2061,id,tick,"infantry",1,0),rest=aiFireDelay(2061,id,tick,"infantry",0,0);
   assert.ok(short<rest);assert.ok(aiFireDelay(2061,id,tick,"heavy",0,0)>short);
   assert.ok(aiFireDelay(2061,id,tick,"infantry",1,1)>short);
 }
});
test("AI telemetry records only accepted rounds, actual contacts, and actual movement",()=>{
 const m=createMatch([{id:"a",team:"red",heavy:false,maxHp:200}],1,1);startMatch(m);
 const r=m.robots[0],t=createRoundTelemetry(m);r.ammo=2;
 assert.ok(fireRound(m,r.id));t.shot(r,m.elapsed);
 assert.equal(fireRound(m,r.id),null);
 updateMatch(m,.2);assert.ok(canFire(m,r));assert.ok(fireRound(m,r.id));t.shot(r,m.elapsed);
 assert.equal(fireRound(m,r.id),null);t.impact(r.id,0,true);t.impact(r.id,20,false);
 t.move(r.id,.5,"strafe");t.move(r.id,.3,undefined,true);
 t.event({type:"ammo",team:"red",robot:r.id,status:"requested",at:m.elapsed,visibility:"red"});
 t.event({type:"ammo",team:"red",robot:r.id,status:"completed",amount:100,at:m.elapsed,visibility:"red"});
 const data=t.combat.get(r.id);
 assert.equal(data.shots,2);assert.equal(data.shortIntervals,1);assert.equal(data.damagingImpacts,1);assert.equal(data.shieldContacts,1);
 assert.equal(data.travel,.8);assert.equal(data.evadeTravel,.5);assert.equal(data.spinTravel,.3);assert.equal(t.participation.red.ammo,100);
});

test("virtual dart AI timing and choices vary by seed, side and strategy, without changing referee windows",()=>{
 const a=aiDartPlan(2061,"red",0,defaultStrategy(),true);
 assert.deepEqual(a,aiDartPlan(2061,"red",0,defaultStrategy(),true));
 assert.notDeepEqual(a,aiDartPlan(2061,"blue",0,defaultStrategy(),true));
 assert.notDeepEqual(a,aiDartPlan(2062,"red",0,defaultStrategy(),true));
 const defensive=aiDartPlan(2061,"red",1,{algorithm:"utility",weights:STRATEGY_PRESETS.defense},false);
 assert.equal(defensive.mode,"randomFixed");assert.ok(defensive.fireDelay+defensive.spacing<30);
});
