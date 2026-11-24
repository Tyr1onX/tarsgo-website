import type { Team, MechanismPose } from "./rmuc-3d-mechanisms.ts";
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
export type MatchRobot = RobotSpec & { hp:number; ammo:number; cooldown:number; heat:number; heatLimit:number; cooling:number; thermalLock:boolean; lastCombat:number; pendingAmmoAt:number|null };
type Side = { coins: number; purchased: number; base: number; outpost: number; control: number; damage: number; cover: boolean; stopped: boolean; buff: number; runeHits: number[]; siege: number };
export type Match = { elapsed: number; phase: "ready" | "running" | "finished"; winner: Team | "draw" | null; sides: Record<Team, Side>; robots: MatchRobot[]; pose: MechanismPose; direction: number; outpostDirection: number };
export function createMatch(robots: readonly RobotSpec[], direction = Math.random()<.5?-1:1, outpostDirection = Math.random()<.5?-1:1): Match {
  const side = (): Side => ({ coins:800, purchased:0, base:10000, outpost:1000, control:0, damage:0, cover:false, stopped:false, buff:0, runeHits:[], siege:0 });
  return {elapsed:0, phase:"ready", winner:null, sides:{red:side(),blue:side()}, robots:robots.map(r=>({...r,hp:r.maxHp,ammo:r.sentry?300:0,cooldown:0,heat:0,heatLimit:r.heavy?0:r.sentry?100:40,cooling:r.heavy?0:r.sentry?10:12,thermalLock:false,lastCombat:-6,pendingAmmoAt:null})), pose:{runeAngle:0,outpostAngle:{red:0,blue:0},cover:{red:0,blue:0}},direction,outpostDirection};
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
    const amount=Math.min(enemy.hp,match.sides[enemy.team].buff>0?15:20);
    enemy.hp-=amount;side.damage+=amount;enemy.lastCombat=match.elapsed;
    if(enemy.hp===0){enemy.heat=0;enemy.thermalLock=false;enemy.pendingAmmoAt=null;}
    return amount;
  }
  if(target.team===shooter.team)return 0;
  const enemy=match.sides[target.team];
  if(target.type==="base"&&(enemy.outpost>0||!enemy.cover))return 0;
  const amount=Math.min(enemy[target.type],enemy.buff>0?15:20);
  enemy[target.type]-=amount;side.damage+=amount;
  if(target.type==="outpost"&&enemy.outpost===0) enemy.stopped=true;
  return amount;
}
// The training rules intentionally omit formal zone capture, reconstruction,
// assembly. Outpost destruction serves as a training capture trigger.
export function updateMatch(match:Match, dt:number, siege: Record<Team,boolean> = {red:false,blue:false}) {
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
  }
  match.pose.runeAngle+=match.direction*Math.PI/3*dt;
  const coverOpened:Partial<Record<Team,number>>={};
  for(const team of teams){
    const side=match.sides[team], enemy=match.sides[opponent(team)];
    side.buff=Math.max(0,side.buff-dt);
    // A training proximity zone represents the fortress interaction card.
    if(match.elapsed>=180&&side.outpost===0&&!side.cover){
      const eligibleDt=match.elapsed-Math.max(before,180);
      const previous=side.siege;
      side.siege=siege[team]?Math.min(10,side.siege+eligibleDt):0;
      if(side.siege>=10){side.cover=true;coverOpened[team]=Math.max(before,180)+10-previous;}
    }
    match.pose.cover[team]=Math.min(1,Math.max(0,match.pose.cover[team]+(side.cover?dt:-dt)));
    // Only this training substitute for captured outposts is counted.
    if(enemy.outpost===0) side.control+=dt;
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
    const differences=r.base===0||b.base===0?[r.base-b.base]:[r.control-b.control,r.damage-b.damage,hp("red")-hp("blue")];
    const delta=differences.find(d=>Math.abs(d)>1e-7)??0;
    match.winner=delta>0?"red":delta<0?"blue":"draw";match.phase="finished";
  }
}
