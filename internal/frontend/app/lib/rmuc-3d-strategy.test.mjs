import {test} from "node:test";
import assert from "node:assert/strict";
import {chooseTask,defaultStrategy,STRATEGY_PRESETS,WEIGHT_KEYS,validStrategy} from "./rmuc-3d-strategy.ts";
import {validExperiment,roundConfig,pairedSummary,createRoundTelemetry,summarizeRound} from "./rmuc-3d-experiment.ts";
import {createMatch} from "./rmuc-3d-match.ts";
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
