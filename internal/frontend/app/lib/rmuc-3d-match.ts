import type { Team, MechanismPose } from "./rmuc-3d-mechanisms.ts";
export type { Team };
export const MATCH_DURATION = 420;
const teams = ["red", "blue"] as const;
const opponent = (t: Team): Team => t === "red" ? "blue" : "red";
export type MatchRobot = { id: string; team: Team; hp: number; maxHp: number; ammo: number; cooldown: number; heavy: boolean };
type Side = { coins: number; purchased: number; base: number; outpost: number; control: number; damage: number; cover: boolean; stopped: boolean; buff: number; runeHits: number[]; siege: number };
export type Match = { elapsed: number; phase: "ready" | "running" | "finished"; winner: Team | "draw" | null; sides: Record<Team, Side>; robots: MatchRobot[]; pose: MechanismPose; direction: number; outpostDirection: number };
export function createMatch(robots: readonly {id:string;team:Team;heavy:boolean;maxHp:number}[], direction = Math.random()<.5?-1:1, outpostDirection = Math.random()<.5?-1:1): Match {
  const side = (): Side => ({ coins:800, purchased:0, base:10000, outpost:1000, control:0, damage:0, cover:false, stopped:false, buff:0, runeHits:[], siege:0 });
  return {elapsed:0, phase:"ready", winner:null, sides:{red:side(),blue:side()}, robots:robots.map(r=>({...r,hp:r.maxHp,ammo:0,cooldown:0})), pose:{runeAngle:0,outpostAngle:{red:0,blue:0},cover:{red:0,blue:0}},direction,outpostDirection};
}
export function startMatch(match: Match) {
  if(match.phase==="ready") match.phase="running";
}
// Training preset: only 17 mm-style virtual attacks. The heavy is a visual
// stand-in until its official assembly and 42 mm unlock system is implemented.
export function purchaseAmmo(match:Match, id:string) {
  if(match.phase!=="running") return false;
  const robot=match.robots.find(r=>r.id===id);
  if(!robot||robot.hp<=0) return false;
  const side=match.sides[robot.team];
  if(side.coins<150||side.purchased+100>1000) return false;
  side.coins-=150;side.purchased+=100;robot.ammo+=100;
  return true;
}
export function fireRound(match:Match,id:string) {
  const robot=match.robots.find(r=>r.id===id);
  if(match.phase!=="running"||!robot||robot.hp<=0||robot.ammo<=0||robot.cooldown>0) return null;
  robot.ammo--;robot.cooldown=.18;
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
    enemy.hp-=amount;side.damage+=amount;return amount;
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
// heat and assembly. Outpost destruction serves as a training capture trigger.
export function updateMatch(match:Match, dt:number, siege: Record<Team,boolean> = {red:false,blue:false}) {
  if(match.phase!=="running")return;
  dt=Math.max(0,Math.min(dt,MATCH_DURATION-match.elapsed));
  const before=match.elapsed;match.elapsed+=dt;
  for(const second of [61,121,181,241,301,361]) if(before<second&&match.elapsed>=second)
    for(const team of teams)match.sides[team].coins+=second===361?300:100;
  for(const r of match.robots)r.cooldown=Math.max(0,r.cooldown-dt);
  match.pose.runeAngle+=match.direction*Math.PI/3*dt;
  for(const team of teams){
    const side=match.sides[team], enemy=match.sides[opponent(team)];
    side.buff=Math.max(0,side.buff-dt);
    // A training proximity zone represents the fortress interaction card.
    if(match.elapsed>=180&&side.outpost===0&&!side.cover){
      side.siege=siege[team]?Math.min(10,side.siege+dt):0;
      if(side.siege>=10)side.cover=true;
    }
    if(side.outpost===0||enemy.cover||match.elapsed>=180)side.stopped=true;
    if(!side.stopped)match.pose.outpostAngle[team]+=match.outpostDirection*.8*Math.PI*Math.min(1,match.elapsed/5)*dt;
    match.pose.cover[team]=Math.min(1,Math.max(0,match.pose.cover[team]+(side.cover?dt:-dt)));
    // Only this training substitute for captured outposts is counted.
    if(enemy.outpost===0) side.control+=dt;
  }
  if(match.elapsed>=MATCH_DURATION||teams.some(t=>match.sides[t].base===0)){
    const [r,b]=teams.map(t=>match.sides[t]);
    const hp=(t:Team)=>match.robots.filter(r=>r.team===t).reduce((sum,r)=>sum+r.hp,0);
    const differences=r.base===0||b.base===0?[r.base-b.base]:[r.control-b.control,r.damage-b.damage,hp("red")-hp("blue")];
    const delta=differences.find(d=>Math.abs(d)>1e-7)??0;
    match.winner=delta>0?"red":delta<0?"blue":"draw";match.phase="finished";
  }
}
