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
type Revival = {state:"dead"; progressTicks:number; required:number} | {state:"revived"; mode:"read"|"paid"; at:number; weak:boolean; immuneUntil:number};
type Launcher = "locked"|"unlocked"|"test"|"ready";
export type SentryMode = "attack"|"defense"|"move";
type SentryStance = {mode:SentryMode; enhanced:boolean; switchedAt:number; ticks:Record<SentryMode,number>; enhancedTicks:Record<SentryMode,number>};
const stanceTicks=():Record<SentryMode,number>=>({attack:0,defense:0,move:0});
export type InfantryPerformance={chassis:"hp"|"power";launcher:"cooling"|"burst"};
type RobotSpec = { id:string; team:Team; heavy:boolean; maxHp:number; sentry?:boolean };
export type MatchRobot = RobotSpec & { hp:number; xp:number; performance:InfantryPerformance|null; powerBuffer:number; powerDemand:number; powerLockUntil:number; powerBoostUntil:number; ammo:number; cooldown:number; heat:number; heatLimit:number; cooling:number; thermalLock:false|"cooling"|"permanent"; lastCombat:number; pendingAmmoAt:number|null; pendingHealAt:number|null; zones:Partial<Record<ZoneId,number>>; fortressHold:number; fortressRetainUntil:number; paidRevives:number; revival:Revival|null; repairCarry:number; sentrySupplyMinutes:number; stance:SentryStance|null; launcher:Launcher };
export type EnergySpawn = {id:string; team:Team; position:ArenaPosition};
export type EnergyUnit = {id:string; team:Team; location:
  | {kind:"rack"|"ground";position:ArenaPosition}
  | {kind:"carried";robot:string;position:ArenaPosition}
};
const copyPosition=(p:ArenaPosition):ArenaPosition=>({x:p.x,y:p.y,z:p.z});
const horizontalDistance=(a:ArenaPosition,b:ArenaPosition)=>Math.hypot(a.x-b.x,a.z-b.z);
// Training reach from the chassis center, not a claim about real gripper dimensions.
const ENERGY_REACH=1.4;
export type Territory = { controller:Team; full:boolean; progress:number };
type Rune = {usedSmall:number;usedLarge:number;largeWins:number;attempt:null|{large:boolean;end:number;deadline:number;lit:number[];groups:number;rings:number[];second:boolean;completed?:number[];a:number;w:number};attack:number;defense:number;cooling:number;activatedUntil:number;xpBonusRemaining:number};
type Side = { coins:number; purchased:number; purchased42:number; baseGap:number; controlGap:number; baseLow:number; fortressHolder:string|null; fortressSpent:number; base:number; outpost:number; outpostOwner:Team; outpostArea:Territory; baseArea:Territory; controlTicks:number; damage:number; cover:boolean; stopped:boolean; rune:Rune };
export type Match = { energyUnits:EnergyUnit[]; elapsed: number; phase: "ready" | "running" | "finished"; winner: Team | "draw" | null; sides: Record<Team, Side>; robots: MatchRobot[]; pose: MechanismPose; direction: number; outpostDirection: number };
export function createMatch(robots: readonly RobotSpec[], direction = Math.random()<.5?-1:1, outpostDirection = Math.random()<.5?-1:1, energySpawns:readonly EnergySpawn[]=[]): Match {
  const area=(team:Team):Territory=>({controller:team,full:true,progress:0});
  const side = (team:Team): Side => ({coins:800,purchased:0,purchased42:0,baseGap:0,controlGap:0,baseLow:10000,fortressHolder:null,fortressSpent:0,base:10000,outpost:1000,outpostOwner:team,outpostArea:area(team),baseArea:area(team),controlTicks:0,damage:0,cover:false,stopped:false,rune:{usedSmall:0,usedLarge:0,largeWins:0,attempt:null,attack:1,defense:0,cooling:1,activatedUntil:0,xpBonusRemaining:0}});
  return {energyUnits:energySpawns.map(u=>({id:u.id,team:u.team,location:{kind:"rack",position:copyPosition(u.position)}})),elapsed:0, phase:"ready", winner:null, sides:{red:side("red"),blue:side("blue")}, robots:robots.map(r=>({...r,hp:r.maxHp,xp:0,performance:!r.heavy&&!r.sentry?{chassis:"hp",launcher:"cooling"}:null,powerBuffer:60,powerDemand:0,powerLockUntil:0,powerBoostUntil:0,ammo:r.sentry?300:0,cooldown:0,heat:0,heatLimit:r.heavy?0:r.sentry?100:40,cooling:r.heavy?0:r.sentry?10:12,thermalLock:false,lastCombat:-6,pendingAmmoAt:null,pendingHealAt:null,zones:{},fortressHold:0,fortressRetainUntil:0,paidRevives:0,revival:null,repairCarry:0,sentrySupplyMinutes:0,stance:r.sentry?{mode:"move",enhanced:false,switchedAt:-50,ticks:stanceTicks(),enhancedTicks:stanceTicks()}:null,launcher:r.heavy?"locked":"ready"})), pose:{runeAngle:0,outpostAngle:{red:0,blue:0},cover:{red:0,blue:0}},direction,outpostDirection};
}
// V1.0.0 tables 5-15, 5-17 and 5-18: default HP/cooling priority.
const XP_LEVELS=[0,550,1100,1650,2200,2750,3300,3850,4400,5000];
const infantry=(r:RobotSpec)=>!r.heavy&&!r.sentry;
// Table 5-12 caps infantry at level 5 until real level-two assembly.
// The timed 42mm fallback does not grant assembly rewards.
const TRAINING_LEVEL_CAP=5;
const levelFromXp=(xp:number)=>Math.min(TRAINING_LEVEL_CAP,XP_LEVELS.filter(x=>xp>=x).length);
export const robotLevel=(r:MatchRobot)=>infantry(r)?levelFromXp(r.xp):1;
// Tables 5-17/18. Selection is only possible before the round starts.
const INFANTRY_CHASSIS={
  hp:{hp:[200,225,250,275,300,325,350,375,400,400],power:[45,50,55,60,65,70,75,80,90,100]},
  power:{hp:[150,175,200,225,250,275,300,325,350,400],power:[60,65,70,75,80,85,90,95,100,100]},
};
const INFANTRY_LAUNCHER={
  cooling:{heat:[40,48,56,64,72,80,88,96,104,120],cooling:[12,14,16,18,20,22,24,26,28,30]},
  burst:{heat:[170,180,190,200,210,220,230,240,250,260],cooling:[5,7,9,11,12,13,14,16,18,20]},
};
function refreshInfantry(r:MatchRobot){
  const index=robotLevel(r)-1,chassis=INFANTRY_CHASSIS[r.performance?.chassis??"hp"],launcher=INFANTRY_LAUNCHER[r.performance?.launcher??"cooling"];
  const hp=chassis.hp[index];r.hp=Math.min(hp,r.hp+hp-r.maxHp);r.maxHp=hp;r.heatLimit=launcher.heat[index];r.cooling=launcher.cooling[index];
}
export function selectInfantryPerformance(match:Match,id:string,performance:InfantryPerformance){
  const r=match.robots.find(r=>r.id===id);
  if(match.phase!=="ready"||!r?.performance||!["hp","power"].includes(performance.chassis)||!["cooling","burst"].includes(performance.launcher))return false;
  r.performance={...performance};refreshInfantry(r);return true;
}

// §5.7.2 / table 5-28. All durations share the referee's 10 Hz ticks.
export function sentryStatus(match:Match,r:MatchRobot){
  const s=r.stance;
  if(!s)return null;
  const tick=Math.floor((match.elapsed+1e-8)*10);
  return {mode:s.mode,enhanced:s.enhanced,cooldown:Math.max(0,(s.switchedAt+50-tick)/10),
    degraded:s.ticks[s.mode]>1800,remaining:Object.fromEntries((["attack","defense","move"] as const).map(mode=>[mode,(150-s.enhancedTicks[mode])/10])) as Record<SentryMode,number>};
}
export function switchSentry(match:Match,id:string,mode:SentryMode,enhanced=false){
  const r=match.robots.find(r=>r.id===id),s=r?.stance;
  if(match.phase!=="running"||!r||!s||r.hp<=0||!["attack","defense","move"].includes(mode))return false;
  const tick=Math.floor((match.elapsed+1e-8)*10);
  if(tick<s.switchedAt+50||(s.mode===mode&&s.enhanced===enhanced)||(enhanced&&s.enhancedTicks[mode]>=150))return false;
  s.mode=mode;s.enhanced=enhanced;s.switchedAt=tick;
  if(mode==="attack"&&enhanced){r.heat=0;if(r.thermalLock!=="permanent")r.thermalLock=false;}
  return true;
}
function advanceStance(r:MatchRobot){
  const s=r.stance;if(!s||r.hp<=0)return;
  s.ticks[s.mode]++;
  if(s.enhanced&&++s.enhancedTicks[s.mode]>=150)s.enhanced=false;
}
// §5.1.4 / tables 5-16, 5-17; the current kinematic preview does not
// measure motor current. Its movement command supplies an estimated demand.
export function powerLimit(match:Match,r:MatchRobot,time=match.elapsed){
  const base=r.heavy?50:r.sentry?60:INFANTRY_CHASSIS[r.performance?.chassis??"hp"].power[robotLevel(r)-1];
  const paid=time<r.powerBoostUntil;
  const s=r.stance;
  if(!s)return Math.min(200,base*(paid?2:1));
  if(s.mode==="move")return s.enhanced?200:Math.round(Math.min(200,base*Math.max(paid?2:1,s.ticks.move>1800?1.2:1.5)));
  return Math.round(Math.min(200,base*(paid?2:1))/2);
}
export function chassisStatus(match:Match,r:MatchRobot){
  return {limit:powerLimit(match,r),buffer:r.powerBuffer,locked:Math.max(0,r.powerLockUntil-match.elapsed)};
}
export function driveSpeed(match:Match,r:MatchRobot,command:0|1|2){
  // Explicit training approximation: normal motion commands the limit,
  // sprint commands twice that demand; speed scales with sqrt(power).
  r.powerDemand=match.phase==="running"&&r.hp>0&&match.elapsed>=r.powerLockUntil?command:0;
  return r.hp>0&&match.elapsed>=r.powerLockUntil?2.6*Math.sqrt(powerLimit(match,r)*command/45):0;
}
function advancePower(match:Match,r:MatchRobot,tick:number){
  if(r.hp<=0)return;
  const time=tick/10;
  // Paid-revive power expires by this tick, not by the end of a large step.
  const limit=powerLimit(match,r,time);
  const demand=time<r.powerLockUntil?0:limit*r.powerDemand;
  r.powerBuffer=Math.min(60,Math.max(0,r.powerBuffer-(demand-limit)*.1));
  if(r.powerBuffer===0&&demand>limit){r.powerLockUntil=time+5;r.powerDemand=0;}
}
const roundedXp=(value:number)=>Math.round(value*10)/10;
function gainXp(match:Match,r:MatchRobot,amount:number){
  if(!infantry(r)||r.hp<=0||amount<=0)return;
  const remaining=Math.max(0,XP_LEVELS[TRAINING_LEVEL_CAP-1]-r.xp);
  if(remaining===0)return;
  amount=Math.min(amount,remaining);
  const rune=match.sides[r.team].rune;
  const bonus=rune.activatedUntil>match.elapsed?Math.min(amount,rune.xpBonusRemaining,remaining-amount):0;
  rune.xpBonusRemaining=roundedXp(rune.xpBonusRemaining-bonus);
  const previous=robotLevel(r);
  r.xp=roundedXp(r.xp+amount+bonus);
  const level=robotLevel(r);
  if(level===previous)return;
  refreshInfantry(r);
}
function liveInfantry(match:Match,team:Team){
  return match.robots.filter(r=>r.team===team&&infantry(r)&&r.hp>0);
}
function shareXp(match:Match,team:Team,amount:number){
  const eligible=liveInfantry(match,team);
  for(const r of eligible)gainXp(match,r,roundedXp(amount/eligible.length));
}
function attackXp(match:Match,shooter:MatchRobot,amount:number,enemy?:MatchRobot){
  if(amount<=0)return;
  const recipients=infantry(shooter)?[shooter]:shooter.heavy?[]:liveInfantry(match,shooter.team);
  if(!recipients.length)return;
  const attackerLevel=levelFromXp(recipients.reduce((sum,r)=>sum+r.xp,0)/recipients.length);
  const victimLevel=enemy?robotLevel(enemy):1;
  const kill=enemy?.hp===0?50*victimLevel*(1+.2*Math.max(0,victimLevel-attackerLevel)):0;
  for(const r of recipients)gainXp(match,r,roundedXp(amount/recipients.length));
  if(kill)for(const r of recipients)gainXp(match,r,roundedXp(kill/recipients.length));
}
export function startMatch(match: Match) {
  if(match.phase==="ready") match.phase="running";
}
// RMUC 2027 V1.0.0: §3.1, §5.1.3, §5.4.2, table 5-7 and table 5-18.
// Infantry: level 1 cooling-priority; controllable sentry: semi-automatic.
// Heavy timed fallback per §5.7.1; physical technology-core assembly is not yet bound.
const weak=(r:MatchRobot)=>r.revival?.state==="revived"&&r.revival.weak;
const logistics=(match:Match,team:Team)=>1-(10000-match.sides[team].base)/20000;
const inSupply=(match:Match,r:MatchRobot)=>activeZone(match,r,`${r.team}-supply`);
const ownOutpost=(match:Match,r:MatchRobot)=>teams.some(t=>controlsOutpost(match,t,r.team,true)&&activeZone(match,r,`${t}-outpost`));
const canUseLocalSupply=(match:Match,r:MatchRobot)=>inSupply(match,r)||ownOutpost(match,r)||activeZone(match,r,`${r.team}-base`);
export function ammoOffer(match:Match,robot:MatchRobot){
  const side=match.sides[robot.team],local=canUseLocalSupply(match,robot);
  const count=robot.heavy?(local?1:10):(local?10:100),cost=local?10:150;
  return {count,cost,local,allowed:match.phase==="running"&&(!robot.heavy||robot.launcher!=="locked")&&robot.hp>0&&!weak(robot)&&
    (local||match.elapsed-robot.lastCombat>=6)&&robot.pendingAmmoAt===null&&side.coins>=cost&&(robot.heavy?side.purchased42+count<=100:side.purchased+count<=1000)};
}
export const canPurchaseAmmo=(match:Match,robot:MatchRobot)=>ammoOffer(match,robot).allowed;
export function purchaseAmmo(match:Match, id:string) {
  const robot=match.robots.find(r=>r.id===id);
  if(!robot)return false;
  const offer=ammoOffer(match,robot);
  if(!offer.allowed)return false;
  const side=match.sides[robot.team];
  side.coins-=offer.cost;
  if(robot.heavy)side.purchased42+=offer.count;else side.purchased+=offer.count;
  if(offer.local)robot.ammo+=offer.count;
  else robot.pendingAmmoAt=match.elapsed+6;
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
function carriedEnergy(match:Match,robot:MatchRobot){
  return match.energyUnits.filter(u=>u.location.kind==="carried"&&u.location.robot===robot.id);
}
function carriedPosition(position:ArenaPosition,index:number):ArenaPosition{
  return {x:position.x+(index===0?-.12:.12),y:position.y+1.1,z:position.z};
}
export function energyStatus(match:Match,robot:MatchRobot,position:ArenaPosition){
  const held=carriedEnergy(match,robot);
  const allowed=match.phase==="running"&&robot.heavy&&robot.hp>0&&!weak(robot);
  const pickup=allowed&&held.length<2?match.energyUnits.filter(u=>
    u.team===robot.team&&(u.location.kind==="ground"||u.location.kind==="rack"&&zonesAtPosition(position).includes(`${robot.team}-supply`))&&
    horizontalDistance(position,u.location.position)<=ENERGY_REACH&&Math.abs(u.location.position.y-position.y)<=1.4)
    .sort((a,b)=>horizontalDistance(position,a.location.position)-horizontalDistance(position,b.location.position))[0]?.id??null:null;
  return {carrying:held.length,pickup,canDrop:allowed&&held.length>0};
}
export function pickupEnergy(match:Match,id:string,position:ArenaPosition,unitId:string){
  const robot=match.robots.find(r=>r.id===id);
  if(!robot||energyStatus(match,robot,position).pickup!==unitId)return false;
  const unit=match.energyUnits.find(u=>u.id===unitId)!;
  unit.location={kind:"carried",robot:id,position:carriedPosition(position,carriedEnergy(match,robot).length)};
  return true;
}
export function dropEnergy(match:Match,id:string,position:ArenaPosition){
  const robot=match.robots.find(r=>r.id===id);
  if(!robot||!energyStatus(match,robot,position).canDrop)return false;
  const unit=carriedEnergy(match,robot)[0];
  unit.location={kind:"ground",position:{x:position.x,y:position.y+.075,z:position.z}};
  return true;
}
function releaseCarriedEnergy(match:Match,robot:MatchRobot,position?:ArenaPosition){
  for(const [i,unit] of carriedEnergy(match,robot).entries()){
    if(unit.location.kind!=="carried")continue;
    const p=position?carriedPosition(position,i):unit.location.position;
    unit.location={kind:"ground",position:{x:p.x,y:p.y-1.025,z:p.z}};
  }
}
function advanceEnergy(match:Match,positions:ReadonlyMap<string,ArenaPosition>){
  for(const robot of match.robots){
    const position=positions.get(robot.id);
    if(robot.hp<=0){releaseCarriedEnergy(match,robot,position);continue;}
    if(!position)continue;
    for(const [i,unit] of carriedEnergy(match,robot).entries())
      if(unit.location.kind==="carried")unit.location.position=carriedPosition(position,i);
  }
}
export function launcherStatus(match:Match,robot:MatchRobot){
  const s=match.sides[robot.team];
  return {state:robot.launcher,unlockIn:Math.max(0,Math.ceil(300-s.baseGap/50-2*s.controlGap/3-match.elapsed)),
    canInstall:match.phase==="running"&&robot.heavy&&robot.launcher==="unlocked"&&robot.hp>0&&!weak(robot)&&inSupply(match,robot)};
}
export function installLauncher(match:Match,id:string){
  const robot=match.robots.find(r=>r.id===id);
  if(!robot||!launcherStatus(match,robot).canInstall)return false;
  // Supply polygon is a provisional proxy for the workbench interaction.
  robot.launcher="test";return true;
}
// §5.6.4.9: a single defending robot receives the shared reserve and cooling.
function fortressActive(match:Match,r:MatchRobot){
  const side=match.sides[r.team];
  return side.fortressHolder===r.id&&r.hp>0&&!weak(r)&&!controlsOutpost(match,r.team,r.team);
}
function fortressLoss(side:Side){return 10000-Math.min(side.baseLow,side.base);}
export function reserveAmmo(match:Match,r:MatchRobot){
  const side=match.sides[r.team];
  return fortressActive(match,r)?Math.floor(Math.max(0,Math.min(500,100+Math.floor(fortressLoss(side)/15))-side.fortressSpent)/(r.heavy?10:1)):0;
}
function coolingRate(match:Match,r:MatchRobot){
  const side=match.sides[r.team];
  const s=r.stance;
  const stanceCooling=s?.mode==="attack"?s.ticks.attack>1800?2:3:1;
  const boosted=Math.max(r.cooling*side.rune.cooling,r.cooling*stanceCooling,r.cooling+(fortressActive(match,r)?Math.min(75,Math.floor(fortressLoss(side)/80)):0));
  return s&&s.mode!=="attack"?Math.round(boosted/3):boosted;
}
export function canFire(match:Match,robot:MatchRobot) {
  return match.phase==="running"&&(!robot.heavy||robot.launcher==="test"||robot.launcher==="ready")&&robot.hp>0&&!weak(robot)&&(robot.ammo>0||reserveAmmo(match,robot)>0)&&robot.cooldown<=0&&!robot.thermalLock;
}
export function fireRound(match:Match,id:string) {
  const robot=match.robots.find(r=>r.id===id);
  if(!robot||!canFire(match,robot)) return null;
  if(reserveAmmo(match,robot)>0)match.sides[robot.team].fortressSpent+=robot.heavy?10:1;else robot.ammo--;robot.cooldown=robot.heavy?.3:.18;robot.lastCombat=match.elapsed;
  if(robot.heavy&&robot.launcher==="test"){
    robot.launcher="ready";robot.hp+=600-robot.maxHp;robot.maxHp=600;robot.heatLimit=300;robot.cooling=100;
    return robot;
  }
  gainXp(match,robot,1);
  if(robot.stance?.enhanced&&robot.stance.mode==="attack"){robot.heat=0;robot.thermalLock=false;}
  else robot.heat+=robot.heavy?100:10;
  if(robot.heat>=robot.heatLimit+(robot.heavy?200:100))robot.thermalLock="permanent";
  else if(robot.heat>robot.heatLimit)robot.thermalLock="cooling";
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
  const contested=teams.every(team=>match.robots.some(r=>r.team===team&&!weak(r)&&ids.some(id=>activeZone(match,r,id))));
  return {...area,contested};
}
function rebuildOutpost(side:Side,team:Team){
  side.outpost=500;side.outpostOwner=team;side.stopped=true;
}
export function revivalStatus(match:Match,robot:MatchRobot) {
  const r=robot.revival;
  const required=r?.state==="dead"?r.required/logistics(match,robot.team):0;
  const cost=Math.ceil(match.elapsed/60)*80+robotLevel(robot)*20;
  return {dead:robot.hp===0,weak:!!weak(robot),immune:immune(match,robot),cost,
    progress:r?.state==="dead"?Math.min(1,r.progressTicks/10/required):0,
    canConfirm:match.phase==="running"&&r?.state==="dead"&&r.progressTicks>=required*10-1e-8,
    canPay:match.phase==="running"&&r?.state==="dead"&&match.sides[robot.team].coins>=cost};
}
export function reviveRobot(match:Match,id:string,paid=false) {
  const robot=match.robots.find(r=>r.id===id);
  if(!robot)return false;
  const status=revivalStatus(match,robot);
  if(paid?!status.canPay:!status.canConfirm)return false;
  const at=Math.floor((match.elapsed+1e-8)*10);
  if(paid){match.sides[robot.team].coins-=status.cost;robot.paidRevives++;robot.powerBoostUntil=at/10+4;}
  robot.hp=paid?robot.maxHp:Math.round(robot.maxHp*.1);
  robot.revival={state:"revived",mode:paid?"paid":"read",at,weak:true,immuneUntil:at+(paid?30:300)};
  robot.repairCarry=0;
  return true;
}
function immune(match:Match,r:MatchRobot){
  return r.hp>0&&((r.revival?.state==="revived"&&r.revival.immuneUntil>Math.floor((match.elapsed+1e-8)*10))||
    (r.heavy&&inSupply(match,r)&&!weak(r)));
}
function robotDefense(match:Match,robot:MatchRobot) {
  let defense=match.sides[robot.team].rune.defense;
  if(robot.heavy&&robot.launcher!=="ready"&&match.elapsed<180)defense=Math.max(defense,.5);
  const stance=robot.stance;
  if(stance?.mode==="defense")defense=Math.max(defense,stance.enhanced?.99:stance.ticks.defense>1800?.25:.5);
  const stanceVulnerability=stance&&stance.mode!=="defense"?.25:0;
  if(weak(robot))return 1-defense+stanceVulnerability;
  if(activeZone(match,robot,`${robot.team}-base`))defense=Math.max(defense,.5);
  if(teams.some(t=>activeZone(match,robot,`${t}-central`)))defense=Math.max(defense,.25);
  if(fortressActive(match,robot))defense=Math.max(defense,.5);
  const vulnerable=activeZone(match,robot,`${opponent(robot.team)}-fortress`)&&!match.sides[opponent(robot.team)].cover;
  return 1-defense+Math.max(stanceVulnerability,vulnerable?1:0);
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
      const holder=match.robots.find(r=>!weak(r)&&active(r,zone.id))?.team;
      const eligible=candidates.filter(r=>!weak(r));
      const entrants=new Set(eligible.map(r=>r.team));
      // Simultaneous first detection is a tie, rather than favoring a roster order.
      const allowed=holder??(entrants.size===1?eligible[0].team:undefined);
      for(const r of eligible)if(r.team===allowed)r.zones[zone.id]=tick+20;
    }else for(const r of candidates)r.zones[zone.id]=tick+20;
  }
  for(const r of match.robots){
    const revival=r.revival;
    if(r.hp===0){
      if(revival?.state==="dead")revival.progressTicks+=raw.get(r.id)?.includes(`${r.team}-supply`)||match.sides[r.team].base<4000?4:1;
      continue;
    }
    const supply=active(r,`${r.team}-supply`),base=active(r,`${r.team}-base`);
    const outpost=teams.some(t=>controlsOutpost(match,t,r.team,true)&&active(r,`${t}-outpost`));
    if(revival?.state==="revived"){
      if(revival.mode==="paid"&&tick>=revival.at+30)revival.weak=false;
      if(revival.mode==="read"&&revival.weak&&(supply||base||outpost)){
        revival.weak=false;revival.immuneUntil=Math.min(revival.immuneUntil,Math.max(tick,revival.at+100));
      }
      if(!revival.weak&&tick>=revival.immuneUntil)r.revival=null;
    }
    if(weak(r))continue;
    if(r.sentry&&supply){
      const available=Math.floor(tick/600)-r.sentrySupplyMinutes;
      if(available>0){r.ammo+=available*100;r.sentrySupplyMinutes+=available;}
    }
    if((supply||outpost)&&r.hp<r.maxHp){
      const rate=tick>=2400&&tick/10-r.lastCombat>=6?.25:.1;
      // The greatest simultaneous healing effect applies, not their sum.
      r.repairCarry+=r.maxHp*rate*logistics(match,r.team)*(supply?1:.5)/10;
      const healing=Math.round(r.repairCarry+1e-8);
      r.repairCarry-=healing;r.hp=Math.min(r.maxHp,r.hp+healing);
    }
    if(r.hp===r.maxHp)r.repairCarry=0;
  }
  for(const team of teams){
    const side=match.sides[team],zone=`${team}-fortress` as const;
    const eligible=(r:MatchRobot)=>r.team===team&&!weak(r)&&active(r,zone);
    if(controlsOutpost(match,team,team)){side.fortressHolder=null;continue;}
    if(!match.robots.some(r=>r.id===side.fortressHolder&&eligible(r)))
      side.fortressHolder=match.robots.find(eligible)?.id??null;
  }
  // Cooling at the same referee tick as zone activation, so replay time
  // steps cannot cool an entire interval using a stale fortress owner.
  for(const r of match.robots){
    advancePower(match,r,tick);
    r.heat=r.stance?.mode==="attack"&&r.stance.enhanced?0:Math.max(0,r.heat-coolingRate(match,r)/10);
    if(r.heat<1e-8){r.heat=0;if(r.thermalLock!=="permanent")r.thermalLock=false;}
    advanceStance(r);
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
      const present=(team:Team)=>match.robots.some(r=>r.team===team&&!weak(r)&&ids.some(id=>active(r,id)));
      const own=present(area.controller),other=present(opponent(area.controller));
      if(own&&other)continue;
      const progressing=area.full?other:!own;
      area.progress=Math.max(0,Math.min(50,area.progress+(progressing?1:-1)));
      if(area.progress<50)continue;
      area.controller=opponent(area.controller);area.full=!area.full;area.progress=0;
      if(kind==="outpost"&&area.full&&side.outpost===0)rebuildOutpost(side,area.controller);
    }
    if(controlsOutpost(match,location,location))side.fortressHolder=null;
    if(side.cover)continue;
    for(const robot of match.robots){
      if(robot.team===location)continue;
      if(!weak(robot)&&tick>=1800&&controlsOutpost(match,location,robot.team)&&active(robot,`${location}-fortress`)){
        robot.fortressHold++;robot.fortressRetainUntil=tick+30;
        if(robot.fortressHold>=100){side.cover=true;coverOpened[location]=tick/10;break;}
      }else if(tick>robot.fortressRetainUntil)robot.fortressHold=0;
    }
  }
}

// §5.6.3: two independent team attempts share the physical rotation axis.
const runeAvailable=(m:Match,r:Rune)=>m.elapsed<180?1+Number(m.elapsed>=90)-r.usedSmall:1+Number(m.elapsed>=255)+Number(m.elapsed>=330)-r.usedLarge;
const chooseArms=(n:number,excluded:number[]=[]):number[]=>{
  const pool=[0,1,2,3,4].filter(i=>!excluded.includes(i)),result:number[]=[];
  while(result.length<n&&pool.length)result.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  return result;
};
export function runeStatus(m:Match,team:Team){
  const r=m.sides[team].rune;
  return {available:runeAvailable(m,r),active:r.attempt!==null,lit:r.attempt?.lit??[],groups:r.attempt?.groups??0,large:m.elapsed>=180,buff:Math.max(0,r.activatedUntil-m.elapsed),attack:r.attack,defense:r.defense,cooling:r.cooling};
}
export function runeLights(m:Match,team:Team){
  const r=m.sides[team].rune;
  if(r.activatedUntil>m.elapsed)return [0,1,2,3,4];
  return [...(r.attempt?.completed??[]),...(r.attempt?.lit??[])];
}
export function activateRune(m:Match,id:string){
  const robot=m.robots.find(r=>r.id===id);
  if(m.phase!=="running"||!robot||robot.heavy||robot.hp<=0||weak(robot))return false;
  const r=m.sides[robot.team].rune;
  if(r.attempt||r.activatedUntil>m.elapsed||runeAvailable(m,r)<=0)return false;
  const large=m.elapsed>=180;
  if(large)r.usedLarge++;else r.usedSmall++;
  r.attempt={large,end:m.elapsed+20,deadline:m.elapsed+2.5,lit:chooseArms(large?2:1),groups:0,rings:[],second:false,a:.780+Math.random()*(1.045-.780),w:1.884+Math.random()*(2-1.884)};
  return true;
}
function resetRuneAttempt(r:Rune,at:number){
  const a=r.attempt!;
  a.groups=0;a.rings=[];a.completed=[];a.lit=chooseArms(a.large?2:1);a.second=false;a.deadline=at+2.5;
}
function finishRune(match:Match,team:Team,at:number){
  const r=match.sides[team].rune,a=r.attempt!;
  if(a.large){
    const mean=a.rings.reduce((sum,n)=>sum+n,0)/a.rings.length;
    r.attack=mean<=7?1.5:mean<=9?2:3;
    r.defense=mean>9?.5:.25;
    r.cooling=mean<=3?1:mean<=8?2:mean<=9?3:5;
    r.activatedUntil=at+([30,35,40,45,50,60][a.rings.length-5]??30);
    r.largeWins++;r.xpBonusRemaining=0;shareXp(match,team,750);
  }else{r.attack=1;r.defense=.25;r.cooling=1;r.activatedUntil=at+45;r.xpBonusRemaining=1200;}
  r.attempt=null;
}
function advanceRune(match:Match,team:Team,at:number){
  const r=match.sides[team].rune,a=r.attempt;
  if(a&&at>=a.end){r.attempt=null;}
  else if(a&&at>=a.deadline){
    if(a.second){
      if(a.groups===5)finishRune(match,team,a.deadline);
      else{a.second=false;a.lit=chooseArms(2);a.deadline=at+2.5;}
    }else resetRuneAttempt(r,at);
  }
  if(r.activatedUntil<=at){r.attack=1;r.defense=0;r.cooling=1;r.xpBonusRemaining=0;}
}
function hitRune(m:Match,shooter:MatchRobot,target:Extract<Target,{type:"rune"}>){
  if(shooter.heavy||target.team!==shooter.team)return;
  const r=m.sides[shooter.team].rune,a=r.attempt;
  if(!a||m.elapsed>=a.end)return;
  if(a.large&&target.ring<(r.largeWins>=2?7:r.largeWins===1?4:1))return;
  if(!a.lit.includes(target.arm)){resetRuneAttempt(r,m.elapsed);return;}
  if(!a.large){
    a.rings.push(target.ring);a.groups++;
    if(a.groups===5){finishRune(m,shooter.team,m.elapsed);return;}
    // Small rune lights each of the five arms exactly once.
    const completed=a.completed??[];
    completed.push(target.arm);a.completed=completed;
    a.lit=chooseArms(1,completed);a.deadline=m.elapsed+2.5;
  }else if(!a.second){
    a.groups++;a.rings.push(target.ring);a.lit=a.lit.filter(i=>i!==target.arm);a.second=true;a.deadline=m.elapsed+1;
  }else{
    a.rings.push(target.ring);
    if(a.groups===5){finishRune(m,shooter.team,m.elapsed);return;}
    a.second=false;a.lit=chooseArms(2);a.deadline=m.elapsed+2.5;
  }
}

export type Target = {type:"robot";id:string}|{type:"outpost"|"base";team:Team}|{type:"rune";team:Team;arm:number;ring:number};
export function damageTarget(match:Match,shooter:MatchRobot,target:Target) {
  if(match.phase!=="running") return 0;
  const side=match.sides[shooter.team];
  if(target.type==="rune"){hitRune(match,shooter,target);return 0;}
  if(target.type==="robot"){
    const enemy=match.robots.find(r=>r.id===target.id);
    if(!enemy||enemy.team===shooter.team||enemy.hp<=0||immune(match,enemy))return 0;
    const amount=Math.min(enemy.hp,Math.max(0,Math.round((shooter.heavy?200:20)*side.rune.attack*robotDefense(match,enemy))));
    enemy.hp-=amount;side.damage+=amount;enemy.lastCombat=match.elapsed;
    if(enemy.hp===0){releaseCarriedEnergy(match,enemy);enemy.powerDemand=0;enemy.powerBoostUntil=0;enemy.heat=0;if(enemy.thermalLock!=="permanent")enemy.thermalLock=false;enemy.pendingAmmoAt=null;enemy.pendingHealAt=null;enemy.zones={};enemy.repairCarry=0;enemy.revival={state:"dead",progressTicks:0,required:Math.round(10+match.elapsed/10+20*enemy.paidRevives)};}
    attackXp(match,shooter,amount*4,enemy);
    return amount;
  }
  const enemy=match.sides[target.team];
  const owner=target.type==="outpost"?enemy.outpostOwner:target.team;
  if(owner===shooter.team)return 0;
  // Base damage is available to the referee only after the protection
  // conditions are satisfied. Physical base detector binding is pending.
  if(target.type==="base"&&(controlsOutpost(match,target.team,target.team,true)||!enemy.cover))return 0;
  const amount=Math.min(enemy[target.type],Math.round((shooter.heavy?200:20)*side.rune.attack*(1-match.sides[owner].rune.defense)));
  enemy[target.type]-=amount;side.damage+=amount;
  if(target.type==="base")enemy.baseLow=Math.min(enemy.baseLow,enemy.base);
  attackXp(match,shooter,target.type==="outpost"?amount*2:Math.ceil(amount/2));
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
  const end=Math.min(MATCH_DURATION,match.elapsed+Math.max(0,dt));
  // Stop at rune state boundaries: cooling and shared-axis speed must not
  // continue using an expired bonus/attempt during a long frame or a replay.
  do{
    let next=end;
    for(const team of teams){
      const rune=match.sides[team].rune;
      for(const at of [rune.attempt?.end,rune.attempt?.deadline,rune.activatedUntil]){
        if(at!==undefined&&at>match.elapsed&&at<next)next=at;
      }
    }
    advanceMatch(match,next-match.elapsed,positions);
  }while(match.phase==="running"&&match.elapsed<end);
}
function advanceMatch(match:Match,dt:number,positions:ReadonlyMap<string,ArenaPosition>){

  const before=match.elapsed;match.elapsed+=dt;
  advanceEnergy(match,positions);
  for(const second of [61,121,181,241,301,361]) if(before<second&&match.elapsed>=second)
    for(const team of teams)match.sides[team].coins+=second===361?300:100;
  const coolingTicks=Math.floor((match.elapsed+1e-8)*10)-Math.floor((before+1e-8)*10);
  for(const r of match.robots){
    r.cooldown=r.cooldown-dt>1e-8?r.cooldown-dt:0;
    if(r.pendingAmmoAt!==null&&match.elapsed>=r.pendingAmmoAt){
      if(r.hp>0)r.ammo+=r.heavy?10:100;
      r.pendingAmmoAt=null;
    }
    if(r.pendingHealAt!==null&&match.elapsed>=r.pendingHealAt){
      if(r.hp>0)r.hp=Math.min(r.maxHp,r.hp+Math.round(r.maxHp*.6*logistics(match,r.team)));
      r.pendingHealAt=null;
    }
  }
  // Shared axis: large active uses a single legal speed curve;
  // identical phase for both sides, rather than physically impossible independent rotors.
  const active=teams.map(t=>match.sides[t].rune.attempt).find(a=>a?.large);
  if(active){
    const start=active.end-20,a=active.a,w=active.w,b=2.09-a;
    match.pose.runeAngle+=match.direction*(b*dt+a/w*(Math.cos(w*(before-start))-Math.cos(w*(match.elapsed-start))));
  }else match.pose.runeAngle+=match.direction*Math.PI/3*dt;
  const coverOpened:Partial<Record<Team,number>>={};
  if(coolingTicks>0){
    const raw=new Map([...positions].map(([id,p])=>[id,zonesAtPosition(p)]));
    const first=Math.floor((before+1e-8)*10)+1;
    for(let tick=first;tick<first+coolingTicks;tick++)advanceTerritories(match,tick,raw,coverOpened);
  }
  for(const team of teams){
    const side=match.sides[team],enemy=match.sides[opponent(team)];
    side.baseGap=Math.max(side.baseGap,enemy.base-side.base);
    side.controlGap=Math.max(side.controlGap,(enemy.controlTicks-side.controlTicks)/10);
    for(const r of match.robots)if(r.team===team&&r.heavy&&r.launcher==="locked"&&match.elapsed>=300-side.baseGap/50-2*side.controlGap/3)r.launcher="unlocked";
    advanceRune(match,team,match.elapsed);
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
