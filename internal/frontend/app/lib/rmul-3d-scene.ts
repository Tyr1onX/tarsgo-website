import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { frameArena, lookDirection, turnView } from "./rmuc-3d-camera";
import { resolveCadModel } from "./rmul-3d-cad-assets";
import { CORE_ASSET, DART_ASSET, MECHANISM_ASSET, installCoreGeometry, installMechanisms, type Team } from "./rmuc-3d-mechanisms";
import { createMatch, startMatch, updateMatch, purchaseAmmo, canPurchaseAmmo, purchaseHealth, canPurchaseHealth, remoteHealthCost, canFire, territoryStatus, ammoOffer, revivalStatus, reviveRobot, launcherStatus, installLauncher, removeLauncher, activateRune, runeStatus, runeLights, controlsOutpost, robotLevel, reserveAmmo, driveSpeed, chassisStatus, sentryStatus, switchSentry, type SentryMode, type SentryControl, selectSentryControl, sentryCommandCost, markSentry, type InfantryPerformance, selectInfantryPerformance, energyStatus, pickupEnergy, dropEnergy, assemblyStatus, beginAssembly, assemblyAction, cancelAssembly, technologyLevel, terrainStatus, canDriveRobot, armorStatus,fortifyArmor,recommendedArmorCenter,dartStatus,selectDart,openDart,launchDart,type DartMode, type Difficulty, type Match } from "./rmuc-3d-match";
import { traceArenaShot, prepareArenaShots, SHOT_RANGE, type ShotIndex, arenaHitTarget, bindArmorFrame, aliasArmorFrames } from "./rmuc-3d-shot";
import { createProjectileSystem, projectileSpeed } from "./rmuc-3d-projectiles";
import { addRobotPreviews, aimWeapon, previewWeaponAt, bindLauncherModule, setArmorLight } from "./rmuc-3d-robots";
import { createArenaTerrain, moveOnArena, nearestDriveable, supportedHeight, PLAYER_RADIUS, type ArenaTerrain } from "./rmuc-3d-terrain";
import { findArenaPath, stepChassis, turnTowards, angleDelta, type ChassisMotion } from "./rmuc-3d-navigation";
import { ARENA_ZONES, zonesAtPosition, launcherBench, type ZoneKind } from "./rmuc-3d-zones";
import { createStadium, STADIUM_WIDTH, STADIUM_DEPTH } from "./rmuc-3d-stadium";

export type FieldView = "all" | "red" | "blue" | "top";
export type ArenaView = FieldView | "first" | "third";
type SideStatus = { base:number; outpost:number; outpostOwner:Team; alive:number; control:number; outpostArea:ReturnType<typeof territoryStatus>; baseArea:ReturnType<typeof territoryStatus>; cover:boolean };
export type ArenaStatus = { view: ArenaView; robot: string | null; nearby: string | null; match?: { phase: Match["phase"]; seconds: number; winner: Match["winner"]; sides: Record<Team,SideStatus>; coins: number; ammo: number; reserve:number; power:ReturnType<typeof chassisStatus>|null; stance:ReturnType<typeof sentryStatus>; performance:InfantryPerformance|null; hp: number; level:number; xp:number|null; buff: number; rune:ReturnType<typeof runeStatus>|null; canBuy: boolean; canFire: boolean; heat: number; heatLimit: number; thermalLock: false|"cooling"|"permanent"; pendingAmmo: number; pendingHeal: number; healCost: number; canHeal: boolean; maxHp: number; ammoCount:number; ammoCost:number; revival:ReturnType<typeof revivalStatus>|null; launcher:ReturnType<typeof launcherStatus>|null; energy:ReturnType<typeof energyStatus>|null; technology:ReturnType<typeof assemblyStatus>|null; dart:ReturnType<typeof dartStatus>|null; armor:ReturnType<typeof armorStatus>|null; terrain:ReturnType<typeof terrainStatus>|null } };
export interface ArenaController {
  view: (side: ArenaView) => void;
  interact: () => void;
  start: () => void;
  buy: () => void;
  heal: () => void;
  revive: (paid:boolean) => void;
  fire: () => void;
  install: () => void;
  removeLauncher:()=>void;
  pickup: () => void;
  drop: () => void;
  assembly: (level:Difficulty)=>void;
  assemblyStep: (core:Team,step:2|3|4|5|6,angle:number)=>void;
  cancelAssembly:()=>void;
  rune: () => void;
  armorFortify:(x?:number,y?:number)=>void;
  dartSelect:(mode:DartMode)=>void;
  dartOpen:()=>void;
  dartFire:()=>void;
  stance: (mode:SentryMode,enhanced:boolean) => void;
  sentryControl:(mode:SentryControl)=>void;
  sentryMark:(kind: "supply"|"outpost"|"central"|"highpoint")=>void;
  performance:(value:InfantryPerformance)=>void;
  reset: () => void;
  input: (key: string, pressed: boolean) => void;
  pauseInput: (paused: boolean) => void;
  dispose: () => void;
}

type Robot = { object: THREE.Group; position: THREE.Vector3; radius: number; driveable: boolean; name: string; eyeHeight: number; wheelRadius: number };
const isPlaying = (view: ArenaView) => view === "first";

export function mountArena(
  host: HTMLDivElement,
  onBusy: () => void,
  onReady: () => void,
  onError: (message: string) => void,
  onStatus: (status: ArenaStatus) => void,
): ArenaController {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111922);
  scene.fog = new THREE.Fog(0x111922, 65, 180);
  const camera = new THREE.PerspectiveCamera(72, 1, .025, 220);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  // A small generated environment makes metal surfaces readable without any
  // downloaded textures. Direct lights still determine arena illumination.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04, .1, 100, { size: 128 });
  scene.environment = environment.texture;
  scene.environmentIntensity = .60;
  room.dispose();
  pmrem.dispose();
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "RMUC 2027 三维战场");
  host.appendChild(canvas);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .12;
  controls.enablePan = true;
  controls.enabled = false;
  scene.add(new THREE.HemisphereLight(0xdceaff, 0x50515b, 1.3));
  const sun = new THREE.DirectionalLight(0xfff4e7, 2.6);
  sun.position.set(-6, 13, 9);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(STADIUM_WIDTH + 8, STADIUM_DEPTH + 8),
    new THREE.MeshStandardMaterial({ color: 0x202b35, roughness: .85 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.06;
  scene.add(ground);
  const explorer = new THREE.Vector3();
  const stadium = createStadium();
  scene.add(stadium);

  let disposed = false, ready = false, frame = 0;
  let map: THREE.Group | null = null;
  let fieldBounds: THREE.Box3 | null = null;
  let exhibit: THREE.Group | null = null;
  let terrain: ArenaTerrain | null = null;
  let robots: Robot[] = [];
  let driving: Robot | null = null;
  let mechanism: ReturnType<typeof installMechanisms> | null = null;
  let coreGeometry: ReturnType<typeof installCoreGeometry> | null = null;
  let match: Match | null = null;
  let matchTime: number | null = null;
  let motionDebt=0;
  let nextBotTurn = 0;
  let botCursor = 0;
  const shotRay = new THREE.Raycaster();
  const projectiles=createProjectileSystem(scene);
  let decisionShotIndex:ShotIndex|undefined;
  const botPaths = new Map<Robot,{goal:THREE.Vector3;points:THREE.Vector3[];retryAt:number;search?:ReturnType<typeof findArenaPath>;tolerance:number}>();
  const motions=new Map<Robot,ChassisMotion>();
  const shotIntents=new Map<Robot,{point:THREE.Vector3;object?:THREE.Object3D;previous?:THREE.Vector3}>();
  const wheels=new Map<Robot,THREE.Object3D[]>();
  let fieldRobots:Robot[]=[];
  const positions=new Map<string,THREE.Vector3>();
  const motionFor=(bot:Robot)=>{let m=motions.get(bot);if(!m){m={speed:0,yaw:bot.object.rotation.y};motions.set(bot,m);}return m;};
  const armorCenters = new Map<Robot,{object:THREE.Object3D;center:THREE.Vector3}[]>();
  const initial = new Map<Robot, { position: THREE.Vector3; yaw: number }>();
  const benchModules=new THREE.Group();scene.add(benchModules);
  const launcherModels=new Map<string,ReturnType<typeof bindLauncherModule>>();
  const syncLaunchers=()=>{for(const r of match?.robots??[])launcherModels.get(r.id)?.update(r.launcher==="test"||r.launcher==="ready");};
  const roster = () => fieldRobots.map(r=>({id:r.object.name,team:r.object.userData.team as Team,heavy:r.object.name.includes("hero"),sentry:r.object.name.includes("sentinel"),maxHp:r.object.name.includes("hero")?400:200}));
  const activeRobot = () => match?.robots.find(r=>r.id===driving?.object.name);
  let mode: ArenaView = "first";
  let look = { yaw: -.7, pitch: -.08 };
  let paused = false;
  let lastTime: number | null = null;
  let lastStatus = "";
  const keys = new Set<string>();
  const clock = new THREE.Vector3(), forward = new THREE.Vector3(), eye = new THREE.Vector3();
  const abort = new AbortController();

  const manualRobot=()=>activeRobot()?.sentryControl==="auto"?null:driving;
  const nearby = () => ready && !driving && isPlaying(mode) ? nearestDriveable(explorer, robots) : null;
  function publish() {
    const vehicle = activeRobot();
    const side = vehicle&&match?.sides[vehicle.team];
    const teamStatus=(team:Team):SideStatus=>{
      const side=match!.sides[team];
      return {base:side.base,outpost:side.outpost,outpostOwner:side.outpostOwner,alive:match!.robots.filter(r=>r.team===team&&r.hp>0).length,control:Math.floor(side.controlTicks/10),
        outpostArea:territoryStatus(match!,team,"outpost"),baseArea:territoryStatus(match!,team,"base"),cover:side.cover};
    };
    const offer=match&&vehicle?ammoOffer(match,vehicle,true):null;
    const rune=match&&vehicle?runeStatus(match,vehicle.team):null;
    const power=match&&vehicle?chassisStatus(match,vehicle):null;
    const stance=match&&vehicle?sentryStatus(match,vehicle):null;
    const status: ArenaStatus = { view: mode, robot: driving?.name ?? null, nearby: nearby()?.name ?? null,
      match: match ? {phase:match.phase,seconds:Math.ceil(420-match.elapsed),winner:match.winner,sides:{red:teamStatus("red"),blue:teamStatus("blue")},
        coins:side?.coins??0,ammo:vehicle?.ammo??0,reserve:vehicle?reserveAmmo(match,vehicle):0,power:power?{...power,buffer:Math.ceil(power.buffer),locked:Math.ceil(power.locked)}:null,stance,performance:vehicle?.performance??null,hp:vehicle?.hp??0,buff:Math.ceil(rune?.buff??0),rune:rune&&vehicle&&!vehicle.heavy?{...rune,buff:Math.ceil(rune.buff)}:null,
        canBuy:!!vehicle&&canPurchaseAmmo(match,vehicle,true),canFire:!!vehicle&&!!manualRobot()&&canFire(match,vehicle),
        heat:Math.ceil(vehicle?.heat??0),heatLimit:vehicle?.heatLimit??0,thermalLock:vehicle?.thermalLock??false,
        pendingAmmo:vehicle?.pendingAmmoAt!=null?Math.max(0,Math.ceil(vehicle.pendingAmmoAt-match.elapsed)):0,
        pendingHeal:vehicle?.pendingHealAt!=null?Math.max(0,Math.ceil(vehicle.pendingHealAt-match.elapsed)):0,
        healCost:remoteHealthCost(match)+(vehicle?sentryCommandCost(vehicle):0),canHeal:!!vehicle&&canPurchaseHealth(match,vehicle,true),maxHp:vehicle?.maxHp??0,level:vehicle?robotLevel(vehicle,match):1,xp:vehicle&&!vehicle.heavy&&!vehicle.sentry?vehicle.xp:null,ammoCount:offer?.count??100,ammoCost:offer?.cost??150,revival:vehicle?revivalStatus(match,vehicle,true):null,launcher:vehicle?.heavy?launcherStatus(match,vehicle,driving?.position):null,energy:vehicle?.heavy&&driving?energyStatus(match,vehicle,driving.position):null,technology:vehicle&&driving?assemblyStatus(match,vehicle,driving.position):null,dart:vehicle?dartStatus(match,vehicle.team):null,armor:vehicle?armorStatus(match,vehicle.team):null,terrain:vehicle?terrainStatus(match,vehicle):null} : undefined };
    const signature = JSON.stringify(status);
    if (signature !== lastStatus) { lastStatus = signature; onStatus(status); }
  }

  function invalidate() {
    if (!disposed && !frame) frame = requestAnimationFrame(render);
  }

  const armorLit=new Map<Robot,boolean>();
  function updateVisibility() {
    for (const robot of robots){const state=match?.robots.find(r=>r.id===robot.object.name);
      const lit=!state||state.hp>0;
      if(armorLit.get(robot)!==lit){armorLit.set(robot,lit);setArmorLight(robot.object,lit);}
      robot.object.visible=(mode!=="first"||driving!==robot)&&(!match||!state||canDriveRobot(match,state));}
  }

  function syncCamera() {
    if (!ready || !terrain || !isPlaying(mode)) return;
    const target = driving?.position ?? explorer;
    lookDirection(look, forward);
    eye.copy(target).y += driving?.eyeHeight ?? 1.6;
    camera.up.set(0, 1, 0);
    if (driving&&manualRobot()) {
      const sight = aimWeapon(driving.object, driving.object.rotation.y+(driving.object.getObjectByName("gimbal")?.rotation.y??0), driving.object.getObjectByName("weapon-pitch")?.rotation.x??0);
      if (sight) { eye.copy(sight.origin); forward.copy(sight.direction); }
      else driving.object.getObjectByName("driver-eye")?.getWorldPosition(eye);
    }
    camera.position.copy(eye);
    camera.lookAt(clock.copy(eye).add(forward));
    updateVisibility();
  }

  function render(time: number) {
    frame = 0;
    if (disposed) return;
    const elapsed = matchTime===null||document.hidden?0:Math.max(0,(time-matchTime)/1000);
    matchTime=time;
    if(match&&mechanism&&match.phase==="running"){
      // Advance all chassis at the same time resolution; strategic choices stay staggered.
      // Keep the same clock for every subsystem. A delayed render may
      // catch up over subsequent frames, not teleport through a whole second.
      if(!document.hidden)motionDebt+=elapsed;
      const budget=document.hidden?0:Math.min(motionDebt,.075),end=Math.min(420,match.elapsed+budget);
      motionDebt=Math.max(0,motionDebt-budget);
      const before=match.elapsed,oldRune=match.pose.runeAngle,oldOutpost={...match.pose.outpostAngle};
      let synced=false;
      while(match.elapsed<end&&match.phase==="running"){
        const dt=Math.min(end-match.elapsed,.025);
        advanceMotion(dt);
        updateMatch(match,dt,positions);
        if(projectiles.activeCount){
          syncMechanisms();synced=true;
          projectiles.advance(match,dt,shotRoots());
        }else {
          // Advance pooled impact flashes on the same simulation clock.
          projectiles.advance(match,dt,[]);
          synced=false;
        }
      }
      if(!synced)syncMechanisms();
      for(const team of ["red","blue"] as const)if(activeRobot()?.team!==team){
        if(armorStatus(match,team).canFortify&&match.sides[team==="red"?"blue":"red"].armor.hits.length)fortifyArmor(match,team,recommendedArmorCenter(match,team));
        const d=match.sides[team].dart,status=dartStatus(match,team);
        if(status.canOpen){selectDart(match,team,d.used===0&&match.sides[team==="red"?"blue":"red"].outpost>0?"outpost":"randomMoving");openDart(match,team);}
        if(status.canSelect&&status.phase==="open"&&d.mode==="outpost")selectDart(match,team,"randomFixed");
        if(status.canFire&&d.shots<d.used*2)launchDart(match,team);
      }
      if(match.phase==="running" && match.elapsed>=nextBotTurn){
        nextBotTurn=match.elapsed+.12;
        decisionShotIndex=undefined;updateBots();decisionShotIndex=undefined;
      }
      const searchBudget=performance.now()+4;
      for(const [bot,route] of botPaths){
        if(bot===manualRobot()||!canDriveRobot(match,match.robots.find(r=>r.id===bot.object.name)!)){botPaths.delete(bot);continue;}
        if(!route.search)continue;
        do{
          const step=route.search.next();
          if(step.done){route.points=step.value;route.search=undefined;break;}
        }while(performance.now()<searchBudget);
        if(performance.now()>=searchBudget)break;
      }
      if(match.phase==="running"){
        const dt=match.elapsed-before;
        advanceAiming(dt,dt>0?{rune:(match.pose.runeAngle-oldRune)/dt,red:(match.pose.outpostAngle.red-oldOutpost.red)/dt,blue:(match.pose.outpostAngle.blue-oldOutpost.blue)/dt}:undefined);
      }
      else {shotIntents.clear();motions.clear();motionDebt=0;projectiles.clear();}
      if(driving&&activeRobot()&&!canDriveRobot(match,activeRobot()!))clearInput();
      updateVisibility();
      invalidate();
    }
    if (ready && terrain && isPlaying(mode)) {
      const dt = lastTime === null ? 0 : Math.min(.05, (time - lastTime) / 1000);
      const f = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
      const r = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
      const horizontal = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
      const vertical = Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp"));
      if (horizontal || vertical) look = turnView(look, horizontal * dt * 520, vertical * dt * 520);
      if(!driving&&(f||r)){
        const {yaw}=look, speed=keys.has("ShiftLeft")||keys.has("ShiftRight")?3.6:2.2,norm=Math.hypot(f,r);
        moveOnArena(terrain,explorer,(-Math.sin(yaw)*f+Math.cos(yaw)*r)*speed*dt/norm,(-Math.cos(yaw)*f-Math.sin(yaw)*r)*speed*dt/norm,PLAYER_RADIUS,.34,
          robots.filter(robot=>match?.robots.find(m=>m.id===robot.object.name)?.hp!==0&&Math.abs(robot.position.y-explorer.y)<1.15));
      }else if(driving&&match?.phase==="ready"){
        advanceMotion(dt);advanceAiming(dt);
      }
      if (f || r || horizontal || vertical || driving&&match?.phase==="ready"&&aimingManual()) {
        lastTime = time;
        invalidate();
      } else lastTime = null;
      syncCamera();
      publish();
    } else if (controls.enabled) controls.update();
    publish();
    renderer.render(scene, camera);
    if(match?.phase!=="running"&&!keys.size) matchTime=null;
  }

  function setView(next: ArenaView) {
    if (!ready) return;
    keys.clear();
    lastTime = null;
    if(match&&activeRobot())driveSpeed(match,activeRobot()!,0);
    const previous = mode;
    mode = next;
    if (isPlaying(next)) {
      controls.enabled = false;
      camera.fov = 72;
      syncCamera();
      canvas.focus({ preventScroll: true });
    } else {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      controls.enabled = !paused;
      camera.fov = 48;
      if (fieldBounds && (next !== "third" || previous === "first")) {
        controls.target.copy(frameArena(camera, next === "third" ? "all" : next, fieldBounds));
      }
      controls.minDistance = 2.5;
      controls.maxDistance = 160;
      controls.update();
    }
    camera.updateProjectionMatrix();
    updateVisibility();
    publish();
    invalidate();
  }

  function start() {
    if(!match||match.phase!=="ready")return;
    matchTime=null;motionDebt=0;
    startMatch(match);
    publish();invalidate();
  }
  function revive(paid:boolean) {
    if(match&&driving){reviveRobot(match,driving.object.name,paid,true);publish();invalidate();}
  }
  function heal() {
    if(match&&driving){purchaseHealth(match,driving.object.name,true);publish();invalidate();}
  }
  function buy() {
    if(match&&driving){purchaseAmmo(match,driving.object.name,true);publish();invalidate();}
  }
  function reset() {
    if(!match||!mechanism||!terrain)return;
    match=createMatch(roster(),undefined,undefined,coreGeometry?.energySpawns,coreGeometry?.coreSockets);
    nextBotTurn=0;botCursor=0;motionDebt=0;matchTime=null;botPaths.clear();motions.clear();shotIntents.clear();syncLaunchers();
    for(const [robot,pose] of initial){robot.position.copy(pose.position);robot.object.rotation.y=pose.yaw;robot.object.getObjectByName("gimbal")?.rotation.set(0,0,0);robot.object.getObjectByName("weapon-pitch")?.rotation.set(0,0,0);for(const w of wheels.get(robot)??[])w.rotation.x=0;}
    projectiles.clear();
    driving=null;clearInput();look={yaw:-.7,pitch:-.08};explorer.set(-10,terrain.heightAt(-10,-1.25),-1.25);
    mechanism.apply(match.pose);mechanism.applyDart(match);mechanism.setRuneLights(runeLights(match,"red"),runeLights(match,"blue"));coreGeometry?.applyTechnology(match);updateVisibility();setView("first");publish();invalidate();
  }
  function pickup(){
    const robot=activeRobot();
    if(match&&driving&&robot){
      const unit=energyStatus(match,robot,driving.position).pickup;
      if(unit)pickupEnergy(match,robot.id,driving.position,unit);
      coreGeometry?.applyTechnology(match);publish();invalidate();
    }
  }
  function drop(){
    if(match&&driving){
      dropEnergy(match,driving.object.name,driving.position);
      coreGeometry?.applyTechnology(match);publish();invalidate();
    }
  }
  function assembly(level:Difficulty){
    if(match&&driving){beginAssembly(match,driving.object.name,driving.position,level);coreGeometry?.applyTechnology(match);publish();invalidate();}
  }
  function assemblyStep(core:Team,step:2|3|4|5|6,angle:number){
    if(match&&driving){assemblyAction(match,driving.object.name,driving.position,core,step,angle);coreGeometry?.applyTechnology(match);publish();invalidate();}
  }
  function cancel(){
    if(match&&driving){cancelAssembly(match,driving.object.name,driving.position);coreGeometry?.applyTechnology(match);publish();invalidate();}
  }
  function install(){
    if(match&&driving){installLauncher(match,driving.object.name,driving.position);syncLaunchers();publish();invalidate();}
  }
  function detachLauncher(){if(match&&driving){removeLauncher(match,driving.object.name,driving.position);syncLaunchers();publish();invalidate();}}
  function fire() {
    if(!ready||paused||!isPlaying(mode)||!driving||!manualRobot()||!match||!map)return;
    syncCamera();
    const shot = aimWeapon(driving.object,driving.object.rotation.y+(driving.object.getObjectByName("gimbal")?.rotation.y??0),driving.object.getObjectByName("weapon-pitch")?.rotation.x??0);
    if (shot) shoot(driving,shot.origin,shot.direction);
  }
  function syncMechanisms(){
    if(!match||!mechanism)return;
    mechanism.apply(match.pose);mechanism.applyDart(match);
    mechanism.setRuneLights(runeLights(match,"red"),runeLights(match,"blue"));
    coreGeometry?.applyTechnology(match);syncLaunchers();
  }
  function shotRoots(){
    return [map!,ground,benchModules,...fieldRobots.filter(r=>match?.robots.find(m=>m.id===r.object.name)?.hp!==0).map(r=>r.object)];
  }
  function trace(robot:Robot,from:THREE.Vector3,direction:THREE.Vector3){
    if(!map)return undefined;
    const roots=shotRoots();
    decisionShotIndex??=prepareArenaShots(roots);
    return traceArenaShot(shotRay,roots,from,direction,SHOT_RANGE,decisionShotIndex,robot.object);
  }
  function updateBots() {
    if(!match||!terrain||!mechanism)return;
    const field=fieldRobots;
    const available=field.filter(bot=>bot!==manualRobot());
    const bot=available[botCursor++%available.length];
    if(!bot)return;
    const state=match.robots.find(m=>m.id===bot.object.name)!;
    shotIntents.delete(bot);
    const side=match.sides[state.team],enemyTeam=state.team==="red"?"blue":"red",enemySide=match.sides[enemyTeam];
    const revival=revivalStatus(match,state);
    if(revival.dead){
      botPaths.delete(bot);
      if(side.tech.attempt?.robot===state.id){
        if(!zonesAtPosition(bot.position).includes(`${state.team}-assembly`)){cancelAssembly(match,state.id,bot.position);return;}
        const axis=match.coreSockets[state.team]?.axis;
        if(axis){
          const target=bot.position.clone().add(new THREE.Vector3(axis.x,0,axis.z));
          setBotGoal(bot,target,.04);
        }
        return;
      }
      if(revival.canConfirm)reviveRobot(match,state.id);
      else if(revival.canPay&&side.coins>revival.cost+300&&match.elapsed>300)reviveRobot(match,state.id,true);
      return;
    }
    const active=field.filter(r=>match!.robots.some(m=>m.id===r.object.name&&m.hp>0));
    const enemies=active.filter(r=>r.object.userData.team!==state.team)
      .sort((a,b)=>a.position.distanceToSquared(bot.position)-b.position.distanceToSquared(bot.position));
    const zoneGoal=(team:Team,kind:ZoneKind)=>{
      const zone=ARENA_ZONES.find(z=>z.team===team&&z.kind===kind)!;
      if(kind!=="assembly"&&zonesAtPosition(bot.position).includes(zone.id))return bot.position.clone();
      const previous=botPaths.get(bot)?.goal;
      if(kind!=="assembly"&&previous&&zonesAtPosition(previous).includes(zone.id)&&!active.some(r=>r!==bot&&Math.abs(r.position.y-previous.y)<1.15&&Math.hypot(r.position.x-previous.x,r.position.z-previous.z)<r.radius+bot.radius))return previous.clone();
      const [x,z]=zone.goal;
      const offsets=kind==="assembly"?[[0,0],[.2,-.2],[-.2,.2]]:state.sentry?[[0,0],[.5,.4],[-.5,-.4]]:state.id.includes("03")?[[.5,.4],[0,0],[-.5,-.4]]:[[-.5,-.4],[0,0],[.5,.4]];
      for(const [dx,dz] of offsets){
        const p=new THREE.Vector3(x+dx,terrain!.heightAt(x+dx,z+dz),z+dz);
        if(zonesAtPosition(p).includes(zone.id)&&supportedHeight(terrain!,p.x,p.z,bot.radius,p.y,.23)!==null
          && !active.some(r=>r!==bot&&Math.abs(r.position.y-p.y)<1.15&&Math.hypot(r.position.x-p.x,r.position.z-p.z)<r.radius+bot.radius))return p;
      }
      return new THREE.Vector3(x,terrain!.heightAt(x,z),z);
    };
    const supply=zoneGoal(state.team,"supply");
    const repair=ARENA_ZONES.filter(z=>z.kind==="outpost"&&controlsOutpost(match!,z.team,state.team,true))
      .map(z=>zoneGoal(z.team,"outpost")).sort((a,b)=>a.distanceToSquared(bot.position)-b.distanceToSquared(bot.position))[0];
    const recovering=revival.weak||state.hp<state.maxHp*.55;
    if(state.hp<state.maxHp*.5&&canPurchaseHealth(match,state)&&side.coins>remoteHealthCost(match)+150)purchaseHealth(match,state.id);
    if(state.heavy&&launcherStatus(match,state,bot.position).canInstall){installLauncher(match,state.id,bot.position);syncLaunchers();}
    const needsLauncher=state.heavy&&state.launcher==="unlocked";
    const armed=!state.heavy||state.launcher==="ready"||state.launcher==="test";
    if(armed&&state.ammo+reserveAmmo(match,state)<(state.heavy?3:state.sentry?80:20))purchaseAmmo(match,state.id);
    if(state.heavy&&state.launcher==="test"&&canFire(match,state)){
      shotIntents.set(bot,{point:bot.position.clone().add(new THREE.Vector3(-Math.sin(bot.object.rotation.y)*10,bot.eyeHeight,-Math.cos(bot.object.rotation.y)*10))});
    }
    const needAmmo=armed&&state.ammo+reserveAmmo(match,state)===0&&state.pendingAmmoAt===null;
    const fortressReady=match.elapsed>=180&&controlsOutpost(match,enemyTeam,state.team)&&!enemySide.cover;
    const assault=fortressReady?active.filter(r=>r!==manualRobot()&&r.object.userData.team===state.team)
      .filter(r=>{const m=match!.robots.find(m=>m.id===r.object.name)!;return !m.heavy&&!revivalStatus(match!,m).weak&&(m.fortressHold>0||m.hp>=m.maxHp*.55);})
      .sort((a,b)=>Number((match!.robots.find(m=>m.id===b.object.name)?.fortressHold??0)>0)-Number((match!.robots.find(m=>m.id===a.object.name)?.fortressHold??0)>0)||a.radius-b.radius)[0]:undefined;
    const assaultDuty=bot===assault;
    let goal:THREE.Vector3;
    if(needsLauncher){
      const [x,z]=launcherBench(state.team).approach;goal=new THREE.Vector3(x,terrain.heightAt(x,z),z);
    }else if(assaultDuty&&state.fortressHold>0){
      goal=zoneGoal(enemyTeam,"fortress");
    }else if(recovering||needAmmo){
      goal=repair&&repair.distanceToSquared(bot.position)<supply.distanceToSquared(bot.position)?repair:supply;
    }else if(assaultDuty){
      goal=zoneGoal(enemyTeam,"fortress");
    }else if(!controlsOutpost(match,state.team,state.team)||side.outpostArea.progress>0){
      goal=zoneGoal(state.team,state.sentry?"outpost":"central");
    }else if(fortressReady){
      goal=zoneGoal(enemyTeam,state.sentry||state.id.includes("04")?"central":"outpost");
    }else if(!controlsOutpost(match,enemyTeam,state.team,true)){
      goal=zoneGoal(enemyTeam,state.sentry||state.id.includes("04")?"central":"outpost");
    }else{
      goal=zoneGoal(enemyTeam,state.sentry?"central":"base");
    }
    // Prefer a nearby own highpoint for local resupply when not recovering.
    // Do not interrupt fortress, launcher installation or technology tasks.
    if(needAmmo&&!recovering&&!needsLauncher&&!assaultDuty&&!state.heavy){
      const highpoint=zoneGoal(state.team,"highpoint");
      if(highpoint.distanceTo(bot.position)<2.5&&highpoint.distanceToSquared(bot.position)<goal.distanceToSquared(bot.position))goal=highpoint;
    }
    if(state.heavy&&state.launcher==="locked"&&!recovering)goal=zoneGoal(state.team,"central");
    // Finish a detected low-card approach towards an existing highland
    // objective only; the referee still requires the actual ordered contacts.
    const crossing=state.terrain.attempt;
    if(!recovering&&!needAmmo&&!needsLauncher&&!assaultDuty&&crossing?.kind==="highland"){
      const target=zoneGoal(crossing.course.startsWith("red-")?"red":"blue","central");
      if(target.distanceTo(bot.position)<3)goal=target;
    }
    // Heavy robots use the same referee calls as a player. Finish the
    // current attempt before switching tasks, but do not monopolize late combat.
    let technologyDuty=false;
    if(state.heavy){
      const tech=assemblyStatus(match,state,bot.position),energy=energyStatus(match,state,bot.position);
      const next=technologyLevel(match,state.team)+1 as Difficulty;
      const desired=next===4?2:1;
      if(tech.level!==null){
        technologyDuty=true;
        if(recovering&&!tech.pending)cancelAssembly(match,state.id);
        else{
          const action=[...tech.actions].sort((a,b)=>a.step-b.step)[0];
          if(action)assemblyAction(match,state.id,bot.position,action.core,action.step,action.angle);
          goal=zoneGoal(state.team,"assembly");
          if(tech.pending||action)goal=bot.position.clone();
        }
      }else if(!recovering&&!needsLauncher&&next<=4&&match.elapsed>=60*(next-1)&&match.elapsed<330&&match.elapsed>=side.tech.retryAt&&
        (next!==4||!enemySide.tech.attempt)&&enemySide.tech.attempt?.level!==4&&
        (energy.carrying>=desired||match.energyUnits.some(u=>u.team===state.team&&(u.location.kind==="rack"||u.location.kind==="ground")))){
        technologyDuty=true;
        if(energy.carrying>=desired){
          goal=zoneGoal(state.team,"assembly");
          if(bot.position.distanceTo(goal)<.10&&tech.available.includes(next)){beginAssembly(match,state.id,bot.position,next);goal=bot.position.clone();}
        }else{
          if(energy.pickup)pickupEnergy(match,state.id,bot.position,energy.pickup);
          const unit=match.energyUnits.filter(u=>u.team===state.team&&(u.location.kind==="rack"||u.location.kind==="ground")).sort((a,b)=>bot.position.distanceToSquared(new THREE.Vector3(a.location.position.x,a.location.position.y,a.location.position.z))-bot.position.distanceToSquared(new THREE.Vector3(b.location.position.x,b.location.position.y,b.location.position.z)))[0];
          if(unit){
            const p=unit.location.position;
            const candidates:THREE.Vector3[]=[];
            for(const distance of [1.1,.9,1.3])for(let i=0;i<8;i++){
              const x=p.x+distance*Math.cos(i*Math.PI/4),z=p.z+distance*Math.sin(i*Math.PI/4);
              const y=terrain.heightAt(x,z);
              const point=new THREE.Vector3(x,y,z);
              if(Math.abs(y-p.y)>1.4||unit.location.kind==="rack"&&!zonesAtPosition(point).includes(`${state.team}-supply`)||supportedHeight(terrain,x,z,bot.radius,y,.23)===null)continue;
              if(active.some(r=>r!==bot&&Math.abs(r.position.y-y)<1.15&&Math.hypot(r.position.x-x,r.position.z-z)<r.radius+bot.radius))continue;
              candidates.push(point);
            }
            candidates.sort((a,b)=>a.distanceToSquared(bot.position)-b.distanceToSquared(bot.position));
            goal=candidates[0]??supply;
          }
        }
      }
    }
    // One available infantry per team handles rune attempts. Do not spend
    // an activation until its actual muzzle has an unobstructed detector.
    const rune=runeStatus(match,state.team);
    const runeBot=active.find(r=>r!==manualRobot()&&r.object.userData.team===state.team&&r.object.name.includes("infantry-04"))
      ??active.find(r=>r!==manualRobot()&&r.object.userData.team===state.team&&r.object.name.includes("infantry"));
    let runeDuty=false;
    if(bot===runeBot&&!assaultDuty&&!recovering&&!needAmmo&&state.ammo>=(rune.active?1:5)&&!rune.buff&&(rune.active||rune.available>0)){
      const bank=state.team==="red"?"a":"b";
      const arms=Array.from({length:5},(_,i)=>mechanism!.parts.getObjectByName("rune-arm-"+bank+"-"+i)!);
      const center=new THREE.Vector3();
      for(const arm of arms)center.add(arm.localToWorld(arm.userData.runeDetector.center.clone()));
      center.divideScalar(5);
      const normal=arms[0].userData.runeDetector.normal.clone().transformDirection(arms[0].matrixWorld);
      normal.y=0;normal.normalize();
      const lateral=new THREE.Vector3(-normal.z,0,normal.x);
      const minRing=side.rune.largeWins>=2?7:side.rune.largeWins===1?4:1;
      const shotAt=(indices:readonly number[])=>{
        for(const i of indices){
          const arm=arms[i],point=arm.localToWorld(arm.userData.runeDetector.center.clone());
          if(bot.position.distanceTo(point)>8)continue;
          const shot=previewWeaponAt(bot.object,point);
          if(!shot)continue;
          const target=arenaHitTarget(trace(bot,shot.origin,shot.direction),shot.direction);
          if(target?.type==="rune"&&target.team===state.team&&target.arm===i&&(!rune.large||target.ring>=minRing))return {point:arm.userData.runeDetector.center.clone(),object:arm};
        }
        return null;
      };
      const visible=shotAt(rune.active?rune.lit:[0,1,2,3,4]);
      if(visible){
        if(!rune.active)activateRune(match,state.id);
        if(canFire(match,state)){
          const shot=shotAt(runeStatus(match,state.team).lit);
          if(shot)shotIntents.set(bot,shot);
        }
        goal=bot.position.clone();runeDuty=true;
      }else{
        for(const distance of [3.5,4.5,2.5,5.5]){
          for(const offset of [0,.8,-.8,1.6,-1.6]){
            const p=center.clone().addScaledVector(normal,distance).addScaledVector(lateral,offset);
            p.y=terrain.heightAt(p.x,p.z);
            if(supportedHeight(terrain,p.x,p.z,bot.radius,p.y,.23)===null||p.distanceTo(bot.position)<.3)continue;
            if(active.some(r=>r!==bot&&Math.abs(r.position.y-p.y)<1.15&&Math.hypot(r.position.x-p.x,r.position.z-p.z)<r.radius+bot.radius))continue;
            goal=p;runeDuty=true;break;
          }
          if(runeDuty)break;
        }
      }
    }
    if(state.commandTarget){
      const zone=ARENA_ZONES.find(z=>z.id===state.commandTarget);
      if(zone&&zonesAtPosition(bot.position).includes(zone.id))state.commandTarget=null;
      else if(zone&&!recovering&&!assaultDuty)goal=zoneGoal(zone.team,zone.kind);
    }
    if(!technologyDuty&&!runeDuty&&state.launcher!=="test"&&canFire(match,state)&&!revival.weak){
      const candidates:THREE.Vector3[]=[];
      for(const enemy of enemies.slice(0,2)){
        if(enemy.position.distanceTo(bot.position)>12)continue;
        for(const {object,center} of armorCenters.get(enemy)??[])candidates.push(object.localToWorld(center.clone()));
      }
      for(const location of ["red","blue"] as const)if(match.sides[location].outpostOwner!==state.team&&match.sides[location].outpost>0)
        for(let i=0;i<3;i++)candidates.push(new THREE.Box3().setFromObject(mechanism.parts.getObjectByName(location+"-outpost-armor-"+i)!).getCenter(new THREE.Vector3()));
      candidates.sort((a,b)=>a.distanceToSquared(bot.position)-b.distanceToSquared(bot.position));
      for(const point of candidates.slice(0,6)){
        if(point.distanceTo(bot.position)>12)continue;
        const shot=previewWeaponAt(bot.object,point);
        if(!shot)continue;
        const hit=trace(bot,shot.origin,shot.direction),target=arenaHitTarget(hit,shot.direction);
        if(target?.type==="outpost"&&match.sides[target.team as Team].outpostOwner!==state.team||target?.type==="robot"&&enemies.some(r=>r.object.name===target.id)){
          shotIntents.set(bot,{point:hit!.object.worldToLocal(hit!.point.clone()),object:hit!.object});break;
        }
      }
    }
    const stance=sentryStatus(match,state);
    if(stance&&stance.cooldown===0){
      const distance=Math.hypot(goal.x-bot.position.x,goal.z-bot.position.z);
      const threat=enemies.some(r=>r.position.distanceTo(bot.position)<5);
      const holding=assaultDuty&&distance<1.5;
      const desired:SentryMode=holding||threat&&state.hp<state.maxHp*.35?"defense":distance>.8?"move":threat&&state.ammo>0?"attack":"defense";
      const enhance=stance.remaining[desired]>0&&(desired==="defense"?holding:desired==="attack"?state.heat>=state.heatLimit*.7:assaultDuty&&distance>6);
      if(stance.mode!==desired||enhance&&!stance.enhanced)switchSentry(match,state.id,desired,enhance);
    }
    // Strategy writes a persistent goal; it never moves the chassis.
    setBotGoal(bot,goal,technologyDuty?.055:.22);
  }
  function setBotGoal(bot:Robot,goal:THREE.Vector3,tolerance:number){
    const route=botPaths.get(bot);
    if(!route||route.goal.distanceTo(goal)>.5||goal.distanceTo(bot.position)<tolerance&&route.points.length>0){
      botPaths.set(bot,{goal:goal.clone(),points:[],retryAt:0,tolerance});
    }else{route.goal.copy(goal);route.tolerance=tolerance;}
  }
  function advanceMotion(dt:number){
    if(!match||!terrain||dt<=0)return;
    const active=fieldRobots.filter(b=>match!.robots.find(r=>r.id===b.object.name)!.hp>0);
    for(const bot of fieldRobots){
      const state=match.robots.find(r=>r.id===bot.object.name)!;
      const motion=motionFor(bot),manual=manualRobot()===bot;
      const previousYaw=bot.object.rotation.y;
      const gimbal=bot.object.getObjectByName("gimbal");
      const occupants=active.filter(r=>r!==bot&&Math.abs(r.position.y-bot.position.y)<1.15);
      let target:THREE.Vector3|null=null,command:0|1|2=0;
      const route=botPaths.get(bot);
      if(manual&&isPlaying(mode)&&!paused){
        const f=Number(keys.has("KeyW"))-Number(keys.has("KeyS")),r=Number(keys.has("KeyD"))-Number(keys.has("KeyA"));
        if(f||r){const n=Math.hypot(f,r),{yaw}=look;target=bot.position.clone().add(new THREE.Vector3((-Math.sin(yaw)*f+Math.cos(yaw)*r)/n*10,0,(-Math.cos(yaw)*f-Math.sin(yaw)*r)/n*10));command=keys.has("ShiftLeft")||keys.has("ShiftRight")?2:1;}
      }else if(!manual&&match.phase==="running"&&route&&!route.search){
        while(route.points.length&&bot.position.distanceTo(route.points[0])<.04)route.points.shift();
        if(Math.hypot(route.goal.x-bot.position.x,route.goal.z-bot.position.z)>=route.tolerance){target=route.points[0]??route.goal;command=1;}
      }
      const assembly=match.sides[state.team].tech.attempt;
      if(assembly?.robot===state.id&&assembly.pending){target=null;command=0;}
      const speed=driveSpeed(match,state,command);
      if(!canDriveRobot(match,state)||match.phase==="finished"){motions.delete(bot);shotIntents.delete(bot);botPaths.delete(bot);continue;}
      const oldX=bot.position.x,oldZ=bot.position.z;
      const traveled=stepChassis(terrain,bot,motion,target,speed,dt,occupants,!manual&&route&&!route.points.length?route.tolerance:undefined);
      bot.object.rotation.y=motion.yaw;
      // Preserve gun world yaw while the chassis turns underneath it.
      if(gimbal)gimbal.rotation.y+=previousYaw-motion.yaw;
      const yawChange=angleDelta(previousYaw,motion.yaw);
      if(traveled>0||yawChange!==0){
        const dx=bot.position.x-oldX,dz=bot.position.z-oldZ;
        const forward=-Math.sin(motion.yaw)*dx-Math.cos(motion.yaw)*dz;
        const lateral=Math.cos(motion.yaw)*dx-Math.sin(motion.yaw)*dz;
        for(const wheel of wheels.get(bot)??[])wheel.rotation.x+=(forward+Math.sign(wheel.position.x*wheel.position.z)*lateral+wheel.position.x*bot.object.scale.x*yawChange)/bot.wheelRadius;
      }
      if(!manual&&route&&target&&speed>0&&traveled<.00001&&motion.speed===0&&Math.abs(angleDelta(motion.yaw,Math.atan2(bot.position.x-target.x,bot.position.z-target.z)))<.2&&match.elapsed>=route.retryAt){
        route.points=[];route.retryAt=match.elapsed+4;
        route.search=findArenaPath(terrain,bot.position.clone(),route.goal.clone(),bot.radius,.4,occupants.map(r=>({position:r.position.clone(),radius:r.radius})));
      }
      if(traveled||previousYaw!==motion.yaw)bot.object.updateMatrixWorld(true);
    }
  }
  function aimingManual(){
    if(!driving||!manualRobot())return false;
    const g=driving.object.getObjectByName("gimbal"),w=driving.object.getObjectByName("weapon-pitch");
    return !!g&&!!w&&(Math.abs(angleDelta(driving.object.rotation.y+g.rotation.y,look.yaw))>.001||Math.abs(w.rotation.x-look.pitch)>.001);
  }
  function advanceAiming(dt:number,rates?:{rune:number;red:number;blue:number}){
    if(!match)return;
    for(const bot of fieldRobots){
      const state=match.robots.find(r=>r.id===bot.object.name)!;
      const g=bot.object.getObjectByName("gimbal"),w=bot.object.getObjectByName("weapon-pitch");
      if(!g||!w||state.hp<=0){shotIntents.delete(bot);continue;}
      const manual=manualRobot()===bot&&isPlaying(mode),intent=shotIntents.get(bot);
      let desired:{yaw:number;pitch:number}|null=manual?look:null;
      if(!manual&&intent){
        const point=intent.object?intent.object.localToWorld(intent.point.clone()):intent.point.clone();
        const speed=projectileSpeed(state.heavy);
        let aim=previewWeaponAt(bot.object,point,speed);
        if(aim&&intent.object){
          // Predict the currently moving detector from its real rotation
          // axis, or use the observed local-point velocity for a robot.
          let rotor:THREE.Object3D|undefined,axis:THREE.Vector3|undefined,rate=0;
          if(mechanism&&rates)for(let node:THREE.Object3D|null=intent.object;node;node=node.parent){
            if(mechanism.banks.includes(node)){rotor=node;axis=mechanism.runeAxis;rate=rates.rune;break;}
            const index=mechanism.rotors.indexOf(node);
            if(index>=0){rotor=node;axis=mechanism.rotorAxis;rate=index===0?rates.red:rates.blue;break;}
          }
          const velocity=intent.previous&&dt>0?point.clone().sub(intent.previous).divideScalar(dt):new THREE.Vector3();
          intent.previous=point.clone();
          const pivot=rotor?.getWorldPosition(new THREE.Vector3()),worldAxis=axis&&rotor?.parent?axis.clone().transformDirection(rotor.parent.matrixWorld):undefined;
          for(let i=0;i<2&&aim;i++){
            const predicted=point.clone();
            if(pivot&&worldAxis)predicted.sub(pivot).applyAxisAngle(worldAxis,rate*aim.flightTime).add(pivot);
            else predicted.addScaledVector(velocity,aim.flightTime);
            aim=previewWeaponAt(bot.object,predicted,speed);
          }
        }
        desired=aim;
      }
      if(!desired)continue;
      const yaw=turnTowards(bot.object.rotation.y+g.rotation.y,desired.yaw,Math.PI*4*dt);
      const pitch=turnTowards(w.rotation.x,desired.pitch,Math.PI*3*dt);
      const shot=aimWeapon(bot.object,yaw,pitch);
      if(!manual&&intent&&shot&&Math.abs(angleDelta(yaw,desired.yaw))<.003&&Math.abs(pitch-desired.pitch)<.003){
        shotIntents.delete(bot);shoot(bot,shot.origin,shot.direction);
      }
    }
  }
  function shoot(robot:Robot,from:THREE.Vector3,direction:THREE.Vector3){
    if(!match||!map)return;
    if(projectiles.fire(match,robot.object.name,from,direction,robot.object)){publish();invalidate();}
  }
  function interact() {
    if (!ready || paused || !terrain || !isPlaying(mode)) return;
    if (driving) {
      const robot = driving;
      if(match&&activeRobot())driveSpeed(match,activeRobot()!,0);
      for (let i = 0; i < 12; i++) {
        const angle = look.yaw + i * Math.PI / 6;
        const distance = robot.radius + PLAYER_RADIUS + .16;
        const x = robot.position.x + Math.cos(angle) * distance, z = robot.position.z + Math.sin(angle) * distance;
        const y = supportedHeight(terrain, x, z, PLAYER_RADIUS, robot.position.y, .48);
        if (y === null || robots.some(other => other !== robot && Math.abs(other.position.y - y) < 1.15
          && Math.hypot(x - other.position.x, z - other.position.z) < PLAYER_RADIUS + other.radius)) continue;
        explorer.set(x, y, z);
        driving = null;
        motions.delete(robot);botPaths.delete(robot);shotIntents.delete(robot);
        break;
      }
    } else {
      const robot = nearby();
      if (robot) {
        driving = robot;
        botPaths.delete(robot);shotIntents.delete(robot);motions.delete(robot);
        look = { yaw: robot.object.rotation.y+(robot.object.getObjectByName("gimbal")?.rotation.y??0), pitch: robot.object.getObjectByName("weapon-pitch")?.rotation.x??0 };
      }
    }
    clearInput();
    syncCamera();
    publish();
    invalidate();
  }

  const movement = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  function input(key: string, pressed: boolean) {
    if (!movement.has(key)) return;
    if (!pressed) keys.delete(key);
    else if (ready && !paused && isPlaying(mode)) keys.add(key);
    invalidate();
  }

  function keydown(event: KeyboardEvent) {
    if (!ready || paused || event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if (movement.has(event.code) && isPlaying(mode)) {
      event.preventDefault();
      input(event.code, true);
    } else if (event.code === "Space" && driving && isPlaying(mode)) {event.preventDefault();fire();}
    else if (!event.repeat && event.code === "KeyB") buy();
    else if (!event.repeat && event.code === "KeyE") interact();
    else if (!event.repeat && event.code === "KeyV") setView(mode === "first" ? "third" : "first");
    else if (!event.repeat && event.code === "KeyM") setView(mode === "all" ? "first" : "all");
  }
  function keyup(event: KeyboardEvent) { input(event.code, false); }
  function clearInput() { keys.clear(); lastTime = null; if(driving)motions.delete(driving); if(match&&activeRobot())driveSpeed(match,activeRobot()!,0); }
  function turn(dx: number, dy: number) {
    if (!ready || paused || !isPlaying(mode)) return;
    look = turnView(look, dx, dy);
    invalidate();
  }
  let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  function pointerdown(event: PointerEvent) {
    if (!ready || paused || !isPlaying(mode) || event.button !== 0) return;
    if(document.pointerLockElement===canvas){fire();return;}
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }
  function pointermove(event: PointerEvent) {
    if (document.pointerLockElement === canvas || drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (dx || dy) drag.moved = true;
    turn(dx,dy);
    drag.x = event.clientX; drag.y = event.clientY;
  }
  function pointerup(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    const click = !drag.moved && event.type === "pointerup" && event.pointerType === "mouse";
    drag = null;
    if(click&&driving)fire();
    if (click && !paused && canvas.requestPointerLock) {
      try { const result = canvas.requestPointerLock(); if (result) void result.catch(() => {}); } catch { /* drag stays available */ }
    }
  }
  function pauseInput(value: boolean) {
    paused = value;
    clearInput();
    drag = null;
    controls.enabled = !value && !isPlaying(mode);
    if (value && document.pointerLockElement === canvas) document.exitPointerLock();
  }
  function mousemove(event: MouseEvent) {
    if (document.pointerLockElement === canvas) turn(event.movementX, event.movementY);
  }
  function visibilityChange(){matchTime=null;clearInput();invalidate();}
  function lockchange() { if (document.pointerLockElement !== canvas) clearInput(); }

  controls.addEventListener("change", invalidate);
  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    if (ready && mode !== "first" && mode !== "third" && fieldBounds) {
      controls.target.copy(frameArena(camera, mode, fieldBounds));
      controls.update();
    }
    camera.updateProjectionMatrix();
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  canvas.addEventListener("pointerdown", pointerdown);
  canvas.addEventListener("pointermove", pointermove);
  canvas.addEventListener("pointerup", pointerup);
  canvas.addEventListener("pointercancel", pointerup);
  canvas.addEventListener("lostpointercapture", pointerup);
  document.addEventListener("mousemove", mousemove);
  document.addEventListener("pointerlockchange", lockchange);
  document.addEventListener("visibilitychange",visibilityChange);
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", clearInput);
  onBusy();

  async function loadAsset(asset:{url:string;sha256:string}) {
    const response = await fetch(asset.url, { signal: abort.signal });
    if (!response.ok) throw new Error("CAD asset unavailable");
    const payload = await response.arrayBuffer();
    const signature = new Uint8Array(payload, 0, 2);
    const bytes = signature[0] === 0x1f && signature[1] === 0x8b
      ? await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
      : payload;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== asset.sha256) throw new Error("CAD mesh integrity mismatch");
    return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,"")).scene;
  }
  void (async () => {
    const asset=await resolveCadModel("rmucField");
    const [field,parts,coreParts,dartParts]=await Promise.all([loadAsset(asset),loadAsset(MECHANISM_ASSET),loadAsset(CORE_ASSET),loadAsset(DART_ASSET)]);
    if(disposed){disposeObjects(field);disposeObjects(parts);disposeObjects(coreParts);disposeObjects(dartParts);return;}
    const root = new THREE.Group();
    root.add(field);
    root.rotation.x = -Math.PI / 2;
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const middle = bounds.getCenter(new THREE.Vector3());
    root.position.set(-middle.x, -bounds.min.y, -middle.z);
    root.updateMatrixWorld(true);
    fieldBounds = new THREE.Box3().setFromObject(root);
    map = root;
    scene.add(root);
    coreGeometry=installCoreGeometry(field,coreParts);
    coreGeometry.group.removeFromParent();
    terrain = createArenaTerrain(root);
    field.add(coreGeometry.group);
    field.updateMatrixWorld(true);
    // Ground support uses the static CAD envelope without movable energy units.
    mechanism=installMechanisms(field,parts,dartParts);
    exhibit = addRobotPreviews(map, scene, terrain);
    robots = exhibit.children.map(object => {
      const group = object as THREE.Group;
      return { object: group, position: group.position, radius: group.userData.radius,
        driveable: group.userData.driveable === true, name: group.userData.name,
        eyeHeight: group.userData.eyeHeight ?? 1, wheelRadius: group.userData.wheelRadius ?? .12 };
    });
    scene.updateMatrixWorld(true);
    for(const team of ["red","blue"] as const){
      const rotor=mechanism.parts.getObjectByName(team+"-outpost-rotor")!;
      for(let i=0;i<3;i++)bindArmorFrame(mechanism.parts.getObjectByName(team+"-outpost-armor-"+i)!,rotor);
    }
    fieldRobots=robots.filter(r=>r.object.userData.area==="field");
    for(const robot of fieldRobots){positions.set(robot.object.name,robot.position);const list:THREE.Object3D[]=[];robot.object.traverse(o=>{if(o.name.startsWith("wheel-"))list.push(o);});wheels.set(robot,list);}
    for(const robot of robots){
      initial.set(robot,{position:robot.position.clone(),yaw:robot.object.rotation.y});
      if(robot.object.userData.area!=="field")continue;
      const plates:THREE.Mesh[]=[],overlays:THREE.Mesh[]=[];
      const list:{object:THREE.Object3D;center:THREE.Vector3}[]=[];
      robot.object.traverse(o=>{
        if(!o.userData.hitPlate||!(o instanceof THREE.Mesh))return;
        o.userData.target={type:"robot",id:robot.object.name};
        o.geometry.computeBoundingBox();
        if(o.userData.armorSurface){plates.push(o);bindArmorFrame(o,robot.object);}
        else overlays.push(o);
        list.push({object:o,center:o.geometry.boundingBox!.getCenter(new THREE.Vector3())});
      });
      for(const overlay of overlays)aliasArmorFrames(overlay,plates);
      armorCenters.set(robot,list);
    }
    match=createMatch(roster(),undefined,undefined,coreGeometry?.energySpawns,coreGeometry?.coreSockets);
    // Three.js raycasting can reject misses against local geometry boxes
    // before testing triangles; important for the large CAD field.
    scene.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.computeBoundingBox();});
    explorer.set(-10, terrain.heightAt(-10, -1.25), -1.25);
    for(const robot of robots){
      const r=match.robots.find(r=>r.id===robot.object.name);
      if(r?.heavy)launcherModels.set(r.id,bindLauncherModule(robot.object,benchModules,launcherBench(r.team).pad));
    }
    syncLaunchers();mechanism.applyDart(match);
    ready = true;
    setView("first");
    onReady();
  })().catch(() => {
    if (!disposed) onError("三维场地加载失败，请刷新重试");
  });

  return {
    view: setView, interact, input, pauseInput, start, buy, heal, revive, install, removeLauncher:detachLauncher, pickup, drop, assembly, assemblyStep, cancelAssembly:cancel, fire, reset,performance:value=>{if(match&&driving)selectInfantryPerformance(match,driving.object.name,value);publish();invalidate();},stance:(mode,enhanced)=>{if(match&&driving)switchSentry(match,driving.object.name,mode,enhanced,true);publish();invalidate();},rune:()=>{if(match&&driving)activateRune(match,driving.object.name);publish();invalidate();},
    sentryControl:value=>{if(match&&driving)selectSentryControl(match,driving.object.name,value);publish();invalidate();},
    sentryMark:kind=>{const r=activeRobot();if(match&&r)markSentry(match,r.id,`${r.team}-${kind}`);publish();invalidate();},
    armorFortify:(x,y)=>{const r=activeRobot();if(match&&r){const c=recommendedArmorCenter(match,r.team);fortifyArmor(match,r.team,{x:x??c.x,y:y??c.y});}publish();invalidate();},
    dartSelect:value=>{const r=activeRobot();if(match&&r)selectDart(match,r.team,value);publish();invalidate();},
    dartOpen:()=>{const r=activeRobot();if(match&&r)openDart(match,r.team);publish();invalidate();},
    dartFire:()=>{const r=activeRobot();if(match&&r)launchDart(match,r.team);publish();invalidate();},
    dispose() {
      disposed = true;
      abort.abort();
      clearInput();
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      canvas.removeEventListener("pointerdown", pointerdown);
      canvas.removeEventListener("pointermove", pointermove);
      canvas.removeEventListener("pointerup", pointerup);
      canvas.removeEventListener("pointercancel", pointerup);
      canvas.removeEventListener("lostpointercapture", pointerup);
      document.removeEventListener("mousemove", mousemove);
      document.removeEventListener("pointerlockchange", lockchange);
      document.removeEventListener("visibilitychange",visibilityChange);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clearInput);
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      projectiles.dispose();
      disposeObjects(scene);
      for(const old of mechanism?.old??[])disposeObjects(old);
      for(const old of coreGeometry?.old??[])disposeObjects(old);
      environment.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

function disposeObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      if (object instanceof THREE.InstancedMesh) object.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    } else if (object instanceof THREE.Sprite) materials.add(object.material);
  });
  for (const material of materials) {
    if (material instanceof THREE.MeshStandardMaterial) {
      for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) if (texture) textures.add(texture);
    } else if (material instanceof THREE.SpriteMaterial && material.map) textures.add(material.map);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
}