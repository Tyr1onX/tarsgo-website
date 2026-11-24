import type { Team, MechanismPose } from "./rmuc-3d-mechanisms.ts";
import { ARENA_ZONES, zonesAtPosition, type ArenaPosition, type ZoneId } from "./rmuc-3d-zones.ts";
export type { Team };
export const MATCH_DURATION = 420;
const teams = ["red", "blue"] as const;
const opponent = (t: Team): Team => t === "red" ? "blue" : "red";
const OUTPOST_SPEED=.8*Math.PI, TURN=2*Math.PI;
// §5.6.1: speed reaches 0.8π within 5s. Linear ramp/return trajectory
// is a visualization choice; the rule does not specify motor acceleration.
const outpostTravel=(t:number)=>OUTPOST_SPEED*(t<5?t*t/10:t-2.5);
function returnToRest(angle:number,direction:number,dt:number){
  const phase=((angle*direction%TURN)+TURN)%TURN;
  if(phase<1e-9||TURN-phase<1e-9)return 0;
  const remaining=TURN-phase;
  const travel=Math.min(remaining,OUTPOST_SPEED*dt);
  return travel>=remaining?0:angle+direction*travel;
}
type RobotSpec = { id:string; team:Team; heavy:boolean; maxHp:number; sentry?:boolean };
export type MatchRobot = RobotSpec & { hp:number; ammo:number; cooldown:number; heat:number; heatLimit:number; cooling:number; thermalLock:boolean; lastCombat:number; pendingAmmoAt:number|null; pendingHealAt:number|null; zones:Partial<Record<ZoneId,number>>; fortressHold:number; fortressRetainUntil:number };
export type Territory = { controller:Team; full:boolean; progress:number };
type Side = { coins:number; purchased:number; base:number; outpost:number; outpostOwner:Team; outpostArea:Territory; baseArea:Territory; controlTicks:number; damage:number; cover:boolean; stopped:boolean; buff:number; runeHits:number[] };
export type Match = { elapsed: number; phase: "ready" | "running" | "finished"; winner: Team | "draw" | null; sides: Record<Team, Side>; robots: MatchRobot[]; pose: MechanismPose; direction: number; outpostDirection: number };
export function createMatch(robots: readonly RobotSpec[], direction = Math.random()<.5?-1:1, outpostDirection = Math.random()<.5?-1:1): Match {
  const area=(team:Team):Territory=>({controller:team,full:true,progress:0});
  const side = (team:Team): Side => ({coins:800,purchased:0,base:10000,outpost:1000,outpostOwner:team,outpostArea:area(team),baseArea:area(team),controlTicks:0,damage:0,cover:false,stopped:false,buff:0,runeHits:[]});
  return {elapsed:0, phase:"ready", winner:null, sides:{red:side("red"),blue:side("blue")}, robots:robots.map(r=>({...r,hp:r.maxHp,ammo:r.sentry?300:0,cooldown:0,heat:0,heatLimit:r.heavy?0:r.sentry?100:40,cooling:r.heavy?0:r.sentry?10:12,thermalLock:false,lastCombat:-6,pendingAmmoAt:null,pendingHealAt:null,zones:{},fortressHold:0,fortressRetainUntil:0})), pose:{runeAngle:0,outpostAngle:{red:0,blue:0},cover:{red:0,blue:0}},direction,outpostDirection};
}
export function startMatch(match: Match) {
  if(match.phase==="ready") match.phase="running";
}
// RMUC 2027 V1.0.0: §3.1, §5.1.3, §5.4.2, table 5-7 and table 5-18.
// Infantry: level 1 cooling-priority; controllable sentry: semi-automatic.
// Heavy cannot fire until the as-yet unimplemented 42 mm assembly.
export function canPurchaseAmmo(match:Match, robot:MatchRobot) {
  const side=match.sides[robot.team];
  return match.phase==="running"&&!robot.heavy&&robot.hp>0&&
    match.elapsed-robot.lastCombat>=6&&robot.pendingAmmoAt===null&&side.coins>=150&&side.purchased+100<=1000;
}
export function purchaseAmmo(match:Match, id:string) {
  const robot=match.robots.find(r=>r.id===id);
  if(!robot||!canPurchaseAmmo(match,robot)) return false;
  const side=match.sides[robot.team];
  side.coins-=150;side.purchased+=100;robot.pendingAmmoAt=match.elapsed+6;
  return true;
}
// §5.3.1, table 5-7 and table 5-19: delayed remote healing with
// current base-dependent logistics. Death during the request forfeits coins.
export const remoteHealthCost=(match:Match)=>50+Math.ceil(match.elapsed/60*20);
export function canPurchaseHealth(match:Match,robot:MatchRobot){
  return match.phase==="running"&&robot.hp>0&&robot.hp<robot.maxHp&&
    match.elapsed-robot.lastCombat>=6&&robot.pendingHealAt===null&&match.sides[robot.team].coins>=remoteHealthCost(match);
}
export function purchaseHealth(match:Match,id:string){
  const robot=match.robots.find(r=>r.id===id);
  if(!robot||!canPurchaseHealth(match,robot))return false;
  match.sides[robot.team].coins-=remoteHealthCost(match);
  robot.pendingHealAt=match.elapsed+6;
  return true;
}
export function canFire(match:Match,robot:MatchRobot) {
  return match.phase==="running"&&!robot.heavy&&robot.hp>0&&robot.ammo>0&&robot.cooldown<=0&&!robot.thermalLock;
}
export function fireRound(match:Match,id:string) {
  const robot=match.robots.find(r=>r.id===id);
  if(!robot||!canFire(match,robot)) return null;
  robot.ammo--;robot.cooldown=.18;robot.lastCombat=match.elapsed;
  robot.heat+=10;
  if(robot.heat>robot.heatLimit)robot.thermalLock=true;
  return robot;
}
// Territory progress and zone expiry use integer 10 Hz referee ticks.
export function activeZone(match:Match,robot:MatchRobot,id:ZoneId) {
  return robot.hp>0&&(robot.zones[id]??0)>Math.floor((match.elapsed+1e-8)*10);
}
export function controlsOutpost(match:Match,location:Team,team:Team,full=false){
  const a=match.sides[location].outpostArea;
  return a.controller===team&&(!full||a.full);
}
const territoryZones=(location:Team,kind:"outpost"|"base"):ZoneId[]=>kind==="outpost"?[`${location}-outpost`,`${location}-central`]:[`${location}-base`,`${location}-fortress`];
export function territoryStatus(match:Match,location:Team,kind:"outpost"|"base"){
  const area=kind==="outpost"?match.sides[location].outpostArea:match.sides[location].baseArea;
  const ids=territoryZones(location,kind);
  const contested=teams.every(team=>match.robots.some(r=>r.team===team&&ids.some(id=>activeZone(match,r,id))));
  return {...area,contested};
}
function rebuildOutpost(side:Side,team:Team){
  side.outpost=500;side.outpostOwner=team;side.stopped=true;
}
function robotDefense(match:Match,robot:MatchRobot) {
  let defense=match.sides[robot.team].buff>0?.25:0;
  if(activeZone(match,robot,`${robot.team}-base`))defense=Math.max(defense,.5);
  if(teams.some(t=>activeZone(match,robot,`${t}-central`)))defense=Math.max(defense,.25);
  if(activeZone(match,robot,`${robot.team}-fortress`)&&!controlsOutpost(match,robot.team,robot.team))defense=Math.max(defense,.5);
  const vulnerable=activeZone(match,robot,`${opponent(robot.team)}-fortress`)&&!match.sides[opponent(robot.team)].cover;
  return 1-defense+(vulnerable?1:0);
}
function advanceTerritories(match:Match,tick:number,raw:Map<string,ZoneId[]>,coverOpened:Partial<Record<Team,number>>){
  const active=(robot:MatchRobot,id:ZoneId)=>robot.hp>0&&(robot.zones[id]??0)>tick;
  for(const r of match.robots){
    if(r.hp<=0){r.zones={};continue;}
    for(const id of Object.keys(r.zones) as ZoneId[])if(!active(r,id))delete r.zones[id];
  }
  for(const zone of ARENA_ZONES){
    const candidates=match.robots.filter(r=>r.hp>0&&raw.get(r.id)?.includes(zone.id)&&
      (zone.kind!=="fortress"||r.team===zone.team||(tick>=1800&&controlsOutpost(match,zone.team,r.team))));
    if(zone.kind==="central"){
      const holder=match.robots.find(r=>active(r,zone.id))?.team;
      const entrants=new Set(candidates.map(r=>r.team));
      // Simultaneous first detection is a tie, rather than favoring a roster order.
      const allowed=holder??(entrants.size===1?candidates[0].team:undefined);
      for(const r of candidates)if(r.team===allowed)r.zones[zone.id]=tick+20;
    }else for(const r of candidates)r.zones[zone.id]=tick+20;
  }
  // Score the interval before applying transitions at its endpoint.
  for(const team of teams){
    if(teams.every(t=>controlsOutpost(match,t,team)))match.sides[team].controlTicks++;
    if(teams.every(t=>match.sides[t].baseArea.controller===team))match.sides[team].controlTicks+=3;
  }
  for(const location of teams){
    const side=match.sides[location];
    for(const [kind,area,ids] of [
      ["outpost",side.outpostArea,territoryZones(location,"outpost")],
      ["base",side.baseArea,territoryZones(location,"base")],
    ] as const){
      const present=(team:Team)=>match.robots.some(r=>r.team===team&&ids.some(id=>active(r,id)));
      const own=present(area.controller),other=present(opponent(area.controller));
      if(own&&other)continue;
      const progressing=area.full?other:!own;
      area.progress=Math.max(0,Math.min(50,area.progress+(progressing?1:-1)));
      if(area.progress<50)continue;
      area.controller=opponent(area.controller);area.full=!area.full;area.progress=0;
      if(kind==="outpost"&&area.full&&side.outpost===0)rebuildOutpost(side,area.controller);
    }
    if(side.cover)continue;
    for(const robot of match.robots){
      if(robot.team===location)continue;
      if(tick>=1800&&controlsOutpost(match,location,robot.team)&&active(robot,`${location}-fortress`)){
        robot.fortressHold++;robot.fortressRetainUntil=tick+30;
        if(robot.fortressHold>=100){side.cover=true;coverOpened[location]=tick/10;break;}
      }else if(tick>robot.fortressRetainUntil)robot.fortressHold=0;
    }
  }
}

export type Target = {type:"robot";id:string}|{type:"outpost"|"base";team:Team}|{type:"rune";arm:number};
export function damageTarget(match:Match,shooter:MatchRobot,target:Target) {
  if(match.phase!=="running") return 0;
  const side=match.sides[shooter.team];
  if(target.type==="rune") {
    // Training-only activation: distinct moving arms, not certified ring scoring.
    if(side.buff<=0&&!side.runeHits.includes(target.arm))side.runeHits.push(target.arm);
    if(side.runeHits.length>=5){side.buff=30;side.runeHits=[];}
    return 0;
  }
  if(target.type==="robot"){
    const enemy=match.robots.find(r=>r.id===target.id);
    if(!enemy||enemy.team===shooter.team||enemy.hp<=0)return 0;
    const amount=Math.min(enemy.hp,Math.max(0,Math.round(20*robotDefense(match,enemy))));
    enemy.hp-=amount;side.damage+=amount;enemy.lastCombat=match.elapsed;
    if(enemy.hp===0){enemy.heat=0;enemy.thermalLock=false;enemy.pendingAmmoAt=null;enemy.pendingHealAt=null;enemy.zones={};}
    return amount;
  }
  const enemy=match.sides[target.team];
  const owner=target.type==="outpost"?enemy.outpostOwner:target.team;
  if(owner===shooter.team)return 0;
  // The remaining whole-base hit tag is a training approximation; do not
  // allow shots through closed housing until the source detectors are bound.
  if(target.type==="base"&&(controlsOutpost(match,target.team,target.team,true)||!enemy.cover))return 0;
  const amount=Math.min(enemy[target.type],match.sides[owner].buff>0?15:20);
  enemy[target.type]-=amount;side.damage+=amount;
  if(target.type==="outpost"&&amount>0&&enemy.outpost===0){
    enemy.stopped=true;
    const area=enemy.outpostArea;
    if(area.full){area.full=false;area.progress=0;}
    else if(area.controller!==owner){area.full=true;area.progress=0;rebuildOutpost(enemy,area.controller);}
  }
  return amount;
}
export function updateMatch(match:Match, dt:number, positions:ReadonlyMap<string,ArenaPosition> = new Map()) {
  if(match.phase!=="running")return;
  dt=Math.max(0,Math.min(dt,MATCH_DURATION-match.elapsed));
  const before=match.elapsed;match.elapsed+=dt;
  for(const second of [61,121,181,241,301,361]) if(before<second&&match.elapsed>=second)
    for(const team of teams)match.sides[team].coins+=second===361?300:100;
  const coolingTicks=Math.floor((match.elapsed+1e-8)*10)-Math.floor((before+1e-8)*10);
  for(const r of match.robots){
    r.cooldown=Math.max(0,r.cooldown-dt);
    r.heat=Math.max(0,r.heat-coolingTicks*r.cooling/10);
    if(r.heat<1e-8){r.heat=0;r.thermalLock=false;}
    if(r.pendingAmmoAt!==null&&match.elapsed>=r.pendingAmmoAt){
      if(r.hp>0)r.ammo+=100;
      r.pendingAmmoAt=null;
    }
    if(r.pendingHealAt!==null&&match.elapsed>=r.pendingHealAt){
      const logistics=1-(10000-match.sides[r.team].base)/20000;
      if(r.hp>0)r.hp=Math.min(r.maxHp,r.hp+Math.round(r.maxHp*.6*logistics));
      r.pendingHealAt=null;
    }
  }
  match.pose.runeAngle+=match.direction*Math.PI/3*dt;
  const coverOpened:Partial<Record<Team,number>>={};
  if(coolingTicks>0){
    const raw=new Map([...positions].map(([id,p])=>[id,zonesAtPosition(p)]));
    const first=Math.floor((before+1e-8)*10)+1;
    for(let tick=first;tick<first+coolingTicks;tick++)advanceTerritories(match,tick,raw,coverOpened);
  }
  for(const team of teams){
    const side=match.sides[team];
    side.buff=Math.max(0,side.buff-dt);
    const coverDt=side.cover?match.elapsed-Math.max(before,coverOpened[team]??before):0;
    match.pose.cover[team]=Math.min(1,match.pose.cover[team]+coverDt);
  }
  for(const team of teams){
    const side=match.sides[team],enemy=match.sides[opponent(team)];
    // One-way stop latch, including when a destroyed outpost is later rebuilt.
    const stopAt=side.stopped||side.outpost===0?before:
      Math.min(180,enemy.cover?coverOpened[opponent(team)]??before:Infinity);
    const runUntil=Math.max(before,Math.min(match.elapsed,stopAt));
    if(!side.stopped&&runUntil>before)
      match.pose.outpostAngle[team]+=match.outpostDirection*(outpostTravel(runUntil)-outpostTravel(before));
    if(match.elapsed>=stopAt){
      side.stopped=true;
      match.pose.outpostAngle[team]=returnToRest(match.pose.outpostAngle[team],match.outpostDirection,match.elapsed-runUntil);
    }
  }
  if(match.elapsed>=MATCH_DURATION||teams.some(t=>match.sides[t].base===0)){
    const [r,b]=teams.map(t=>match.sides[t]);
    const hp=(t:Team)=>match.robots.filter(r=>r.team===t).reduce((sum,r)=>sum+r.hp,0);
    const differences=r.base===0||b.base===0?[r.base-b.base]:[r.controlTicks-b.controlTicks,r.damage-b.damage,hp("red")-hp("blue")];
    const delta=differences.find(d=>Math.abs(d)>1e-7)??0;
    match.winner=delta>0?"red":delta<0?"blue":"draw";match.phase="finished";
  }
}
