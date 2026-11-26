import {groundIdentity,systemIdentity} from "./rmuc-3d-identity.ts";
import type {Match,DamageEvent,MatchRobot,MatchEvent} from "./rmuc-3d-match.ts";
import type {Team} from "./rmuc-3d-mechanisms.ts";
import {technologyLevel} from "./rmuc-3d-match.ts";
import {validStrategy,type Strategy,type TaskKind} from "./rmuc-3d-strategy.ts";

export type ExperimentConfig={seed:number;pairs:number;strategies:Record<Team,Strategy>};
export type TaskDecision={at:number;id:string;team:Team;kind:TaskKind;score:number;ms:number;reason:string;target?:[number,number,number];maneuver?:"strafe"|"cover"|"withdraw"};
export function validExperiment(c:ExperimentConfig){
  return !!c&&Number.isInteger(c.seed)&&c.seed>=0&&c.seed<=0xffffffff&&Number.isInteger(c.pairs)&&c.pairs>=1&&c.pairs<=20&&validStrategy(c.strategies?.red)&&validStrategy(c.strategies?.blue);
}
export function roundConfig(c:ExperimentConfig,index:number){
  const swapped=index%2===1;
  return {seed:(c.seed+Math.floor(index/2))>>>0,swapped,strategies:swapped?{red:c.strategies.blue,blue:c.strategies.red}:c.strategies};
}
export function createRoundTelemetry(match:Match){
  const alive=new Map(match.robots.map(r=>[r.id,r.hp>0]));
  const events:{at:number;team:Team;id?:string;kind:"death"|"revival"|"technology";level?:number}[]=[];
  const level={red:0,blue:0},spent={red:0,blue:0},radarExtra={red:0,blue:0};
  const combat=new Map(match.robots.map(r=>[r.id,{shots:0,shortIntervals:0,intervals:0,intervalTotal:0,minInterval:null as number|null,lastShot:null as number|null,damagingImpacts:0,shieldContacts:0,contacts:0,peakHeat:0,thermalSeconds:0,powerOffSeconds:0,travel:0,evadeTravel:0,spinTravel:0}]));
  const participation={red:{ammo:0,heal:0,rune:0,darts:0,assembly:0},blue:{ammo:0,heal:0,rune:0,darts:0,assembly:0}};
  let previousAt=match.elapsed;
  return {events,spent,radarExtra,combat,participation,
  shot(r:MatchRobot,at:number){const c=combat.get(r.id);if(!c)return;c.shots++;c.peakHeat=Math.max(c.peakHeat,r.heat);
    if(c.lastShot!==null){const interval=at-c.lastShot;c.intervals++;c.intervalTotal+=interval;c.minInterval=Math.min(c.minInterval??Infinity,interval);if(interval<.36)c.shortIntervals++;}
    c.lastShot=at;},
  impact(id:string,damage:number,shielded:boolean){const c=combat.get(id);if(c){c.contacts++;if(damage>0)c.damagingImpacts++;if(shielded)c.shieldContacts++;}},
  move(id:string,distance:number,maneuver?:TaskDecision["maneuver"],spin=false){const c=combat.get(id);if(c){c.travel+=distance;if(maneuver)c.evadeTravel+=distance;if(spin)c.spinTravel+=distance;}},
  event(e:MatchEvent){if(!("team" in e))return;const p=participation[e.team];if(e.type==="ammo"&&e.status==="completed")p.ammo+=e.amount??0;
    if(e.type==="heal"&&e.status==="completed")p.heal+=e.amount??0;
    if(e.type==="rune-success")p.rune++;if(e.type==="dart-launch")p.darts++;if(e.type==="assembly-end"&&!e.reason)p.assembly++;},
  spend(team:Team,amount:number){spent[team]+=amount;},damage(event:DamageEvent){
    if(event.target.type==="robot"&&event.radarExtra){const id=event.target.id,r=match.robots.find(r=>r.id===id);if(r)radarExtra[r.team==="red"?"blue":"red"]+=event.radarExtra;}
  },observe(m:Match){
    const dt=Math.max(0,m.elapsed-previousAt);previousAt=m.elapsed;
    for(const r of m.robots){const c=combat.get(r.id);if(c){c.peakHeat=Math.max(c.peakHeat,r.heat);if(r.thermalLock)c.thermalSeconds+=dt;if(r.powerLockUntil>m.elapsed)c.powerOffSeconds+=dt;}}
    for(const r of m.robots){const previous=alive.get(r.id),next=r.hp>0;if(previous!==next){events.push({at:m.elapsed,team:r.team,id:r.id,kind:next?"revival":"death"});alive.set(r.id,next);}}
    for(const team of ["red","blue"] as const){const next=technologyLevel(m,team);if(next!==level[team]){level[team]=next;events.push({at:m.elapsed,team,kind:"technology",level:next});}}
  }};
}
export function summarizeRound(match:Match,config:ExperimentConfig,index:number,decisions:TaskDecision[],telemetry:ReturnType<typeof createRoundTelemetry>){
  const {events,spent,radarExtra,combat,participation}=telemetry;
  const side=(team:Team)=>{
    const s=match.sides[team],tasks=decisions.filter(d=>d.team===team),counts:Partial<Record<TaskKind,number>>={},duration:Partial<Record<TaskKind,number>>={},previous=new Map<string,TaskDecision>();
    for(const d of tasks){counts[d.kind]=(counts[d.kind]??0)+1;const p=previous.get(d.id);if(p)duration[p.kind]=(duration[p.kind]??0)+d.at-p.at;previous.set(d.id,d);}
    for(const p of previous.values())duration[p.kind]=(duration[p.kind]??0)+match.elapsed-p.at;
    const sorted=tasks.map(t=>t.ms).sort((a,b)=>a-b);
    return {base:s.base,outpost:s.outpost,control:s.controlTicks/10,damage:s.damage,coins:s.coins,spent:spent[team],damagePerCoin:spent[team]?s.damage/spent[team]:null,purchased17:s.purchased,purchased42:s.purchased42,shots:s.armor.shots,armorHits:s.armor.hits.length,armorHitRate:s.armor.shots?s.armor.hits.length/s.armor.shots:null,
      technology:technologyLevel(match,team),technologyCounts:s.tech.counts.slice(),kills:events.filter(e=>e.team!==team&&e.kind==="death").length,deaths:events.filter(e=>e.team===team&&e.kind==="death").length,revivals:events.filter(e=>e.team===team&&e.kind==="revival").length,
      radar:{extraDamage:radarExtra[team],vulnerableSeconds:match.radar[team].vulnerableSeconds,doubleActivations:match.radar[team].used,marks:Object.fromEntries(Object.entries(match.radar[team].tracks).map(([id,t])=>[id,t.progress]))},
      participation:participation[team],maneuvers:tasks.filter(t=>t.maneuver).reduce<Partial<Record<NonNullable<TaskDecision["maneuver"]>,number>>>((a,t)=>{const k=t.maneuver!;a[k]=(a[k]??0)+1;return a;},{}),
      tasks:counts,taskSeconds:duration,decisionMeanMs:sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:0,decisionP95Ms:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:0,
      systems:(["air","dart","radar"] as const).map(kind=>systemIdentity(team,kind)),
      robots:match.robots.filter(r=>r.team===team).map(r=>({id:r.id,identity:groundIdentity(r.id),hp:r.hp,xp:r.xp,ammo:r.ammo,combat:combat.get(r.id)}))};
  };
  return {...roundConfig(config,index),index:index+1,elapsed:match.elapsed,winner:match.winner,sides:{red:side("red"),blue:side("blue")},events:events.slice(),decisions:decisions.slice()};
}
export type ExperimentRound=ReturnType<typeof summarizeRound>;
export type ExperimentProgress={running:boolean;completed:number;total:number;elapsed:number;results:ExperimentRound[]};
export function pairedSummary(results:ExperimentRound[]){
  const summary={aWins:0,bWins:0,draws:0,redWins:0,blueWins:0,completePairs:0};
  for(const r of results){if(r.winner==="draw")summary.draws++;else if(r.winner){summary[r.winner==="red"?"redWins":"blueWins"]++;summary[(r.winner==="red")!==r.swapped?"aWins":"bWins"]++;}}
  for(let i=0;i+1<results.length;i+=2)if(results[i].seed===results[i+1].seed&&!results[i].swapped&&results[i+1].swapped)summary.completePairs++;
  return summary;
}
