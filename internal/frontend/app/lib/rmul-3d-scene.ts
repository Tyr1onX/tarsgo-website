import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { frameArena, lookDirection, turnView } from "./rmuc-3d-camera";
import { resolveCadModel } from "./rmul-3d-cad-assets";
import { MECHANISM_ASSET, installMechanisms, type Team } from "./rmuc-3d-mechanisms";
import { createMatch, startMatch, updateMatch, purchaseAmmo, canPurchaseAmmo, purchaseHealth, canPurchaseHealth, remoteHealthCost, canFire, territoryStatus, ammoOffer, revivalStatus, reviveRobot, launcherStatus, installLauncher, activateRune, runeStatus, runeLights, controlsOutpost, type Match } from "./rmuc-3d-match";
import { traceArenaShot, resolveArenaShot } from "./rmuc-3d-shot";
import { SHOT_STYLE, SHOT_LIFE } from "./pixel-jijia-shot-style";
import { addRobotPreviews, aimWeapon, aimWeaponAt } from "./rmuc-3d-robots";
import { createArenaTerrain, moveOnArena, nearestDriveable, supportedHeight, PLAYER_RADIUS, type ArenaTerrain } from "./rmuc-3d-terrain";
import { findArenaPath, advanceBot } from "./rmuc-3d-navigation";
import { ARENA_ZONES, zonesAtPosition, type ZoneKind } from "./rmuc-3d-zones";
import { createStadium, STADIUM_WIDTH, STADIUM_DEPTH } from "./rmuc-3d-stadium";

export type FieldView = "all" | "red" | "blue" | "top";
export type ArenaView = FieldView | "first" | "third";
type SideStatus = { base:number; outpost:number; outpostOwner:Team; alive:number; control:number; outpostArea:ReturnType<typeof territoryStatus>; baseArea:ReturnType<typeof territoryStatus>; cover:boolean };
export type ArenaStatus = { view: ArenaView; robot: string | null; nearby: string | null; match?: { phase: Match["phase"]; seconds: number; winner: Match["winner"]; sides: Record<Team,SideStatus>; coins: number; ammo: number; hp: number; buff: number; rune:ReturnType<typeof runeStatus>|null; canBuy: boolean; canFire: boolean; heat: number; heatLimit: number; thermalLock: boolean; pendingAmmo: number; pendingHeal: number; healCost: number; canHeal: boolean; maxHp: number; ammoCount:number; ammoCost:number; revival:ReturnType<typeof revivalStatus>|null; launcher:ReturnType<typeof launcherStatus>|null } };
export interface ArenaController {
  view: (side: ArenaView) => void;
  interact: () => void;
  start: () => void;
  buy: () => void;
  heal: () => void;
  revive: (paid:boolean) => void;
  fire: () => void;
  install: () => void;
  rune: () => void;
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
  let match: Match | null = null;
  let matchTime: number | null = null;
  let nextBotTurn = 0;
  let botCursor = 0;
  const shotRay = new THREE.Raycaster();
  const shotEffects: { group: THREE.Group; remaining: number }[] = [];
  const shotGeometry = new THREE.BoxGeometry(1,1,1);
  const botPaths = new Map<Robot,{goal:THREE.Vector3;points:THREE.Vector3[];retryAt:number;search?:ReturnType<typeof findArenaPath>}>();
  const armorCenters = new Map<Robot,{object:THREE.Object3D;center:THREE.Vector3}[]>();
  const initial = new Map<Robot, { position: THREE.Vector3; yaw: number }>();
  const roster = () => robots.filter(r=>r.object.userData.area==="field").map(r=>({id:r.object.name,team:r.object.userData.team as Team,heavy:r.object.name.includes("hero"),sentry:r.object.name.includes("sentinel"),maxHp:r.object.name.includes("hero")?400:200}));
  const activeRobot = () => match?.robots.find(r=>r.id===driving?.object.name);
  let mode: ArenaView = "first";
  let look = { yaw: -.7, pitch: -.08 };
  let paused = false;
  let lastTime: number | null = null;
  let lastStatus = "";
  const keys = new Set<string>();
  const clock = new THREE.Vector3(), forward = new THREE.Vector3(), eye = new THREE.Vector3();
  const abort = new AbortController();

  const nearby = () => ready && !driving && isPlaying(mode) ? nearestDriveable(explorer, robots) : null;
  function publish() {
    const vehicle = activeRobot();
    const side = vehicle&&match?.sides[vehicle.team];
    const teamStatus=(team:Team):SideStatus=>{
      const side=match!.sides[team];
      return {base:side.base,outpost:side.outpost,outpostOwner:side.outpostOwner,alive:match!.robots.filter(r=>r.team===team&&r.hp>0).length,control:Math.floor(side.controlTicks/10),
        outpostArea:territoryStatus(match!,team,"outpost"),baseArea:territoryStatus(match!,team,"base"),cover:side.cover};
    };
    const offer=match&&vehicle?ammoOffer(match,vehicle):null;
    const rune=match&&vehicle?runeStatus(match,vehicle.team):null;
    const status: ArenaStatus = { view: mode, robot: driving?.name ?? null, nearby: nearby()?.name ?? null,
      match: match ? {phase:match.phase,seconds:Math.ceil(420-match.elapsed),winner:match.winner,sides:{red:teamStatus("red"),blue:teamStatus("blue")},
        coins:side?.coins??0,ammo:vehicle?.ammo??0,hp:vehicle?.hp??0,buff:Math.ceil(rune?.buff??0),rune:rune&&vehicle&&!vehicle.heavy?{...rune,buff:Math.ceil(rune.buff)}:null,
        canBuy:!!vehicle&&canPurchaseAmmo(match,vehicle),canFire:!!vehicle&&canFire(match,vehicle),
        heat:Math.ceil(vehicle?.heat??0),heatLimit:vehicle?.heatLimit??0,thermalLock:vehicle?.thermalLock??false,
        pendingAmmo:vehicle?.pendingAmmoAt!=null?Math.max(0,Math.ceil(vehicle.pendingAmmoAt-match.elapsed)):0,
        pendingHeal:vehicle?.pendingHealAt!=null?Math.max(0,Math.ceil(vehicle.pendingHealAt-match.elapsed)):0,
        healCost:remoteHealthCost(match),canHeal:!!vehicle&&canPurchaseHealth(match,vehicle),maxHp:vehicle?.maxHp??0,ammoCount:offer?.count??100,ammoCost:offer?.cost??150,revival:vehicle?revivalStatus(match,vehicle):null,launcher:vehicle?.heavy?launcherStatus(match,vehicle):null} : undefined };
    const signature = JSON.stringify(status);
    if (signature !== lastStatus) { lastStatus = signature; onStatus(status); }
  }

  function invalidate() {
    if (!disposed && !frame) frame = requestAnimationFrame(render);
  }

  function updateVisibility() {
    for (const robot of robots) robot.object.visible = (mode !== "first" || driving !== robot) && match?.robots.find(r=>r.id===robot.object.name)?.hp!==0;
  }

  function syncCamera() {
    if (!ready || !terrain || !isPlaying(mode)) return;
    const target = driving?.position ?? explorer;
    const { yaw } = look;
    lookDirection(look, forward);
    eye.copy(target).y += driving?.eyeHeight ?? 1.6;
    camera.up.set(0, 1, 0);
    if (driving) {
      const sight = aimWeapon(driving.object, yaw, look.pitch);
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
    const elapsed = matchTime===null?0:Math.max(0,(time-matchTime)/1000);
    matchTime=time;
    if(match&&mechanism&&match.phase==="running"){
      updateMatch(match,elapsed,new Map(robots.filter(r=>r.object.userData.area==="field").map(r=>[r.object.name,r.position])));
      mechanism.apply(match.pose);mechanism.setRuneLights(runeLights(match,"red"),runeLights(match,"blue"));
      if(match.phase==="running" && match.elapsed>=nextBotTurn){
        nextBotTurn=match.elapsed+.12;
        updateBots();
      }
      const searchBudget=performance.now()+4;
      for(const [bot,route] of botPaths){
        if(bot===driving||match.robots.find(r=>r.id===bot.object.name)?.hp===0){botPaths.delete(bot);continue;}
        if(!route.search)continue;
        do{
          const step=route.search.next();
          if(step.done){route.points=step.value;route.search=undefined;break;}
        }while(performance.now()<searchBudget);
        if(performance.now()>=searchBudget)break;
      }
      if(driving&&activeRobot()?.hp===0)clearInput();
      updateVisibility();
      invalidate();
    }
    for(let i=shotEffects.length-1;i>=0;i--){
      const shot=shotEffects[i];shot.remaining-=elapsed;
      if(shot.remaining<=0){shot.group.removeFromParent();shot.group.traverse(o=>{if(o instanceof THREE.Mesh)(o.material as THREE.Material).dispose()});shotEffects.splice(i,1);}
      else {shot.group.traverse(o=>{if(o instanceof THREE.Mesh)(o.material as THREE.MeshBasicMaterial).opacity=shot.remaining/SHOT_LIFE});invalidate();}
    }
    if (ready && terrain && isPlaying(mode)) {
      const dt = lastTime === null ? 0 : Math.min(.05, (time - lastTime) / 1000);
      const f = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
      const r = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
      const horizontal = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
      const vertical = Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp"));
      if (horizontal || vertical) look = turnView(look, horizontal * dt * 520, vertical * dt * 520);
      const { yaw } = look;
      if ((f || r)&&activeRobot()?.hp!==0) {
        const target = driving?.position ?? explorer;
        const radius = driving?.radius ?? PLAYER_RADIUS;
        const speed = driving ? 2.6 : keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3.6 : 2.2;
        const norm = Math.hypot(f, r);
        const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * r) * speed * dt / norm;
        const dz = (-Math.cos(yaw) * f - Math.sin(yaw) * r) * speed * dt / norm;
        const oldX = target.x, oldZ = target.z;
        moveOnArena(terrain, target, dx, dz, radius, driving ? .23 : .34,
          robots.filter(robot => robot !== driving && match?.robots.find(m=>m.id===robot.object.name)?.hp!==0 && Math.abs(robot.position.y - target.y) < 1.15));
        const traveled = Math.hypot(target.x - oldX, target.z - oldZ);
        if (driving && traveled > .00001) {
          driving.object.rotation.y = Math.atan2(-(target.x - oldX), -(target.z - oldZ));
          // Chassis faces its actual travel direction, so wheels always roll forward.
          const direction = 1;
          driving.object.traverse(object => {
            if (object.name.startsWith("wheel-")) object.rotation.x += direction * traveled / driving!.wheelRadius;
          });
        }
      }
      if (f || r || horizontal || vertical) {
        lastTime = time;
        invalidate();
      } else lastTime = null;
      syncCamera();
      publish();
    } else if (controls.enabled) controls.update();
    publish();
    renderer.render(scene, camera);
    if(match?.phase!=="running"&&!shotEffects.length&&!keys.size) matchTime=null;
  }

  function setView(next: ArenaView) {
    if (!ready) return;
    keys.clear();
    lastTime = null;
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
    matchTime=null;
    startMatch(match);
    publish();invalidate();
  }
  function revive(paid:boolean) {
    if(match&&driving){reviveRobot(match,driving.object.name,paid);publish();invalidate();}
  }
  function heal() {
    if(match&&driving){purchaseHealth(match,driving.object.name);publish();invalidate();}
  }
  function buy() {
    if(match&&driving){purchaseAmmo(match,driving.object.name);publish();invalidate();}
  }
  function reset() {
    if(!match||!mechanism||!terrain)return;
    match=createMatch(roster());
    nextBotTurn=0;botCursor=0;botPaths.clear();
    for(const [robot,pose] of initial){robot.position.copy(pose.position);robot.object.rotation.y=pose.yaw;robot.object.getObjectByName("gimbal")?.rotation.set(0,0,0);robot.object.getObjectByName("weapon-pitch")?.rotation.set(0,0,0);}
    for(const shot of shotEffects){shot.group.removeFromParent();shot.group.traverse(o=>{if(o instanceof THREE.Mesh)(o.material as THREE.Material).dispose()});}
    shotEffects.length=0;
    driving=null;clearInput();look={yaw:-.7,pitch:-.08};explorer.set(-10,terrain.heightAt(-10,-1.25),-1.25);
    mechanism.apply(match.pose);mechanism.setRuneLights(runeLights(match,"red"),runeLights(match,"blue"));updateVisibility();setView("first");publish();invalidate();
  }
  function install(){
    if(match&&driving){installLauncher(match,driving.object.name);publish();invalidate();}
  }
  function fire() {
    if(!ready||paused||!isPlaying(mode)||!driving||!match||!map)return;
    syncCamera();
    const shot = aimWeapon(driving.object,look.yaw,look.pitch);
    if (shot) shoot(driving,shot.origin,shot.direction);
  }
  function shotTargets(robot: Robot) {
    return [map!, ...robots.filter(r=>r!==robot&&r.object.userData.area==="field"&&match?.robots.find(m=>m.id===r.object.name)?.hp!==0).map(r=>r.object)];
  }
  function trace(robot: Robot, from: THREE.Vector3, direction: THREE.Vector3) {
    return map ? traceArenaShot(shotRay,shotTargets(robot),from,direction) : undefined;
  }
  function updateBots() {
    if(!match||!terrain||!mechanism)return;
    const field=robots.filter(r=>r.object.userData.area==="field");
    const available=field.filter(bot=>bot!==driving);
    const bot=available[botCursor++%available.length];
    if(!bot)return;
    const state=match.robots.find(m=>m.id===bot.object.name)!;
    const side=match.sides[state.team],enemyTeam=state.team==="red"?"blue":"red",enemySide=match.sides[enemyTeam];
    const revival=revivalStatus(match,state);
    if(revival.dead){
      botPaths.delete(bot);
      if(revival.canConfirm)reviveRobot(match,state.id);
      else if(revival.canPay&&side.coins>revival.cost+300&&match.elapsed>300)reviveRobot(match,state.id,true);
      return;
    }
    const active=field.filter(r=>match!.robots.some(m=>m.id===r.object.name&&m.hp>0));
    const enemies=active.filter(r=>r.object.userData.team!==state.team)
      .sort((a,b)=>a.position.distanceToSquared(bot.position)-b.position.distanceToSquared(bot.position));
    const zoneGoal=(team:Team,kind:ZoneKind)=>{
      const zone=ARENA_ZONES.find(z=>z.team===team&&z.kind===kind)!;
      if(zonesAtPosition(bot.position).includes(zone.id))return bot.position.clone();
      const [x,z]=zone.goal;
      const offsets=state.sentry?[[0,0],[.5,.4],[-.5,-.4]]:state.id.includes("03")?[[.5,.4],[0,0],[-.5,-.4]]:[[-.5,-.4],[0,0],[.5,.4]];
      for(const [dx,dz] of offsets){
        const p=new THREE.Vector3(x+dx,terrain!.heightAt(x+dx,z+dz),z+dz);
        if(zonesAtPosition(p).includes(zone.id)&&supportedHeight(terrain!,p.x,p.z,bot.radius,p.y,.23)!==null)return p;
      }
      return new THREE.Vector3(x,terrain!.heightAt(x,z),z);
    };
    const supply=zoneGoal(state.team,"supply");
    const repair=ARENA_ZONES.filter(z=>z.kind==="outpost"&&controlsOutpost(match!,z.team,state.team,true))
      .map(z=>zoneGoal(z.team,"outpost")).sort((a,b)=>a.distanceToSquared(bot.position)-b.distanceToSquared(bot.position))[0];
    const recovering=revival.weak||state.hp<state.maxHp*.55;
    if(state.hp<state.maxHp*.5&&canPurchaseHealth(match,state)&&side.coins>remoteHealthCost(match)+150)purchaseHealth(match,state.id);
    if(state.heavy&&launcherStatus(match,state).canInstall)installLauncher(match,state.id);
    const needsLauncher=state.heavy&&state.launcher==="unlocked";
    const armed=!state.heavy||state.launcher==="ready"||state.launcher==="test";
    if(armed&&state.ammo<(state.heavy?3:state.sentry?80:20))purchaseAmmo(match,state.id);
    if(state.heavy&&state.launcher==="test"&&canFire(match,state)){
      const shot=aimWeapon(bot.object,bot.object.rotation.y,0);
      if(shot)shoot(bot,shot.origin,shot.direction);
    }
    const needAmmo=armed&&!state.ammo&&state.pendingAmmoAt===null;
    let goal:THREE.Vector3;
    if(needsLauncher){
      goal=supply;
    }else if(recovering||needAmmo){
      goal=repair&&repair.distanceToSquared(bot.position)<supply.distanceToSquared(bot.position)?repair:supply;
    }else if(!controlsOutpost(match,state.team,state.team)||side.outpostArea.progress>0){
      goal=zoneGoal(state.team,state.sentry?"outpost":"central");
    }else if(match.elapsed>=180&&controlsOutpost(match,enemyTeam,state.team)&&!enemySide.cover){
      goal=zoneGoal(enemyTeam,"fortress");
    }else if(!controlsOutpost(match,enemyTeam,state.team,true)){
      goal=zoneGoal(enemyTeam,state.sentry||state.id.includes("04")?"central":"outpost");
    }else{
      goal=zoneGoal(enemyTeam,state.sentry?"central":"base");
    }
    if(state.heavy&&state.launcher==="locked"&&!recovering)goal=zoneGoal(state.team,"central");
    if(canFire(match,state)&&!revival.weak){
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
        const shot=aimWeaponAt(bot.object,point);
        if(!shot)continue;
        let hit:THREE.Object3D|null=trace(bot,shot.origin,shot.direction)?.object??null;
        while(hit&&!hit.userData.target)hit=hit.parent;
        const target=hit?.userData.target;
        if(target?.type==="outpost"&&match.sides[target.team as Team].outpostOwner!==state.team||target?.type==="robot"&&enemies.some(r=>r.object.name===target.id)){
          shoot(bot,shot.origin,shot.direction);break;
        }
      }
    }
    // Territory objectives still matter while firing, cooling, or waiting for ammo.
    if(Math.hypot(goal.x-bot.position.x,goal.z-bot.position.z)<.22){botPaths.delete(bot);return;}
    const occupants=active.filter(r=>r!==bot&&Math.abs(r.position.y-bot.position.y)<1.15);
    const before=bot.position.clone();
    let route=botPaths.get(bot);
    if(route&&route.goal.distanceTo(goal)>.5){botPaths.delete(bot);route=undefined;}
    while(route?.points.length&&bot.position.distanceTo(route.points[0])<.12)route.points.shift();
    if(route?.search)return;
    const next=route?.points[0]??goal;
    const moved=advanceBot(terrain,bot,next,occupants);
    if(!moved&&(!route||match.elapsed>=route.retryAt)){
      route={goal:goal.clone(),points:[],search:findArenaPath(terrain,bot.position.clone(),goal.clone(),bot.radius,.4),retryAt:match.elapsed+4};
      botPaths.set(bot,route);
    }
    const delta=bot.position.clone().sub(before);
    if(delta.length()>.01){
      const yaw=Math.atan2(-delta.x,-delta.z);
      bot.object.rotation.y=yaw;aimWeapon(bot.object,yaw,0);
      bot.object.traverse(o=>{if(o.name.startsWith("wheel-"))o.rotation.x+=delta.length()/bot.wheelRadius;});
      bot.object.updateMatrixWorld(true);
    }
  }
  function shoot(robot:Robot,from:THREE.Vector3,direction:THREE.Vector3) {
    if(!match||!map)return;
    scene.updateMatrixWorld(true);
    const shot=resolveArenaShot(match,robot.object.name,shotRay,shotTargets(robot),from,direction);
    if(!shot)return;
    const {shooter,hit,to}=shot;
    const group=new THREE.Group(), style=SHOT_STYLE[shooter.team], delta=to.clone().sub(from);
    const trail=new THREE.Mesh(shotGeometry,new THREE.MeshBasicMaterial({color:style.trail,transparent:true,depthWrite:false,toneMapped:false}));
    trail.position.copy(from).addScaledVector(delta,.5);trail.scale.set(.025,.025,delta.length());trail.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize());
    group.add(trail);
    if(hit){const flash=new THREE.Mesh(shotGeometry,new THREE.MeshBasicMaterial({color:style.impact,transparent:true,depthWrite:false,toneMapped:false}));flash.position.copy(to);flash.scale.setScalar(.09);group.add(flash);}
    scene.add(group);shotEffects.push({group,remaining:SHOT_LIFE});publish();invalidate();
  }
  function interact() {
    if (!ready || paused || !terrain || !isPlaying(mode)) return;
    if (driving) {
      const robot = driving;
      for (let i = 0; i < 12; i++) {
        const angle = look.yaw + i * Math.PI / 6;
        const distance = robot.radius + PLAYER_RADIUS + .16;
        const x = robot.position.x + Math.cos(angle) * distance, z = robot.position.z + Math.sin(angle) * distance;
        const y = supportedHeight(terrain, x, z, PLAYER_RADIUS, robot.position.y, .48);
        if (y === null || robots.some(other => other !== robot && Math.abs(other.position.y - y) < 1.15
          && Math.hypot(x - other.position.x, z - other.position.z) < PLAYER_RADIUS + other.radius)) continue;
        explorer.set(x, y, z);
        driving = null;
        break;
      }
    } else {
      const robot = nearby();
      if (robot) {
        driving = robot;
        botPaths.delete(robot);
        look = { yaw: robot.object.rotation.y, pitch: -.05 };
      }
    }
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
    if (!ready || paused || event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
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
  function clearInput() { keys.clear(); lastTime = null; }
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
    const [field,parts]=await Promise.all([loadAsset(asset),loadAsset(MECHANISM_ASSET)]);
    if(disposed){disposeObjects(field);disposeObjects(parts);return;}
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
    terrain = createArenaTerrain(root);
    // Ground support uses the original static CAD envelope. Visible/shot geometry uses the articulated replacements.
    mechanism=installMechanisms(field,parts);
    exhibit = addRobotPreviews(map, scene, terrain);
    robots = exhibit.children.map(object => {
      const group = object as THREE.Group;
      return { object: group, position: group.position, radius: group.userData.radius,
        driveable: group.userData.driveable === true, name: group.userData.name,
        eyeHeight: group.userData.eyeHeight ?? 1, wheelRadius: group.userData.wheelRadius ?? .12 };
    });
    for(const robot of robots){initial.set(robot,{position:robot.position.clone(),yaw:robot.object.rotation.y});if(robot.object.userData.area==="field")robot.object.traverse(o=>{if(o.userData.hitPlate&&o instanceof THREE.Mesh){o.userData.target={type:"robot",id:robot.object.name};o.geometry.computeBoundingBox();const list=armorCenters.get(robot)??[];list.push({object:o,center:o.geometry.boundingBox!.getCenter(new THREE.Vector3())});armorCenters.set(robot,list);}});}
    match=createMatch(roster());
    // Three.js raycasting can reject misses against local geometry boxes
    // before testing triangles; important for the large CAD field.
    scene.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.computeBoundingBox();});
    explorer.set(-10, terrain.heightAt(-10, -1.25), -1.25);
    ready = true;
    setView("first");
    onReady();
  })().catch(() => {
    if (!disposed) onError("三维场地加载失败，请刷新重试");
  });

  return {
    view: setView, interact, input, pauseInput, start, buy, heal, revive, install, fire, reset,rune:()=>{if(match&&driving)activateRune(match,driving.object.name);publish();invalidate();},
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
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clearInput);
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      disposeObjects(scene);
      for(const old of mechanism?.old??[])disposeObjects(old);
      shotGeometry.dispose();
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