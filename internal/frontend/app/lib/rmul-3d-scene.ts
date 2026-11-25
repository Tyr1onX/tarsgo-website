import {createMatchAudio,eventCue,audioVisible} from "./rmuc-3d-audio";
import {createDirector,type Shot} from "./rmuc-3d-director";
import {createEventFeed} from "./rmuc-3d-events";
import {readRobotSight,followOffset,translatedOrbit} from "./rmuc-3d-spectator";
import {createRobotFeedback} from "./rmuc-3d-robot-feedback";
import { GROUND_ROSTER, groundIdentity } from "./rmuc-3d-identity";
import {airPadCenters,createAirSystem,type AirVehicle} from "./rmuc-3d-air";
import {validExperiment,roundConfig,createRoundTelemetry,summarizeRound,type ExperimentConfig,type ExperimentProgress,type ExperimentRound,type TaskDecision} from "./rmuc-3d-experiment";
import {chooseTask,defaultStrategy,validStrategy,type Strategy,type TaskCandidate,type TaskKind,type WeightKey} from "./rmuc-3d-strategy";
import {type RadarReport,radarPosition,radarOpportunities,activateRadarDouble,radarVulnerability} from "./rmuc-3d-radar";
import { ArenaClock, SIM_STEP_MS, PATH_CHECKS_PER_STEP } from "./rmuc-3d-clock";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { frameArena, lookDirection, turnView, flightBounds, flightStep } from "./rmuc-3d-camera";
import { CAD_MODELS, resolveCadModel } from "./rmul-3d-cad-assets";
import { CORE_ASSET, DART_ASSET, MECHANISM_ASSET, installCoreGeometry, installMechanisms, type Team } from "./rmuc-3d-mechanisms";
import { createMatch, startMatch, updateMatch, purchaseAmmo, canPurchaseAmmo, purchaseHealth, canPurchaseHealth, remoteHealthCost, canFire, territoryStatus, ammoOffer, revivalStatus, reviveRobot, launcherStatus, installLauncher, removeLauncher, activateRune, runeStatus, runeLights, controlsOutpost, robotLevel, reserveAmmo, driveSpeed, canSpinChassis, chassisStatus, sentryStatus, switchSentry, type SentryMode, type SentryControl, selectSentryControl, sentryCommandCost, markSentry, type InfantryPerformance, selectInfantryPerformance, energyStatus, pickupEnergy, dropEnergy, assemblyStatus, beginAssembly, assemblyAction, cancelAssembly, technologyLevel, terrainStatus, canDriveRobot, armorStatus,fortifyArmor,recommendedArmorCenter,dartStatus,selectDart,openDart,launchDart,type DartMode, type Difficulty, type Match, type DamageEvent,type MatchEvent } from "./rmuc-3d-match";
import { traceArenaShot, createArenaShotPreparer, SHOT_RANGE, type ShotIndex, arenaHitTarget, bindArmorFrame, aliasArmorFrames } from "./rmuc-3d-shot";
import { createArmorGlow } from "./rmuc-3d-lighting";
import { createDartVisual } from "./rmuc-3d-dart-visual";
import { createProjectileSystem, projectileSpeed, softGlowTexture } from "./rmuc-3d-projectiles";
import { addRobotPreviews, aimWeapon, previewWeaponAt, bindLauncherModule, setArmorLight } from "./rmuc-3d-robots";
import { createArenaTerrain, moveOnArena, nearestDriveable, supportedHeight, PLAYER_RADIUS, type ArenaTerrain } from "./rmuc-3d-terrain";
import { findArenaPath, stepChassis, clearDefeatedPath, turnTowards, angleDelta, type ChassisMotion } from "./rmuc-3d-navigation";
import { ARENA_ZONES, zonesAtPosition, launcherBench, type ZoneKind } from "./rmuc-3d-zones";
import { createStadium, STADIUM_WIDTH, STADIUM_DEPTH } from "./rmuc-3d-stadium";
import { arenaPixelRatio, type ArenaSettings } from "./rmuc-3d-settings";
import {boundedMove,movementIntent,ZERO_MOVE,type MoveVector} from "./rmuc-3d-input";

export type FieldView = "all" | "red" | "blue" | "top";
export type ArenaView = FieldView | "first" | "third" | "follow" | "ai-first" | "detail";
type MapTrack={id:string;number:string;team:Team;x:number;z:number;progress:number;localized:boolean;stale:boolean};
type RadarSummary={opportunities:number;doubleUntil:number;encryptionLevel:number};
type RadarMap={image:string;perspective:"all"|Team;tracks:MapTrack[];summary:Partial<Record<Team,RadarSummary>>};
type RobotStatus={id:string;number:string;kind:"heavy"|"infantry"|"sentry";hp:number;maxHp:number;detail?:{level:number;powerOff:boolean;launcherLocked:boolean;revival:number|null;weak:boolean;immune:boolean;damage:number}};
type SideStatus = { base:number; outpost:number; baseDamage:number;outpostDamage:number;coins:number|null;technology:number|null;robots:RobotStatus[];outpostOwner:Team; control:number; outpostArea:ReturnType<typeof territoryStatus>; baseArea:ReturnType<typeof territoryStatus> };
export type ArenaStatus = { sound?:boolean; director?:boolean;canDirect?:boolean;countdown?:number;flightSpeed?:number; events?:ReturnType<ReturnType<typeof createEventFeed>["view"]>; experiment?:ExperimentProgress; air?:ReturnType<ReturnType<typeof createAirSystem>["view"]>; radarMap?:RadarMap; view: ArenaView; focus?: {id:string;number:string;kind:RobotStatus["kind"];team:Team;manual:boolean;sight:boolean;demand:number;spin:boolean;canSpin:boolean;canTakeControl:boolean}; selected?:string|null; robot: string | null; nearby: string | null; match?: { phase: Match["phase"]; seconds: number; winner: Match["winner"]; sides: Record<Team,SideStatus>; coins: number; ammo: number; reserve:number; power:ReturnType<typeof chassisStatus>|null; stance:ReturnType<typeof sentryStatus>; performance:InfantryPerformance|null; hp: number; level:number; xp:number|null; buff: number; rune:ReturnType<typeof runeStatus>|null; canBuy: boolean; canFire: boolean; heat: number; heatLimit: number; thermalLock: false|"cooling"|"permanent"; pendingAmmo: number; pendingHeal: number; healCost: number; canHeal: boolean; maxHp: number; ammoCount:number; ammoCost:number; revival:ReturnType<typeof revivalStatus>|null; launcher:ReturnType<typeof launcherStatus>|null; energy:ReturnType<typeof energyStatus>|null; technology:ReturnType<typeof assemblyStatus>|null; dart:ReturnType<typeof dartStatus>|null; armor:ReturnType<typeof armorStatus>|null; terrain:ReturnType<typeof terrainStatus>|null } };
export type ArenaLoadProgress = { phase:"program"|"download"|"verify"|"parse"|"terrain"|"initialize"|"firstFrame"; received?:number; total?:number };
export interface ArenaController {
  view: (side: ArenaView) => void;
  director: (enabled:boolean)=>void;
  cancelStart:()=>void;
  interact: () => void;
  observe:(id:string)=>void;
  takeControl:()=>void;
  toggleSpin:()=>void;
  start: () => void;
  configureSeed: (value:number)=>boolean;
  configureStrategies:(value:Record<Team,Strategy>)=>boolean;
  startExperiment:(config:ExperimentConfig)=>boolean;
  cancelExperiment:()=>void;
  radarView:(value:"all"|Team)=>void;
  radarDouble:()=>void;
  airStop:(team:Team)=>void;
  buy: () => void;
  heal: () => void;
  revive: (paid:boolean) => void;
  fire: (source:string,pressed:boolean) => void;
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
  move: (id:number,vector:MoveVector|null,begin?:boolean) => boolean;
  touchAction: (id:number,key:string,pressed:boolean) => void;
  pause: (paused: boolean) => void;
  settings: (value:ArenaSettings) => void;
  dispose: () => void;
}

type Robot = { object: THREE.Group; position: THREE.Vector3; radius: number; driveable: boolean; name: string; eyeHeight: number; wheelRadius: number };
const isPlaying = (view: ArenaView) => view === "first";

export function mountArena(
  host: HTMLDivElement,
  initialSettings: ArenaSettings,
  onProgress: (progress:ArenaLoadProgress) => void,
  onReady: () => void,
  onError: (message: string) => void,
  onStatus: (status: ArenaStatus) => void,
  onInputReset:()=>void,
): ArenaController {
  const programStarted=performance.now();
  const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
  let settings=initialSettings;
  const pixelRatio=()=>arenaPixelRatio(settings.quality,window.devicePixelRatio,navigator.hardwareConcurrency,(navigator as Navigator&{deviceMemory?:number}).deviceMemory);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111922);
  scene.fog = new THREE.Fog(0x111922, 65, 180);
  const camera = new THREE.PerspectiveCamera(72, 1, .025, 220);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(pixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // A small generated environment makes metal surfaces readable without any
  // downloaded textures. Direct lights still determine arena illumination.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04, .1, 100, { size: 128 });
  scene.environment = environment.texture;
  scene.environmentIntensity = .48;
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
  const hemisphere=new THREE.HemisphereLight(0xdceaff, 0x50515b, 1.0);scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff4e7, 2.3);
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

  let disposed = false, ready = false, frame = 0, firstFrameStarted=0;
  const pendingAssets=new Set<THREE.Group>();
  let map: THREE.Group | null = null;
  let fieldBounds: THREE.Box3 | null = null;
  let exhibit: THREE.Group | null = null;
  let terrain: ArenaTerrain | null = null;
  let robots: Robot[] = [];
  let driving: Robot | null = null;
  let observed:Robot|null=null;
  let followTime:number|null=null;
  const followDesired=new THREE.Vector3(),followRendered=new THREE.Vector3();
  const observerRay=new THREE.Raycaster();
  let observerPointer:{id:number;x:number;y:number}|null=null;
  let mechanism: ReturnType<typeof installMechanisms> | null = null;
  let air:ReturnType<typeof createAirSystem>|null=null;
  let dartVisual:ReturnType<typeof createDartVisual>|null=null;
  let armorGlow:ReturnType<typeof createArmorGlow>|null=null;
  let robotFeedback:ReturnType<typeof createRobotFeedback>|null=null;
  let coreGeometry: ReturnType<typeof installCoreGeometry> | null = null;
  let match: Match | null = null;
  const simClock=new ArenaClock();
  let seed=crypto.getRandomValues(new Uint32Array(1))[0];
  let strategies:Record<Team,Strategy>={red:defaultStrategy(),blue:defaultStrategy()};
  const taskLog:TaskDecision[]=[];
  let experiment:{config:ExperimentConfig;running:boolean;results:ExperimentRound[];telemetry:ReturnType<typeof createRoundTelemetry>|null}|null=null;
  const experimentChannel=new MessageChannel();
  let experimentQueued=false;
  function queueExperiment(){
    if(experiment?.running&&!experimentQueued&&!disposed&&!document.hidden){experimentQueued=true;experimentChannel.port2.postMessage(null);}
  }
  experimentChannel.port1.onmessage=()=>{
    experimentQueued=false;
    if(disposed||!experiment?.running||!match||document.hidden)return;
    simClock.debt+=SIM_STEP_MS*8;
    simClock.run(simulate,8);
    if(match.phase==="finished"){
      experiment.results.push(summarizeRound(match,experiment.config,experiment.results.length,taskLog,experiment.telemetry!));
      if(experiment.results.length===experiment.config.pairs*2){experiment.running=false;publish();invalidate();return;}
      beginExperimentRound();
    }else if(simClock.tick%80===0)invalidate();
    queueExperiment();
  };
  function beginExperimentRound(){
    if(!experiment)return;
    const config=roundConfig(experiment.config,experiment.results.length);
    seed=config.seed;strategies=structuredClone(config.strategies);
    reset();setView("all");experiment.telemetry=createRoundTelemetry(match!);match!.onSpend=experiment.telemetry.spend;start();
  }
  function startExperiment(config:ExperimentConfig){
    if(!ready||!match||countdownEnd||match.phase==="running"||experiment?.running||!validExperiment(config))return false;
    experiment={config:structuredClone(config),running:true,results:[],telemetry:null};
    beginExperimentRound();queueExperiment();return true;
  }
  function cancelExperiment(){
    if(!experiment?.running)return;
    experiment.running=false;reset();
  }
  let radarPerspective:"all"|Team="all";
  let mapImage="";
  const radarOrigins={red:new THREE.Vector3(14.58,2.55,0),blue:new THREE.Vector3(-14.58,2.55,0)};
  const radarRay=new THREE.Raycaster();
  let viewportHeight=1;
  let nextBotTurn = 0;
  let botCursor = 0;
  const shotRay = new THREE.Raycaster();
  const projectiles=createProjectileSystem(scene,{
    height:(x,z)=>terrain?.heightAt(x,z)??-Infinity,
    accept:hit=>{
      for(let node:THREE.Object3D|null=hit.object;node;node=node.parent){
        if(node===mechanism?.parts||node===coreGeometry?.group||coreGeometry?.cores.some(c=>node===c.object)||mechanism?.dartBindings.some(b=>node===b.carriage||node===b.door))return false;
        if(node===map||node===ground)return true;
      }
      return false;
    }
  });
  let prepareShots:()=>ShotIndex;
  let poseShotIndex:ShotIndex|undefined;
  const shotIndex=()=>poseShotIndex??=prepareShots();
  const botObserved=new Map<Robot,{position:THREE.Vector3;radius:number}[]>();
  const botPaths = new Map<Robot,{goal:THREE.Vector3;points:THREE.Vector3[];retryAt:number;search?:ReturnType<typeof findArenaPath>;tolerance:number}>();
  const motions=new Map<Robot,ChassisMotion>();
  const defeatedPush=new Map<Robot,number>();
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
  const roster = () => GROUND_ROSTER.map(r=>({id:r.id,team:r.team,heavy:r.kind==="heavy",sentry:r.kind==="sentry",maxHp:r.kind==="heavy"?400:200}));
  const activeRobot = () => match?.robots.find(r=>r.id===driving?.object.name);
  const following=()=>mode==="follow"||mode==="ai-first"?observed:null;
  let mode: ArenaView = "first";
  let look = { yaw: -.7, pitch: -.08 };
  let paused = false;
  let lastTime: number | null = null;
  let lastStatus = "";
  const keys = new Set<string>();
  let moveOwner:number|null=null,touchMove=ZERO_MOVE;
  const touchActions=new Map<number,string>();
  function move(id:number,vector:MoveVector|null,begin=false){
    if(vector===null){if(moveOwner===id){moveOwner=null;touchMove=ZERO_MOVE;invalidate();}return false;}
    if(!ready||paused||countdownEnd||document.hidden||experiment?.running||(!isPlaying(mode)&&mode!=="third"))return false;
    if(begin&&moveOwner===null)moveOwner=id;
    if(moveOwner!==id)return false;
    touchMove=boundedMove(vector.f,vector.r);invalidate();return true;
  }
  function touchAction(id:number,key:string,pressed:boolean){
    if(!pressed){touchActions.delete(id);invalidate();return;}
    if(ready&&!paused&&!countdownEnd&&!document.hidden&&!experiment?.running&&mode==="third"&&["Space","ShiftLeft","ControlLeft"].includes(key)){
      touchActions.set(id,key);invalidate();
    }
  }
  const triggers = new Set<string>();
  let shotRequested=false;
  const clock = new THREE.Vector3(), forward = new THREE.Vector3(), eye = new THREE.Vector3();
  const abort = new AbortController();

  const manualRobot=()=>activeRobot()?.sentryControl==="auto"?null:driving;
  const nearby = () => ready && !driving && isPlaying(mode) ? nearestDriveable(explorer, robots) : null;
  const eventFeed=createEventFeed(),director=createDirector(),audio=createMatchAudio(camera);
  audio.setVolume(settings.volume);audio.setEnabled(!settings.muted);
  function applySettings(value:ArenaSettings){settings=value;const ratio=pixelRatio();if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);audio.setVolume(value.volume);audio.setEnabled(!value.muted);publish();invalidate();}
  const turnWithSettings=(dx:number,dy:number)=>turnView(look,dx*settings.sensitivity,dy*settings.sensitivity*(settings.invertY?-1:1));
  let countdownCue=0;
  const audioPerspective=() => activeRobot()?.team??(mode==="ai-first"?groundIdentity(observed?.object.name??"")?.team:undefined)??radarPerspective;
  const worldCenter=(node:THREE.Object3D|undefined)=>node?new THREE.Box3().setFromObject(node,true).getCenter(new THREE.Vector3()):undefined;
  function soundEvent(event:MatchEvent){
    if(!audioVisible(event.visibility,audioPerspective()))return;
    const cue=eventCue(event);if(!cue)return;
    const perspective=audioPerspective();
    let position: {x:number;y:number;z:number}|undefined;
    switch(event.type){
      case "dart-launch":position=dartVisual?.soundPosition(event.team);break;
      case "dart-hit":position=dartVisual?.soundPosition(event.location,event.mode);break;
      case "outpost-destroyed":case "outpost-rebuilt":position=worldCenter(mechanism?.parts.getObjectByName(event.location+"-outpost-assembly"));break;
      case "cover-opening":case "cover-open":position=worldCenter(mechanism?.parts.getObjectByName(event.location+"-base-assembly"));break;
      case "rune-start":case "rune-success":position=worldCenter(mechanism?.banks[event.team==="red"?0:1]);break;
      case "assembly-step-complete":case "assembly-end":position=worldCenter(coreGeometry?.cores[(event.core??event.team)==="red"?0:1]?.object);break;
      default:position="team" in event&&perspective!=="all"&&event.team!==perspective?undefined:"position" in event?event.position:"robot" in event?positions.get(event.robot):undefined;
    }
    audio.play(cue,position);
  }
  function impactSound(hit:THREE.Intersection,target:ReturnType<typeof arenaHitTarget>,damage:number){
    if(experiment?.running)return;
    const perspective=audioPerspective(),team=target?.type==="robot"?groundIdentity(target.id)?.team:target?.team;
    if(perspective!=="all"&&team!==perspective)return;
    audio.play(damage>0?"hit":"contact",hit.point);
  }
  let countdownEnd=0,countdownPausedAt=0,flightSpeed=6,flyBounds:THREE.Box3|null=null;
  const canDirect=()=>!!match&&match.phase==="running"&&!driving&&!experiment?.running&&radarPerspective==="all";
  function stopDirector(){if(!director.enabled)return;director.stop();controls.enabled=!paused&&mode!=="first"&&mode!=="third"&&mode!=="ai-first"&&mode!=="detail";}
  function enableDirector(){if(!canDirect())return;director.start(match!.elapsed);setView("all",true);}
  function cancelStart(){if(!countdownEnd)return;countdownEnd=0;countdownPausedAt=0;countdownCue=0;audio.stop();clearInput();publish();invalidate();}
  function showShot(shot:Shot){
    if(shot.kind==="all"){setView("all",true);return;}
    if(shot.kind==="follow"||shot.kind==="ai-first"){
      const robot=fieldRobots.find(r=>r.object.name===shot.robot);if(!robot)return;
      if(mode==="ai-first"&&observed!==robot)audio.stop();observed=robot;setView(shot.kind,true);return;
    }
    if(shot.kind!=="detail")return;
    const team=shot.team,object=shot.object;
    const node=object==="core"?coreGeometry?.cores[team==="red"?0:1]?.object:object==="rune"?mechanism?.banks[team==="red"?0:1]:mechanism?.parts.getObjectByName(team+"-"+object+"-assembly");
    if(!node){setView("all",true);return;}
    const bounds=new THREE.Box3().setFromObject(node,true),target=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    setView("detail",true);
    controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(team==="red"?-1:1,.9,1).normalize().multiplyScalar(Math.max(4,size.length()*1.4)));
    const delta=target.clone().sub(camera.position),distance=delta.length();
    const hit=traceArenaShot(observerRay,shotRoots(),camera.position,delta.normalize(),distance,shotIndex());
    // Keep an elevated establishing shot if the detail ray is occluded.
    let onTarget=false;for(let n=hit?.object;n;n=n.parent??undefined)if(n===node)onTarget=true;
    if(hit&&!onTarget&&hit.distance<distance-.3){camera.position.copy(target).add(new THREE.Vector3(0,Math.max(4,size.y+3),.5));}
    camera.lookAt(target);camera.updateMatrixWorld(true);publish();invalidate();
  }
  function recordEvent(event:MatchEvent){
    if(experiment?.running)return;
    eventFeed.add(event,performance.now());robotFeedback?.event(event);director.event(event);soundEvent(event);
  }
  function recordDamage(event:DamageEvent){
    if(experiment?.running)experiment.telemetry?.damage(event);
    robotFeedback?.damage(event);if(!experiment?.running)director.damage(event);
    const target=event.target;
    if(target.type==="robot"&&target.id===activeRobot()?.id&&activeRobot()?.hp===0)clearInput();
  }
  function damageFor(key:string){
    if(match?.phase!=="running")return 0;
    return robotFeedback?.amountFor(key,match.elapsed)??0;
  }
  function mapTracks(team:"all"|Team,operator=false):MapTrack[]{
    if(!match)return [];
    if(operator&&team!=="all"&&match.sides[team].blindUntil>match.elapsed)return [];
    return match.robots.flatMap(r=>{
      const p=positions.get(r.id);if(!p)return [];
      const observed=team==="all"?{point:p,localized:true,progress:0,reportedAt:match!.elapsed}:radarPosition(match!.radar,team,r,p);
      if(!observed)return [];
      return [{id:r.id,number:groundIdentity(r.id)!.number,team:r.team,x:Math.round(observed.point.x*100)/100,z:Math.round(observed.point.z*100)/100,progress:Math.floor(observed.progress),localized:observed.localized,stale:!observed.localized&&match!.elapsed-(observed.reportedAt??0)>.5}];
    });
  }
  function publish() {
    const focus=driving??following();
    const vehicle = match?.robots.find(r=>r.id===focus?.object.name);
    const identity=vehicle&&groundIdentity(vehicle.id);
    const side = vehicle&&match?.sides[vehicle.team];
    const perspective=activeRobot()?.team??(mode==="ai-first"?vehicle?.team:undefined)??radarPerspective;
    const teamStatus=(team:Team):SideStatus=>{
      const side=match!.sides[team],detailed=perspective==="all"||perspective===team;
      return {base:side.base,outpost:side.outpost,baseDamage:damageFor(team+"-base"),outpostDamage:damageFor(team+"-outpost"),coins:detailed?side.coins:null,technology:detailed?technologyLevel(match!,team):null,
        robots:match!.robots.filter(r=>r.team===team).map(r=>{
          const publicHealth={id:r.id,number:groundIdentity(r.id)!.number,kind:groundIdentity(r.id)!.kind,hp:r.hp,maxHp:r.maxHp};
          if(!detailed)return publicHealth;
          const revival=revivalStatus(match!,r);
          return {...publicHealth,detail:{level:robotLevel(r,match!),powerOff:r.hp===0&&!canDriveRobot(match!,r)||r.powerLockUntil>match!.elapsed,launcherLocked:r.hp===0||!!r.thermalLock||revival.weak||r.heavy&&r.launcher!=="ready"&&r.launcher!=="test",revival:revival.dead?Math.floor(revival.progress*100):null,weak:revival.weak,immune:revival.immune,damage:damageFor(r.id)}};
        }),outpostOwner:side.outpostOwner,control:Math.floor(side.controlTicks/10),
        outpostArea:territoryStatus(match!,team,"outpost"),baseArea:territoryStatus(match!,team,"base")};
    };
    const offer=match&&vehicle?ammoOffer(match,vehicle,true):null;
    const rune=match&&vehicle?runeStatus(match,vehicle.team):null;
    const power=match&&vehicle?chassisStatus(match,vehicle):null;
    const stance=match&&vehicle?sentryStatus(match,vehicle):null;
    const radarSide=(team:Team)=>({encryptionLevel:match!.radar[team].encryptionLevel,opportunities:radarOpportunities(match!.radar[team]),doubleUntil:Math.max(0,Math.ceil(match!.radar[team].doubleUntil-match!.elapsed))});
    const events=eventFeed.view(perspective,performance.now());
    if(events.items.length&&!experiment?.running)invalidate();
    const status: ArenaStatus = {sound:audio.enabled,director:director.enabled,canDirect:canDirect(),countdown:countdownEnd?Math.max(1,Math.ceil((countdownEnd-(countdownPausedAt||performance.now()))/1000)):undefined,flightSpeed:mode==="third"?flightSpeed:undefined,events,air:air?.view(perspective),experiment:experiment?{running:experiment.running,completed:experiment.results.length,total:experiment.config.pairs*2,elapsed:match?.elapsed??0,results:experiment.results.slice()}:undefined,radarMap:match&&mapImage?{image:mapImage,perspective,tracks:mapTracks(perspective,perspective!=="all"),summary:perspective==="all"?{red:radarSide("red"),blue:radarSide("blue")}:{[perspective]:radarSide(perspective)}}:undefined,view: mode,selected:observed?.object.name??null,focus:vehicle&&identity?{id:identity.id,number:identity.number,kind:identity.kind,team:identity.team,manual:manualRobot()===focus,sight:!!focus?.object.getObjectByName("weapon-muzzle"),demand:vehicle.powerDemand*(power?.limit??0),spin:!!focus&&canSpinChassis(match!,vehicle)&&!!motions.get(focus)?.spin,canSpin:!!focus&&manualRobot()===focus&&canSpinChassis(match!,vehicle),canTakeControl:!driving&&!experiment?.running&&match?.phase!=="finished"&&vehicle.hp>0&&vehicle.sentryControl!=="auto"}:undefined, robot: driving?.name ?? null, nearby: nearby()?.name ?? null,
      match: match ? {phase:match.phase,seconds:Math.ceil(420-match.elapsed),winner:match.winner,sides:{red:teamStatus("red"),blue:teamStatus("blue")},
        coins:side?.coins??0,ammo:vehicle?.ammo??0,reserve:vehicle?reserveAmmo(match,vehicle):0,power:power?{...power,buffer:Math.ceil(power.buffer),locked:Math.ceil(power.locked)}:null,stance,performance:vehicle?.performance??null,hp:vehicle?.hp??0,buff:Math.ceil(rune?.buff??0),rune:rune&&vehicle&&!vehicle.heavy?{...rune,buff:Math.ceil(rune.buff)}:null,
        canBuy:!!driving&&!!vehicle&&canPurchaseAmmo(match,vehicle,true),canFire:!!vehicle&&!!manualRobot()&&canFire(match,vehicle),
        heat:Math.ceil(vehicle?.heat??0),heatLimit:vehicle?.heatLimit??0,thermalLock:vehicle?.thermalLock??false,
        pendingAmmo:vehicle?.pendingAmmoAt!=null?Math.max(0,Math.ceil(vehicle.pendingAmmoAt-match.elapsed)):0,
        pendingHeal:vehicle?.pendingHealAt!=null?Math.max(0,Math.ceil(vehicle.pendingHealAt-match.elapsed)):0,
        healCost:remoteHealthCost(match)+(vehicle?sentryCommandCost(vehicle):0),canHeal:!!driving&&!!vehicle&&canPurchaseHealth(match,vehicle,true),maxHp:vehicle?.maxHp??0,level:vehicle?robotLevel(vehicle,match):1,xp:vehicle&&!vehicle.heavy&&!vehicle.sentry?vehicle.xp:null,ammoCount:offer?.count??100,ammoCost:offer?.cost??150,revival:vehicle?revivalStatus(match,vehicle,true):null,launcher:vehicle?.heavy?launcherStatus(match,vehicle,focus?.position):null,energy:vehicle?.heavy&&focus?energyStatus(match,vehicle,focus.position):null,technology:vehicle&&focus?assemblyStatus(match,vehicle,focus.position):null,dart:vehicle?dartStatus(match,vehicle.team):null,armor:vehicle?armorStatus(match,vehicle.team):null,terrain:vehicle?terrainStatus(match,vehicle):null} : undefined };
    const signature = JSON.stringify({...status,experiment:status.experiment?{...status.experiment,results:undefined}:undefined});
    if (signature !== lastStatus) { lastStatus = signature; onStatus(status); }
  }

  function invalidate() {
    if (!disposed && !frame) frame = requestAnimationFrame(render);
  }

  const armorLit=new Map<Robot,boolean>();
  function syncArmorLights() {
    for (const robot of robots){const state=match?.robots.find(r=>r.id===robot.object.name);
      const lit=!state||state.hp>0;
      if(armorLit.get(robot)!==lit){armorLit.set(robot,lit);setArmorLight(robot.object,lit);}
    }
  }

  function syncCamera() {
    if (!ready || !terrain || !isPlaying(mode)) return;
    const target = driving?.position ?? explorer;
    lookDirection(look, forward);
    eye.copy(target).y += driving?.eyeHeight ?? 1.6;
    camera.up.set(0, 1, 0);
    if (driving) readRobotSight(driving.object,eye,forward);
    camera.position.copy(eye);
    camera.lookAt(clock.copy(eye).add(forward));
  }

  function allowedObservation(robot:Robot){
    const perspective=mode==="ai-first"?groundIdentity(observed?.object.name??"")?.team??radarPerspective:radarPerspective;
    return !driving&&(perspective==="all"||robot.object.userData.team===perspective);
  }
  function focusPoint(robot:Robot){return robot.position.clone().add(new THREE.Vector3(0,robot.eyeHeight*.7,0));}
  function observe(id:string){
    if(!ready||driving||experiment?.running)return;
    const robot=fieldRobots.find(r=>r.object.name===id);
    if(!robot||!allowedObservation(robot))return;
    stopDirector();if(observed===robot&&mode==="follow"){publish();return;}
    observed=robot;setView("follow");
  }
  function takeControl(){
    if(!ready||!match||countdownEnd||!observed||!allowedObservation(observed)||experiment?.running||match.phase==="finished")return;
    const robot=observed;
    const state=match.robots.find(r=>r.id===robot.object.name);
    if(!state?.hp||state.sentryControl==="auto")return;
    stopDirector();audio.stop();driving=robot;clearInput();botPaths.delete(robot);shotIntents.delete(robot);motions.delete(robot);
    look={yaw:robot.object.rotation.y+(robot.object.getObjectByName("gimbal")?.rotation.y??0),pitch:robot.object.getObjectByName("weapon-pitch")?.rotation.x??0};
    setView("first");
  }
  function syncObserver(time:number){
    const robot=following();if(!robot)return;
    if(mode==="ai-first"){
      readRobotSight(robot.object,eye,forward);camera.position.copy(eye);camera.up.set(0,1,0);camera.lookAt(clock.copy(eye).add(forward));camera.updateMatrixWorld(true);
      return;
    }
    const dt=followTime===null?0:Math.min(.1,(time-followTime)/1000);followTime=time;
    translatedOrbit(camera,controls.target,focusPoint(robot),1-Math.exp(-dt*11));
    controls.update();
    // Keep the intended orbit separate from the actual obstructed camera.
    // Restoring it before each update prevents zoom from collapsing at walls.
    followDesired.copy(camera.position);
    const delta=followDesired.clone().sub(controls.target),distance=delta.length();
    if(distance>.15){
      const hit=traceArenaShot(observerRay,shotRoots(),controls.target,delta.divideScalar(distance),distance,shotIndex(),robot.object);
      if(hit&&hit.distance<distance){camera.position.copy(controls.target).addScaledVector(delta,Math.max(.12,hit.distance-.12));camera.lookAt(controls.target);}
    }
  }

  function simulate(tick:number){
    if(!match||!mechanism||match.phase!=="running")return false;
    const before=match.elapsed,oldRune=match.pose.runeAngle,oldOutpost={...match.pose.outpostAngle};
    const dt=tick*SIM_STEP_MS/1000-before;
    if(driving&&isPlaying(mode)&&!paused){
      const h=Number(keys.has("ArrowRight"))-Number(keys.has("ArrowLeft")),v=Number(keys.has("ArrowDown"))-Number(keys.has("ArrowUp"));
      if(h||v)look=turnWithSettings(h*dt*520,v*dt*520);
    }
    advanceMotion(dt);
    updateMatch(match,dt,positions,tick%8===0?()=>{syncMechanisms();return sampleRadar();}:undefined);
    if(tick%8!==0)syncMechanisms();
    air?.advance(match.elapsed,dt,airClear);
    projectiles.advance(match,dt,projectiles.activeCount?shotRoots():[],shotIndex,robotFeedback?.contact,impactSound);
    if(experiment?.running)experiment.telemetry?.observe(match);
    if(match.phase!=="running"){air?.finish();shotIntents.clear();motions.clear();projectiles.clear();triggers.clear();return false;}
    for(const team of ["red","blue"] as const)if(activeRobot()?.team!==team){
      if(radarOpportunities(match.radar[team])&&match.robots.some(r=>radarVulnerability(match!.radar,team,r,match!.elapsed)>0))activateRadarDouble(match.radar,team,match.elapsed);
      if(armorStatus(match,team).canFortify&&match.sides[team==="red"?"blue":"red"].armor.hits.length)fortifyArmor(match,team,recommendedArmorCenter(match,team));
      const d=match.sides[team].dart,status=dartStatus(match,team);
      if(status.canOpen){selectDart(match,team,d.used===0&&match.sides[team==="red"?"blue":"red"].outpost>0?"outpost":"randomMoving");openDart(match,team);}
      if(status.canSelect&&status.phase==="open"&&d.mode==="outpost")selectDart(match,team,"randomFixed");
      if(status.canFire&&d.shots<d.used*2)launchDart(match,team);
    }
    if(tick*SIM_STEP_MS>=nextBotTurn){
      nextBotTurn+=120;
      updateBots();
    }
    // Deterministic round-robin work across pending searches. Each yield
    // is one actual CAD footprint check, never a wall-clock cutoff.
    for(let remaining=PATH_CHECKS_PER_STEP;remaining>0;){
      let worked=false;
      for(const [bot,route] of botPaths){
        if(bot===manualRobot()||!canDriveRobot(match,match.robots.find(r=>r.id===bot.object.name)!)){botPaths.delete(bot);continue;}
        if(!route.search)continue;
        worked=true;remaining--;
        const step=route.search.next();
        if(step.done){route.points=step.value;route.search=undefined;}
        if(!remaining)break;
      }
      if(!worked)break;
    }
    advanceAiming(dt,{rune:(match.pose.runeAngle-oldRune)/dt,red:(match.pose.outpostAngle.red-oldOutpost.red)/dt,blue:(match.pose.outpostAngle.blue-oldOutpost.blue)/dt});
    if(activeRobot()?.hp===0)triggers.clear();
    if(driving&&activeRobot()&&!canDriveRobot(match,activeRobot()!))clearInput();
    if(triggers.size||shotRequested)fire();
    shotRequested=false;
    // Renderer-independent collision transforms, including the gimbal's
    // siblings whose world matrices aimWeapon does not traverse.
    for(const bot of fieldRobots)bot.object.updateMatrixWorld(true);
    syncArmorLights();
    return true;
  }

  function render(time: number) {
    frame = 0;
    if (disposed) return;
    if(countdownEnd&&!paused){
      if(document.hidden)cancelStart();
      else if(time>=countdownEnd){countdownEnd=0;beginMatch();time=performance.now();}
      else{const remaining=Math.ceil((countdownEnd-time)/1000);if(remaining!==countdownCue){countdownCue=remaining;audio.play("countdown");}invalidate();}
    }
    if(match?.phase==="running"&&!experiment?.running){
      if(document.hidden||paused)simClock.pause();
      else{simClock.deposit(time);simClock.run(simulate);invalidate();}
    }
    if(director.enabled&&!paused){
      if(!canDirect())stopDirector();
      else{const shot=director.choose(match!);if(shot)showShot(shot);}
    }
    if(ready&&mode==="third"&&flyBounds){
      const dt=lastTime===null?0:Math.min(.05,(time-lastTime)/1000);
      const h=Number(keys.has("ArrowRight"))-Number(keys.has("ArrowLeft")),v=Number(keys.has("ArrowDown"))-Number(keys.has("ArrowUp"));
      if(h||v)look=turnWithSettings(h*dt*520,v*dt*520);
      const moving=!paused&&!document.hidden&&flightStep(camera.position,look,touchActions.size?new Set([...keys,...touchActions.values()]):keys,flightSpeed,dt,flyBounds,touchMove);
      camera.lookAt(clock.copy(camera.position).add(lookDirection(look,forward)));
      lastTime=moving||h||v?time:null;if(lastTime!==null)invalidate();
    }else if (ready && terrain && isPlaying(mode)) {
      const dt = lastTime === null ? 0 : Math.min(.05, (time - lastTime) / 1000);
      const {f,r}=movementIntent(keys,touchMove);
      const horizontal = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
      const vertical = Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp"));
      if ((!driving||match?.phase!=="running")&&(horizontal || vertical)) look = turnWithSettings(horizontal * dt * 520, vertical * dt * 520);
      if(!driving&&(f||r)){
        const {yaw}=look, speed=keys.has("ShiftLeft")||keys.has("ShiftRight")?3.6:2.2,norm=Math.max(1,Math.hypot(f,r));
        moveOnArena(terrain,explorer,(-Math.sin(yaw)*f+Math.cos(yaw)*r)*speed*dt/norm,(-Math.cos(yaw)*f-Math.sin(yaw)*r)*speed*dt/norm,PLAYER_RADIUS,.34,
          robots.filter(robot=>Math.abs(robot.position.y-explorer.y)<1.15));
      }else if(driving&&match?.phase==="ready"&&!countdownEnd){
        advanceMotion(dt);advanceAiming(dt);
      }
      if (f || r || horizontal || vertical || driving&&match?.phase==="ready"&&aimingManual()) {
        lastTime = time;
        invalidate();
      } else lastTime = null;
      syncCamera();
    } else if(following())syncObserver(time);
    else if (controls.enabled) controls.update();
    publish();
    const hidden=mode==="first"?driving:mode==="ai-first"?observed:null;
    if(hidden)hidden.object.visible=false;
    armorGlow?.update();
    if(match){mechanism?.setOutpostLights(match);dartVisual?.update(match);}
    projectiles.visual(camera,viewportHeight,isPlaying(mode)||mode==="ai-first");
    if(mode==="follow")followRendered.copy(camera.position);
    if(match)robotFeedback?.update(match,camera,viewportHeight,activeRobot()?.team??(mode==="ai-first"?groundIdentity(observed?.object.name??"")?.team:undefined)??radarPerspective,reducedMotion.matches);
    try{renderer.render(scene, camera);}catch(error){if(firstFrameStarted){firstFrameStarted=0;onError("战场渲染失败，请重试");return;}throw error;}finally{robotFeedback?.restoreMaterials();if(hidden)hidden.object.visible=true;if(mode==="follow"&&following()){camera.position.copy(followDesired);camera.updateMatrixWorld(true);}}
    if(firstFrameStarted){performance.measure("arena:first-frame",{start:firstFrameStarted,end:performance.now()});firstFrameStarted=0;onReady();}

  }

  function setView(next: ArenaView,automatic=false) {
    if (!ready||driving&&next!=="first"||(next==="follow"||next==="ai-first")&&!observed||experiment?.running&&next!=="all"||next==="third"&&radarPerspective!=="all"||next==="detail"&&!automatic) return;
    if(!automatic)stopDirector();
    if(mode!==next){if(mode==="follow"&&next==="third"){camera.position.copy(followRendered);camera.updateMatrixWorld(true);}clearInput();drag=null;observerPointer=null;}
    if(next!==mode&&(mode==="ai-first"||next==="ai-first"||next==="first"))audio.stop();mode = next;
    if(next==="third"){
      controls.enabled=false;camera.fov=72;camera.getWorldDirection(forward);
      look={yaw:Math.atan2(-forward.x,-forward.z),pitch:Math.asin(THREE.MathUtils.clamp(forward.y,-1,1))};
      if(fieldBounds){flyBounds=flightBounds(fieldBounds);camera.position.clamp(flyBounds.min,flyBounds.max);}
      observed=null;canvas.focus({preventScroll:true});
    }else if(next==="detail"){
      observed=null;controls.enabled=false;camera.fov=48;controls.minDistance=1;controls.maxDistance=160;
    }else if(next==="follow"){
      if(!observed)return;
      if(document.pointerLockElement===canvas)document.exitPointerLock();
      controls.enabled=!paused&&!director.enabled;controls.enablePan=false;camera.fov=48;controls.target.copy(focusPoint(observed));
      camera.position.copy(controls.target).add(followOffset(observed.object));controls.minDistance=1.2;controls.maxDistance=12;followTime=null;controls.update();
    }else if(next==="ai-first"){
      if(document.pointerLockElement===canvas)document.exitPointerLock();controls.enabled=false;camera.fov=72;
    }else if (isPlaying(next)) {
      controls.enabled = false;
      camera.fov = 72;
      syncCamera();
      canvas.focus({ preventScroll: true });
    } else {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      observed=null;controls.enabled = !paused&&!director.enabled&&!experiment?.running;controls.enablePan=true;
      camera.fov = 48;
      if (fieldBounds) {
        controls.target.copy(frameArena(camera, next, fieldBounds));
      }
      controls.minDistance = 2.5;
      controls.maxDistance = 160;
      controls.update();
    }
    camera.updateProjectionMatrix();
    syncArmorLights();
    publish();
    invalidate();
  }

  function beginMatch(){
    if(!match||match.phase!=="ready")return;
    simClock.reset();startMatch(match);
    if(canDirect())enableDirector();publish();invalidate();
  }
  function start(){
    if(!match||match.phase!=="ready"||countdownEnd)return;
    if(experiment?.running){beginMatch();return;}
    audio.unlock();countdownCue=0;clearInput();if(!driving&&radarPerspective==="all")setView("all");countdownEnd=performance.now()+3000;publish();invalidate();
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
    countdownEnd=0;countdownPausedAt=0;countdownCue=0;audio.stop();stopDirector();match=createMatch(roster(),undefined,undefined,coreGeometry?.energySpawns,coreGeometry?.coreSockets,seed);
    eventFeed.clear();robotFeedback?.clear();taskLog.length=0;match.onDamage=recordDamage;match.onEvent=recordEvent;
    defeatedPush.clear();nextBotTurn=0;botCursor=0;simClock.reset();botPaths.clear();botObserved.clear();motions.clear();shotIntents.clear();syncLaunchers();
    for(const [robot,pose] of initial){robot.position.copy(pose.position);robot.object.rotation.y=pose.yaw;robot.object.getObjectByName("gimbal")?.rotation.set(0,0,0);robot.object.getObjectByName("weapon-pitch")?.rotation.set(0,0,0);for(const w of wheels.get(robot)??[])w.rotation.x=0;}
    for(const bot of fieldRobots)bot.object.updateMatrixWorld(true);
    projectiles.clear();dartVisual?.clear();air?.reset();
    driving=null;observed=null;observerPointer=null;followTime=null;radarPerspective="all";clearInput();look={yaw:-.7,pitch:-.08};explorer.set(-10,terrain.heightAt(-10,-1.25),-1.25);
    mechanism.apply(match.pose);mechanism.applyDart(match);mechanism.setRuneLights(runeLights(match,"red"),runeLights(match,"blue"));coreGeometry?.applyTechnology(match);syncArmorLights();setView(experiment?.running?"all":"first");publish();invalidate();
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
  function trigger(source:string,pressed:boolean){
    if(!pressed){triggers.delete(source);return;}
    if(!ready||paused||document.hidden||!isPlaying(mode)||!manualRobot()||match?.phase!=="running"||!activeRobot()?.hp||triggers.has(source))return;
    if(!triggers.size)shotRequested=true;
    triggers.add(source);
    invalidate();
  }
  function fire() {
    const robot=activeRobot();
    if(!ready||paused||document.hidden||!isPlaying(mode)||!driving||!manualRobot()||!match||!map||!robot||!canFire(match,robot))return;
    const origin=new THREE.Vector3(),direction=new THREE.Vector3();
    if(readRobotSight(driving.object,origin,direction))shoot(driving,origin,direction);
  }
  function syncMechanisms(){
    if(!match||!mechanism)return;
    mechanism.apply(match.pose);mechanism.applyDart(match);
    mechanism.setRuneLights(runeLights(match,"red"),runeLights(match,"blue"));
    coreGeometry?.applyTechnology(match);syncLaunchers();poseShotIndex=undefined;
  }
  function airClear(v:AirVehicle,to:THREE.Vector3){
    const delta=to.clone().sub(v.position),distance=delta.length();if(distance<1e-8)return true;
    const roots=shotRoots(),index=shotIndex(),direction=delta.divideScalar(distance);
    for(const [x,z] of [[0,0],[-.066,-.066],[.066,-.066],[-.066,.066],[.066,.066]]){
      const from=v.position.clone().add(new THREE.Vector3(x,Math.sign(direction.y)*.026,z));
      if(traceArenaShot(radarRay,roots,from,direction,distance,index))return false;
    }
    return true;
  }
  function shotRoots(){
    return [map!,ground,benchModules,...fieldRobots.map(r=>r.object)];
  }
  function trace(robot:Robot,from:THREE.Vector3,direction:THREE.Vector3){
    if(!map)return undefined;
    const roots=shotRoots();
    return traceArenaShot(shotRay,roots,from,direction,SHOT_RANGE,shotIndex(),robot.object);
  }
  // Virtual sensing approximation: exact CAD occlusion, no invented sensor
  // accuracy or RF decoding. Sample only positions actually visible to radar.
  function visiblePoints(from:THREE.Vector3,robot:Robot,roots:THREE.Object3D[],index:ShotIndex,exclude?:THREE.Object3D,firstOnly=false){
    const points:THREE.Vector3[]=[];
    for(const {object,center} of armorCenters.get(robot)??[]){
      const point=object.localToWorld(center.clone()),delta=point.clone().sub(from),distance=delta.length();
      if(distance<.001||distance>SHOT_RANGE)continue;
      const hit=traceArenaShot(radarRay,roots,from,delta.divideScalar(distance),distance+.04,index,exclude);
      const target=arenaHitTarget(hit,delta);
      if(hit&&target?.type==="robot"&&target.id===robot.object.name){points.push(hit.point.clone());if(firstOnly)break;}
    }
    return points;
  }
  function visibleRobot(from:THREE.Vector3,robot:Robot,roots:THREE.Object3D[],index:ShotIndex,exclude?:THREE.Object3D){
    // Two silhouette points are sufficient for this virtual line-of-sight
    // sensor. It does not require an exposed armor detector or aim solution.
    for(const height of [robot.eyeHeight*.8,robot.eyeHeight*.45]){
      const delta=robot.position.clone().add(new THREE.Vector3(0,height,0)).sub(from),distance=delta.length();
      if(distance<.001||distance>SHOT_RANGE)continue;
      const hit=traceArenaShot(radarRay,roots,from,delta.divideScalar(distance),distance+.04,index,exclude);
      for(let node=hit?.object;node;node=node.parent??undefined)if(node===robot.object)return true;
    }
    return false;
  }
  function sampleRadar():RadarReport[]{
    if(!match||match.phase!=="running")return [];
    const reports:RadarReport[]=[];
    const roots=shotRoots(),index=shotIndex();
    for(const team of ["red","blue"] as const)for(const robot of fieldRobots){
      if(visibleRobot(radarOrigins[team],robot,roots,index))
        reports.push({team,id:robot.object.name,point:{x:robot.position.x,z:robot.position.z}});
    }
    return reports;
  }
  function updateBots() {
    const decisionAt=performance.now();
    const currentMatch=match,currentTerrain=terrain;
    if(!currentMatch||!currentTerrain||!mechanism)return;
    const field=fieldRobots;
    const available=field.filter(bot=>bot!==manualRobot());
    const bot=available[botCursor++%available.length];
    if(!bot)return;
    const state=currentMatch.robots.find(m=>m.id===bot.object.name)!;
    const identity=groundIdentity(state.id)!;
    shotIntents.delete(bot);
    const strategy=strategies[state.team];
    const side=currentMatch.sides[state.team],enemyTeam=state.team==="red"?"blue":"red";
    const revival=revivalStatus(currentMatch,state);
    if(revival.dead){
      taskLog.push({at:currentMatch.elapsed,id:state.id,team:state.team,kind:"revive",score:0,reason:"战亡恢复流程",ms:performance.now()-decisionAt});
      botPaths.delete(bot);
      if(side.tech.attempt?.robot===state.id){
        if(!zonesAtPosition(bot.position).includes(`${state.team}-assembly`)){cancelAssembly(currentMatch,state.id,bot.position);return;}
        const axis=currentMatch.coreSockets[state.team]?.axis;
        if(axis){
          const target=bot.position.clone().add(new THREE.Vector3(axis.x,0,axis.z));
          setBotGoal(bot,target,.04);
        }
        return;
      }
      if(revival.canConfirm)reviveRobot(currentMatch,state.id);
      else if(revival.canPay&&side.coins>revival.cost+300&&currentMatch.elapsed>300)reviveRobot(currentMatch,state.id,true);
      return;
    }
    const active=field.filter(r=>r.object.userData.team===state.team&&currentMatch!.robots.some(m=>m.id===r.object.name&&m.hp>0));
    const roots=shotRoots(),index=shotIndex();
    const eye=bot.object.getObjectByName("driver-eye")?.getWorldPosition(new THREE.Vector3())??bot.position.clone().add(new THREE.Vector3(0,bot.eyeHeight,0));
    // Sensor output consists of copied world points, never enemy object references.
    const sightings=field.filter(r=>r.object.userData.team!==state.team).flatMap(r=>{
      if(!visibleRobot(eye,r,roots,index,bot.object))return [];
      return [{id:r.object.name,position:r.position.clone(),lit:armorLit.get(r)!==false,radius:r.radius,points:r.position.distanceTo(bot.position)<=12&&canFire(currentMatch!,state)?visiblePoints(eye,r,roots,index,bot.object,true):[]}];
    });
    const reports=mapTracks(state.team).filter(r=>r.team!==state.team&&!r.stale);
    const enemies=sightings.filter(r=>r.lit).sort((a,b)=>a.position.distanceToSquared(bot.position)-b.position.distanceToSquared(bot.position));
    const known=field.filter(r=>r.object.userData.team===state.team).map(r=>({position:r.position,radius:r.radius}));
    for(const report of reports){const y=currentTerrain.heightAt(report.x,report.z);if(Number.isFinite(y))known.push({position:new THREE.Vector3(report.x,y,report.z),radius:.4});}
    for(const seen of sightings)known.push({position:seen.position,radius:seen.radius});
    botObserved.set(bot,known.filter(r=>r.position!==bot.position).map(r=>({position:r.position.clone(),radius:r.radius})));
    const zoneGoal=(team:Team,kind:ZoneKind)=>{
      const zone=ARENA_ZONES.find(z=>z.team===team&&z.kind===kind)!;
      if(kind!=="assembly"&&zonesAtPosition(bot.position).includes(zone.id))return bot.position.clone();
      const previous=botPaths.get(bot)?.goal;
      if(kind!=="assembly"&&previous&&zonesAtPosition(previous).includes(zone.id)&&!known.some(r=>r.position!==bot.position&&Math.abs(r.position.y-previous.y)<1.15&&Math.hypot(r.position.x-previous.x,r.position.z-previous.z)<r.radius+bot.radius))return previous.clone();
      const [x,z]=zone.goal;
      const offsets=kind==="assembly"?[[0,0],[.2,-.2],[-.2,.2]]:state.sentry?[[0,0],[.5,.4],[-.5,-.4]]:identity.number==="03"?[[.5,.4],[0,0],[-.5,-.4]]:[[-.5,-.4],[0,0],[.5,.4]];
      for(const [dx,dz] of offsets){
        const p=new THREE.Vector3(x+dx,currentTerrain!.heightAt(x+dx,z+dz),z+dz);
        if(zonesAtPosition(p).includes(zone.id)&&supportedHeight(currentTerrain!,p.x,p.z,bot.radius,p.y,.23)!==null
          && !known.some(r=>r.position!==bot.position&&Math.abs(r.position.y-p.y)<1.15&&Math.hypot(r.position.x-p.x,r.position.z-p.z)<r.radius+bot.radius))return p;
      }
      return new THREE.Vector3(x,currentTerrain!.heightAt(x,z),z);
    };
    const supply=zoneGoal(state.team,"supply");
    const repair=ARENA_ZONES.filter(z=>z.kind==="outpost"&&controlsOutpost(currentMatch!,z.team,state.team,true))
      .map(z=>zoneGoal(z.team,"outpost")).sort((a,b)=>a.distanceToSquared(bot.position)-b.distanceToSquared(bot.position))[0];
    const recovering=revival.weak||state.hp<state.maxHp*.55;
    if(state.hp<state.maxHp*.5&&canPurchaseHealth(currentMatch,state)&&side.coins>remoteHealthCost(currentMatch)+150)purchaseHealth(currentMatch,state.id);
    if(state.heavy&&launcherStatus(currentMatch,state,bot.position).canInstall){installLauncher(currentMatch,state.id,bot.position);syncLaunchers();poseShotIndex=undefined;}
    const needsLauncher=state.heavy&&state.launcher==="unlocked";
    const armed=!state.heavy||state.launcher==="ready"||state.launcher==="test";
    if(armed&&state.ammo+reserveAmmo(currentMatch,state)<(state.heavy?3:state.sentry?80:20))purchaseAmmo(currentMatch,state.id);
    if(state.heavy&&state.launcher==="test"&&canFire(currentMatch,state)){
      shotIntents.set(bot,{point:bot.position.clone().add(new THREE.Vector3(-Math.sin(bot.object.rotation.y)*10,bot.eyeHeight,-Math.cos(bot.object.rotation.y)*10))});
    }
    const needAmmo=armed&&state.ammo+reserveAmmo(currentMatch,state)===0&&state.pendingAmmoAt===null;
    const fortressReady=currentMatch.elapsed>=180&&controlsOutpost(currentMatch,enemyTeam,state.team)&&!currentMatch.sides[enemyTeam].cover;
    const assault=fortressReady?active.filter(r=>r!==manualRobot()&&r.object.userData.team===state.team)
      .filter(r=>{const m=currentMatch!.robots.find(m=>m.id===r.object.name)!;return !m.heavy&&!revivalStatus(currentMatch!,m).weak&&(m.fortressHold>0||m.hp>=m.maxHp*.55);})
      .sort((a,b)=>Number((currentMatch!.robots.find(m=>m.id===b.object.name)?.fortressHold??0)>0)-Number((currentMatch!.robots.find(m=>m.id===a.object.name)?.fortressHold??0)>0)||a.radius-b.radius)[0]:undefined;
    const assaultDuty=bot===assault;
    let goal:THREE.Vector3,kind:TaskKind="attack";
    if(needsLauncher){
      kind="launcher";const [x,z]=launcherBench(state.team).approach;goal=new THREE.Vector3(x,currentTerrain.heightAt(x,z),z);
    }else if(assaultDuty&&state.fortressHold>0){
      kind="fortress";goal=zoneGoal(enemyTeam,"fortress");
    }else if(recovering||needAmmo){
      kind=recovering?"recover":"resource";goal=repair&&repair.distanceToSquared(bot.position)<supply.distanceToSquared(bot.position)?repair:supply;
    }else if(assaultDuty){
      kind="fortress";goal=zoneGoal(enemyTeam,"fortress");
    }else if(!controlsOutpost(currentMatch,state.team,state.team)||side.outpostArea.progress>0){
      kind="defend";goal=zoneGoal(state.team,state.sentry?"outpost":"central");
    }else if(fortressReady){
      goal=zoneGoal(enemyTeam,state.sentry||identity.number==="04"?"central":"outpost");
    }else if(!controlsOutpost(currentMatch,enemyTeam,state.team,true)){
      goal=zoneGoal(enemyTeam,state.sentry||identity.number==="04"?"central":"outpost");
    }else{
      goal=zoneGoal(enemyTeam,state.sentry?"central":"base");
    }
    // Prefer a nearby own highpoint for local resupply when not recovering.
    // Do not interrupt fortress, launcher installation or technology tasks.
    if(needAmmo&&!recovering&&!needsLauncher&&!assaultDuty&&!state.heavy){
      const highpoint=zoneGoal(state.team,"highpoint");
      if(highpoint.distanceTo(bot.position)<2.5&&highpoint.distanceToSquared(bot.position)<goal.distanceToSquared(bot.position))goal=highpoint;
    }
    if(state.heavy&&state.launcher==="locked"&&!recovering){kind="defend";goal=zoneGoal(state.team,"central");}
    // Finish a detected low-card approach towards an existing highland
    // objective only; the referee still requires the actual ordered contacts.
    const crossing=state.terrain.attempt;
    if(!recovering&&!needAmmo&&!needsLauncher&&!assaultDuty&&crossing?.kind==="highland"){
      const target=zoneGoal(crossing.course.startsWith("red-")?"red":"blue","central");
      if(target.distanceTo(bot.position)<3){kind="crossing";goal=target;}
    }
    const candidates:TaskCandidate<THREE.Vector3>[]=[];
    const offer=(kind:TaskKind,weight:WeightKey,priority:number,urgency:number,target:THREE.Vector3,execute=()=>target,required=false)=>{
      candidates.push({kind,weight,priority,urgency,distance:target.distanceTo(bot.position),execute,required});
    };
    const baseGoal=goal;
    offer(kind,kind==="recover"||kind==="resource"?"resources":kind==="defend"?"defense":kind==="launcher"?"technology":kind==="fortress"?"cooperation":"attack",10,1.1,baseGoal,()=>baseGoal,needsLauncher||recovering||needAmmo||assaultDuty&&state.fortressHold>0);
    if(!needsLauncher&&!recovering&&!needAmmo){
      offer("attack","attack",0,1.15,zoneGoal(enemyTeam,state.sentry?"central":"outpost"));
      offer("defend","defense",0,side.outpostArea.progress>0?1.5:1.0,zoneGoal(state.team,state.sentry?"outpost":"central"));
      if(state.hp<state.maxHp*.85||armed&&state.ammo+reserveAmmo(currentMatch,state)<(state.heavy?6:state.sentry?130:45))
        offer("resource","resources",0,1.2,repair&&repair.distanceToSquared(bot.position)<supply.distanceToSquared(bot.position)?repair:supply);
      const ally=active.filter(r=>r!==bot).sort((a,b)=>a.position.distanceToSquared(bot.position)-b.position.distanceToSquared(bot.position))[0];
      if(ally){const area=zonesAtPosition(ally.position).map(id=>ARENA_ZONES.find(z=>z.id===id)).find(z=>z&&["central","outpost","base"].includes(z.kind));
        offer("support","cooperation",0,1.25,area?zoneGoal(area.team,area.kind==="central"?"outpost":"central"):zoneGoal(enemyTeam,"central"));}
    }
    // Heavy robots use the same referee calls as a player. Finish the
    // current attempt before switching tasks, but do not monopolize late combat.
    let technologyDuty=false;
    if(state.heavy){
      const tech=assemblyStatus(currentMatch,state,bot.position),energy=energyStatus(currentMatch,state,bot.position);
      const next=technologyLevel(currentMatch,state.team)+1 as Difficulty;
      const desired=next===4?2:1;
      if(tech.level!==null){
        offer("technology","technology",20,1.5,zoneGoal(state.team,"assembly"),()=>{
        technologyDuty=true;
        if(recovering&&!tech.pending)cancelAssembly(currentMatch,state.id);
        else{
          const action=[...tech.actions].sort((a,b)=>a.step-b.step)[0];
          if(action)assemblyAction(currentMatch,state.id,bot.position,action.core,action.step,action.angle);
          goal=zoneGoal(state.team,"assembly");
          if(tech.pending||action)goal=bot.position.clone();
        }
        return goal;},true);
      }else if(!recovering&&!needsLauncher&&next<=4&&currentMatch.elapsed>=60*(next-1)&&currentMatch.elapsed<330&&currentMatch.elapsed>=side.tech.retryAt&&
        (energy.carrying>=desired||currentMatch.energyUnits.some(u=>u.team===state.team&&(u.location.kind==="rack"||u.location.kind==="ground")))){
        offer("technology","technology",20,1.35,energy.carrying>=desired?zoneGoal(state.team,"assembly"):supply,()=>{
        technologyDuty=true;
        if(energy.carrying>=desired){
          goal=zoneGoal(state.team,"assembly");
          if(bot.position.distanceTo(goal)<.10&&tech.available.includes(next)){beginAssembly(currentMatch,state.id,bot.position,next);goal=bot.position.clone();}
        }else{
          if(energy.pickup)pickupEnergy(currentMatch,state.id,bot.position,energy.pickup);
          const unit=currentMatch.energyUnits.filter(u=>u.team===state.team&&(u.location.kind==="rack"||u.location.kind==="ground")).sort((a,b)=>bot.position.distanceToSquared(new THREE.Vector3(a.location.position.x,a.location.position.y,a.location.position.z))-bot.position.distanceToSquared(new THREE.Vector3(b.location.position.x,b.location.position.y,b.location.position.z)))[0];
          if(unit){
            const p=unit.location.position;
            const candidates:THREE.Vector3[]=[];
            for(const distance of [1.1,.9,1.3])for(let i=0;i<8;i++){
              const x=p.x+distance*Math.cos(i*Math.PI/4),z=p.z+distance*Math.sin(i*Math.PI/4);
              const y=currentTerrain.heightAt(x,z);
              const point=new THREE.Vector3(x,y,z);
              if(Math.abs(y-p.y)>1.4||unit.location.kind==="rack"&&!zonesAtPosition(point).includes(`${state.team}-supply`)||supportedHeight(currentTerrain,x,z,bot.radius,y,.23)===null)continue;
              if(known.some(r=>r.position!==bot.position&&Math.abs(r.position.y-y)<1.15&&Math.hypot(r.position.x-x,r.position.z-z)<r.radius+bot.radius))continue;
              candidates.push(point);
            }
            candidates.sort((a,b)=>a.distanceToSquared(bot.position)-b.distanceToSquared(bot.position));
            goal=candidates[0]??supply;
          }
        }
        return goal;});
      }
    }
    // One available infantry per team handles rune attempts. Do not spend
    // an activation until its actual muzzle has an unobstructed detector.
    const rune=runeStatus(currentMatch,state.team);
    const runeBot=active.find(r=>r!==manualRobot()&&r.object.userData.team===state.team&&groundIdentity(r.object.name)?.number==="04")
      ??active.find(r=>r!==manualRobot()&&r.object.userData.team===state.team&&groundIdentity(r.object.name)?.kind==="infantry");
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
        offer("rune","technology",30,1.35,bot.position.clone(),()=>{
        if(!rune.active)activateRune(currentMatch,state.id);
        if(canFire(currentMatch,state)){
          const shot=shotAt(runeStatus(currentMatch,state.team).lit);
          if(shot)shotIntents.set(bot,shot);
        }
        runeDuty=true;return bot.position.clone();});
      }else{
        let approach:THREE.Vector3|undefined;
        for(const distance of [3.5,4.5,2.5,5.5]){
          for(const offset of [0,.8,-.8,1.6,-1.6]){
            const p=center.clone().addScaledVector(normal,distance).addScaledVector(lateral,offset);
            p.y=currentTerrain.heightAt(p.x,p.z);
            if(supportedHeight(currentTerrain,p.x,p.z,bot.radius,p.y,.23)===null||p.distanceTo(bot.position)<.3)continue;
            if(known.some(r=>r.position!==bot.position&&Math.abs(r.position.y-p.y)<1.15&&Math.hypot(r.position.x-p.x,r.position.z-p.z)<r.radius+bot.radius))continue;
            approach=p;break;
          }
          if(approach)break;
        }
        if(approach){const target=approach;offer("rune","technology",30,1.35,target,()=>{runeDuty=true;return target;});}
      }
    }
    const chosen=chooseTask(strategy,candidates);
    goal=chosen.task.execute();kind=chosen.task.kind;
    if(state.commandTarget){
      const zone=ARENA_ZONES.find(z=>z.id===state.commandTarget);
      if(zone&&zonesAtPosition(bot.position).includes(zone.id))state.commandTarget=null;
      else if(zone&&!recovering&&!assaultDuty){kind="command";goal=zoneGoal(zone.team,zone.kind);}
    }
    if(!technologyDuty&&!runeDuty&&state.launcher!=="test"&&canFire(currentMatch,state)&&!revival.weak){
      const candidates:THREE.Vector3[]=[];
      for(const enemy of enemies.slice(0,2)){
        if(enemy.position.distanceTo(bot.position)>12)continue;
        candidates.push(...enemy.points);
      }
      for(const location of ["red","blue"] as const)if(currentMatch.sides[location].outpostOwner!==state.team&&currentMatch.sides[location].outpost>0)
        for(let i=0;i<3;i++)candidates.push(new THREE.Box3().setFromObject(mechanism.parts.getObjectByName(location+"-outpost-armor-"+i)!).getCenter(new THREE.Vector3()));
      candidates.sort((a,b)=>a.distanceToSquared(bot.position)-b.distanceToSquared(bot.position));
      for(const point of candidates.slice(0,6)){
        if(point.distanceTo(bot.position)>12)continue;
        const shot=previewWeaponAt(bot.object,point);
        if(!shot)continue;
        const hit=trace(bot,shot.origin,shot.direction),target=arenaHitTarget(hit,shot.direction);
        if(target?.type==="outpost"&&currentMatch.sides[target.team as Team].outpostOwner!==state.team||target?.type==="robot"&&enemies.some(r=>r.id===target.id)){
          shotIntents.set(bot,target.type==="robot"?{point:hit!.point.clone()}:{point:hit!.object.worldToLocal(hit!.point.clone()),object:hit!.object});break;
        }
      }
    }
    const stance=sentryStatus(currentMatch,state);
    if(stance&&stance.cooldown===0){
      const distance=Math.hypot(goal.x-bot.position.x,goal.z-bot.position.z);
      const threat=enemies.some(r=>r.position.distanceTo(bot.position)<5)||reports.some(r=>Math.hypot(r.x-bot.position.x,r.z-bot.position.z)<5);
      const holding=assaultDuty&&distance<1.5;
      const desired:SentryMode=holding||threat&&state.hp<state.maxHp*.35?"defense":distance>.8?"move":threat&&state.ammo>0?"attack":"defense";
      const enhance=stance.remaining[desired]>0&&(desired==="defense"?holding:desired==="attack"?state.heat>=state.heatLimit*.7:assaultDuty&&distance>6);
      if(stance.mode!==desired||enhance&&!stance.enhanced)switchSentry(currentMatch,state.id,desired,enhance);
    }
    // Choose only from perceived threats; never change referee damage or immunity.
    motionFor(bot).spin=canSpinChassis(currentMatch,state)&&!recovering&&!needAmmo&&!technologyDuty&&!runeDuty&&
      state.powerBuffer>25&&["attack","defend","support"].includes(kind)&&enemies.some(r=>r.position.distanceTo(bot.position)<5);
    // Strategy writes a persistent goal; it never moves the chassis.
    setBotGoal(bot,goal,technologyDuty?.055:.22);
    taskLog.push({at:currentMatch.elapsed,id:state.id,team:state.team,kind,score:chosen.score,reason:kind==="command"?"指挥目标":strategy.algorithm==="priority"?"规则优先级":chosen.task.required?"必要任务":chosen.task.weight+" × "+chosen.task.urgency+" − 距离成本",target:goal.toArray(),ms:performance.now()-decisionAt});
  }
  function setBotGoal(bot:Robot,goal:THREE.Vector3,tolerance:number){
    const route=botPaths.get(bot);
    if(!route||route.goal.distanceTo(goal)>.5||goal.distanceTo(bot.position)<tolerance&&route.points.length>0){
      botPaths.set(bot,{goal:goal.clone(),points:[],retryAt:0,tolerance});
    }else{route.goal.copy(goal);route.tolerance=tolerance;}
  }
  function advanceMotion(dt:number){
    if(!match||!terrain||dt<=0)return;
    for(const bot of fieldRobots)if(match.robots.find(r=>r.id===bot.object.name)!.hp>0)defeatedPush.delete(bot);
    for(const bot of fieldRobots){
      const state=match.robots.find(r=>r.id===bot.object.name)!;
      const motion=motionFor(bot),manual=manualRobot()===bot;
      const previousYaw=bot.object.rotation.y;
      const gimbal=bot.object.getObjectByName("gimbal");
      const occupants=fieldRobots.filter(r=>r!==bot&&Math.abs(r.position.y-bot.position.y)<1.15);
      let target:THREE.Vector3|null=null,command:0|1|2=0,strength=1;
      const route=botPaths.get(bot);
      if(manual&&isPlaying(mode)&&!paused){
        const {f,r}=movementIntent(keys,touchMove);
        if(f||r){const n=Math.hypot(f,r),{yaw}=look;strength=n;target=bot.position.clone().add(new THREE.Vector3((-Math.sin(yaw)*f+Math.cos(yaw)*r)/n*10,0,(-Math.cos(yaw)*f-Math.sin(yaw)*r)/n*10));command=keys.has("ShiftLeft")||keys.has("ShiftRight")?2:1;}
      }else if(!manual&&match.phase==="running"&&route&&!route.search){
        while(route.points.length&&bot.position.distanceTo(route.points[0])<.04)route.points.shift();
        if(Math.hypot(route.goal.x-bot.position.x,route.goal.z-bot.position.z)>=route.tolerance){target=route.points[0]??route.goal;command=1;}
      }
      const assembly=match.sides[state.team].tech.attempt;
      if(assembly?.robot===state.id&&assembly.pending){target=null;command=0;}
      if(!canSpinChassis(match,state)||manual&&(!isPlaying(mode)||paused))motion.spin=false;
      const spin=!!motion.spin;
      const speed=driveSpeed(match,state,command,spin,strength);
      if(!canDriveRobot(match,state)||match.phase==="finished"){motions.delete(bot);shotIntents.delete(bot);botPaths.delete(bot);continue;}
      const oldX=bot.position.x,oldZ=bot.position.z;
      let traveled=stepChassis(terrain,bot,motion,target,speed,dt,occupants,!manual&&route&&!route.points.length?route.tolerance:undefined,spin);
      if(match.phase==="running"&&state.hp>0&&target&&speed>0&&traveled<1e-5&&motion.speed===0&&
        (spin||Math.abs(angleDelta(motion.yaw,Math.atan2(bot.position.x-target.x,bot.position.z-target.z)))<.2)){
        traveled=clearDefeatedPath(terrain,bot,target,dt,fieldRobots.filter(r=>r!==bot),o=>{
          const r=match!.robots.find(r=>r.id===o.object.name);
          return !!r&&r.hp===0&&!canDriveRobot(match!,r);
        },defeatedPush);
        if(traveled>0)for(const other of fieldRobots)other.object.updateMatrixWorld(true);
      }
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
      if(!manual&&route&&target&&speed>0&&traveled<.00001&&motion.speed===0&&(spin||Math.abs(angleDelta(motion.yaw,Math.atan2(bot.position.x-target.x,bot.position.z-target.z)))<.2)&&match.elapsed>=route.retryAt){
        route.points=[];route.retryAt=match.elapsed+4;
        route.search=findArenaPath(terrain,bot.position.clone(),route.goal.clone(),bot.radius,.4,botObserved.get(bot)??[]);
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
      if(!g||!w||!canDriveRobot(match,state)){shotIntents.delete(bot);continue;}
      if(state.hp<=0)shotIntents.delete(bot);
      const manual=manualRobot()===bot&&isPlaying(mode),intent=shotIntents.get(bot);
      let desired:{yaw:number;pitch:number}|null=manual?look:null;
      if(!manual&&intent){
        const point=intent.object?intent.object.localToWorld(intent.point.clone()):intent.point.clone();
        const speed=projectileSpeed(state.heavy);
        let aim=previewWeaponAt(bot.object,point,speed);
        if(aim&&intent.object){
          // Predict the currently moving detector from its real rotation
          // axis, or use the observed local-point velocity for a mechanism.
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
    if(projectiles.fire(match,robot.object.name,from,direction,robot.object)&&!experiment?.running){const state=match.robots.find(r=>r.id===robot.object.name);if(state&&audioVisible(state.team,audioPerspective()))audio.play(state.heavy?"heavy":"light",from);publish();invalidate();}
  }
  function interact() {
    if (!ready || paused || !terrain || !isPlaying(mode)||experiment?.running) return;
    if (driving) {
      const robot = driving;
      if(observed===robot){clearInput();driving=null;setView("follow");return;}
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
        audio.stop();driving = robot;observed=null;
        botPaths.delete(robot);shotIntents.delete(robot);motions.delete(robot);
        look = { yaw: robot.object.rotation.y+(robot.object.getObjectByName("gimbal")?.rotation.y??0), pitch: robot.object.getObjectByName("weapon-pitch")?.rotation.x??0 };
      }
    }
    clearInput();
    syncCamera();
    publish();
    invalidate();
  }

  const flightKeys=new Set(["Space","ControlLeft","ControlRight"]);
  const movement = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  function input(key: string, pressed: boolean) {
    if ((!movement.has(key)&&!flightKeys.has(key))||experiment?.running) return;
    if (!pressed) keys.delete(key);
    else if(ready&&!paused&&!countdownEnd){
      if(director.enabled)setView("third");
      if(isPlaying(mode)&&movement.has(key)||mode==="third")keys.add(key);
    }
    invalidate();
  }

  function toggleSpin(){
    const bot=manualRobot(),state=activeRobot();
    if(!bot||!state||!match||paused||!isPlaying(mode)||!canSpinChassis(match,state))return;
    const motion=motionFor(bot);motion.spin=!motion.spin;publish();invalidate();
  }
  function keydown(event: KeyboardEvent) {
    if (!ready || paused || event.metaKey || event.ctrlKey&&mode!=="third"&&!(director.enabled&&flightKeys.has(event.code)) || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if(countdownEnd){if(event.code==="Escape")cancelStart();return;}
    if(event.code==="Escape"&&mode==="third"){clearInput();if(document.pointerLockElement===canvas)document.exitPointerLock();return;}
    if ((movement.has(event.code)||(mode==="third"||director.enabled)&&flightKeys.has(event.code))&&(isPlaying(mode)||mode==="third"||director.enabled)) {
      event.preventDefault();
      input(event.code, true);
    } else if (event.code === "Space" && driving && isPlaying(mode)) {event.preventDefault();if(!event.repeat)trigger("space",true);}
    else if (!event.repeat && event.code === "KeyR") toggleSpin();
    else if (!event.repeat && event.code === "KeyB") buy();
    else if (!event.repeat && event.code === "KeyE") interact();
    else if (!event.repeat && event.code === "KeyV") setView(driving?"first":mode==="third"?"all":"third");
    else if (!event.repeat && event.code === "KeyM") setView("all");
  }
  function keyup(event: KeyboardEvent) { if(event.code==="Space")trigger("space",false);input(event.code, false); }
  function clearInput() { shotRequested=false;triggers.clear();keys.clear();moveOwner=null;touchMove=ZERO_MOVE;touchActions.clear();onInputReset(); drag=null;observerPointer=null;lastTime = null; if(manualRobot()){motions.delete(manualRobot()!);if(match&&activeRobot())driveSpeed(match,activeRobot()!,0);} }
  function turn(dx: number, dy: number) {
    if (!ready || paused || (!isPlaying(mode)&&mode!=="third")) return;
    look = turnWithSettings(dx, dy);
    invalidate();
  }
  let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  function pointerdown(event: PointerEvent) {
    if(!ready||paused||countdownEnd||event.button!==0)return;
    if(!isPlaying(mode)&&mode!=="third"){observerPointer={id:event.pointerId,x:event.clientX,y:event.clientY};return;}
    if(event.pointerType==="touch"&&event.clientX<canvas.getBoundingClientRect().left+canvas.clientWidth/2)return;
    if(drag&&drag.id!==event.pointerId)return;
    if(event.pointerType==="mouse")trigger("mouse:"+event.pointerId,true);
    if(document.pointerLockElement===canvas)return;
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }
  function pointermove(event: PointerEvent) {
    if(director.enabled&&observerPointer?.id===event.pointerId&&Math.hypot(event.clientX-observerPointer.x,event.clientY-observerPointer.y)>=4){const {x,y}=observerPointer;setView("third");drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:true};canvas.setPointerCapture(event.pointerId);turn(event.clientX-x,event.clientY-y);return;}
    if (document.pointerLockElement === canvas || drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (dx || dy) drag.moved = true;
    turn(dx,dy);
    drag.x = event.clientX; drag.y = event.clientY;
  }
  function pointerup(event: PointerEvent) {
    trigger("mouse:"+event.pointerId,false);
    trigger("button:"+event.pointerId,false);
    touchActions.delete(event.pointerId);
    if(moveOwner===event.pointerId){moveOwner=null;touchMove=ZERO_MOVE;invalidate();}
    if(observerPointer?.id===event.pointerId){const start=observerPointer;observerPointer=null;
      if(event.type==="pointerup"&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<5&&!driving&&mode!=="ai-first"&&map){
        const rect=canvas.getBoundingClientRect();
        if(mode==="follow"){camera.position.copy(followRendered);camera.updateMatrixWorld(true);}
        observerRay.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
        if(mode==="follow"){camera.position.copy(followDesired);camera.updateMatrixWorld(true);}
        const hit=traceArenaShot(observerRay,shotRoots(),observerRay.ray.origin.clone(),observerRay.ray.direction.clone(),220,prepareShots());
        for(let node=hit?.object;node;node=node.parent??undefined){const robot=fieldRobots.find(r=>r.object===node);if(robot){observe(robot.object.name);break;}}
      }
    }
    if (drag?.id !== event.pointerId) return;
    const click = !drag.moved && event.type === "pointerup" && event.pointerType === "mouse";
    drag = null;
    if (click && !paused && canvas.requestPointerLock) {
      try { const result = canvas.requestPointerLock(); if (result) void result.catch(() => {}); } catch { /* drag stays available */ }
    }
  }
  function pause(value: boolean) {
    if(paused===value)return;
    paused = value;
    if(!experiment?.running){
      simClock.pause();
      if(countdownEnd){if(value)countdownPausedAt=performance.now();else if(countdownPausedAt){countdownEnd+=performance.now()-countdownPausedAt;countdownPausedAt=0;}}
      if(value)audio.stop();
    }
    clearInput();
    drag = null;observerPointer=null;
    controls.enabled = !value && !director.enabled&&!experiment?.running&&!isPlaying(mode)&&mode!=="ai-first"&&mode!=="third"&&mode!=="detail";
    if (value && document.pointerLockElement === canvas) document.exitPointerLock();
    publish();invalidate();
  }
  function mousemove(event: MouseEvent) {
    if (document.pointerLockElement === canvas) turn(event.movementX, event.movementY);
  }
  function visibilityChange(){if(document.hidden){cancelStart();audio.stop();}simClock.pause();clearInput();invalidate();queueExperiment();}
  function lockchange() { if (document.pointerLockElement !== canvas) clearInput(); }

  function wheel(e:WheelEvent){if(paused||!ready)return;if(director.enabled)setView("third");if(mode!=="third")return;e.preventDefault();flightSpeed=THREE.MathUtils.clamp(flightSpeed*Math.exp(-e.deltaY*.002),1,24);publish();invalidate();}
  function orbitStart(){if(director.enabled)stopDirector();publish();}
  controls.addEventListener("start",orbitStart);
  canvas.addEventListener("wheel",wheel,{passive:false});
  controls.addEventListener("change", invalidate);
  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    viewportHeight=h;renderer.setSize(w, h);
    camera.aspect = w / h;
    if (ready && mode !== "first" && mode !== "third" && mode!=="follow"&&mode!=="ai-first" && mode!=="detail" && fieldBounds) {
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
  window.addEventListener("orientationchange",clearInput);
  reducedMotion.addEventListener("change",invalidate);
  window.addEventListener("pointerup", pointerup);
  window.addEventListener("pointercancel", pointerup);
  performance.measure("arena:program",{start:programStarted,end:performance.now()});
  type LoadAsset={url:string;sha256:string;bytes?:number};
  type AssetProgress={phase:"download"|"verify"|"parse"|"done";received:number;total?:number};
  const assetProgress=new Map<string,AssetProgress>();
  let lastProgress=0;
  function reportAssets(force=false){
    if(disposed||abort.signal.aborted)return;
    const now=performance.now();
    if(!force&&now-lastProgress<80)return;
    lastProgress=now;
    const items=[...assetProgress.values()];
    const phase=items.some(item=>item.phase==="download")?"download":items.some(item=>item.phase==="verify")?"verify":"parse";
    const received=items.reduce((sum,item)=>sum+item.received,0);
    const total=items.every(item=>item.total!==undefined)?items.reduce((sum,item)=>sum+item.total!,0):undefined;
    onProgress({phase,received,total});
  }
  const yieldForPaint=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
  async function loadAsset(asset:LoadAsset) {
    const item=assetProgress.get(asset.url)!;
    const label=asset.url.split("/").pop();
    let started=performance.now();
    const response=await fetch(asset.url,{signal:abort.signal});
    if(!response.ok)throw new Error("CAD asset unavailable");
    const encoding=response.headers.get("content-encoding");
    const length=Number(response.headers.get("content-length"));
    item.total=encoding&&encoding!=="identity"?undefined:Number.isSafeInteger(length)&&length>0?length:asset.bytes;
    reportAssets(true);
    const chunks:Uint8Array[]=[];
    if(response.body){
      const reader=response.body.getReader();
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        chunks.push(value);item.received+=value.byteLength;
        if(item.total!==undefined&&item.received>item.total)item.total=undefined;
        reportAssets();
      }
    }else{
      const value=new Uint8Array(await response.arrayBuffer());
      chunks.push(value);item.received=value.byteLength;
    }
    if(item.total!==item.received)item.total=undefined;
    const payloadArray=new Uint8Array(item.received);
    let offset=0;
    for(const chunk of chunks){payloadArray.set(chunk,offset);offset+=chunk.byteLength;}
    chunks.length=0;
    performance.measure("arena:download:"+label,{start:started,end:performance.now()});
    item.phase="verify";reportAssets(true);await yieldForPaint();abort.signal.throwIfAborted();
    started=performance.now();
    const payload=payloadArray.buffer;
    const signature = new Uint8Array(payload, 0, 2);
    const bytes = signature[0] === 0x1f && signature[1] === 0x8b
      ? await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
      : payload;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== asset.sha256) throw new Error("CAD mesh integrity mismatch");
    performance.measure("arena:verify:"+label,{start:started,end:performance.now()});
    item.phase="parse";reportAssets(true);await yieldForPaint();abort.signal.throwIfAborted();
    started=performance.now();
    const model=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,"")).scene;
    performance.measure("arena:parse:"+label,{start:started,end:performance.now()});
    if(disposed||abort.signal.aborted){disposeObjects(model);throw new DOMException("Cancelled","AbortError");}
    pendingAssets.add(model);item.phase="done";reportAssets(true);
    return model;
  }
  void (async () => {
    const asset=await resolveCadModel("rmucField");
    const assets=[{...asset,bytes:CAD_MODELS.rmucField.bytes},MECHANISM_ASSET,CORE_ASSET,DART_ASSET];
    for(const item of assets)assetProgress.set(item.url,{phase:"download",received:0,total:item.bytes});
    reportAssets(true);
    const [field,parts,coreParts,dartParts]=await Promise.all(assets.map(loadAsset));
    if(disposed)return;
    onProgress({phase:"terrain"});await yieldForPaint();abort.signal.throwIfAborted();
    let phaseStarted=performance.now();
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
    air=createAirSystem(scene,airPadCenters(field));
    coreGeometry=installCoreGeometry(field,coreParts);
    coreGeometry.group.removeFromParent();
    terrain = createArenaTerrain(root);
    const mini=document.createElement("canvas");mini.width=280;mini.height=150;
    const ctx=mini.getContext("2d")!;
    const pixels=ctx.createImageData(280,150);
    for(let j=0;j<150;j++)for(let i=0;i<280;i++){
      const h=terrain.heightAt(14-(i+.5)/10,7.5-(j+.5)/10),v=Number.isFinite(h)?Math.min(160,Math.round(42+Math.max(0,h)*65)):16,k=(j*280+i)*4;
      pixels.data[k]=v;pixels.data[k+1]=Math.min(255,v+9);pixels.data[k+2]=Math.min(255,v+18);pixels.data[k+3]=255;
    }
    ctx.putImageData(pixels,0,0);mapImage=mini.toDataURL();
    performance.measure("arena:terrain",{start:phaseStarted,end:performance.now()});
    onProgress({phase:"initialize"});await yieldForPaint();abort.signal.throwIfAborted();
    phaseStarted=performance.now();
    field.add(coreGeometry.group);
    field.updateMatrixWorld(true);
    // Ground support uses the static CAD envelope without movable energy units.
    mechanism=installMechanisms(field,parts,dartParts,{scene,texture:softGlowTexture()});
    dartVisual=createDartVisual(scene,mechanism);
    exhibit = addRobotPreviews(map, scene, terrain);
    robots = exhibit.children.map(object => {
      const group = object as THREE.Group;
      return { object: group, position: group.position, radius: group.userData.radius,
        driveable: group.userData.driveable === true, name: group.userData.name,
        eyeHeight: group.userData.eyeHeight ?? 1, wheelRadius: group.userData.wheelRadius ?? .12 };
    });
    for(const team of ["red","blue"] as const){
      const radar=new THREE.Group();radar.name=team+"-radar";
      const tint=team==="red"?0xe25d58:0x56a6e9;
      const body=new THREE.Mesh(new THREE.BoxGeometry(.3,.18,.24),new THREE.MeshStandardMaterial({color:tint,metalness:.4,roughness:.6}));
      radar.add(body);radar.position.copy(radarOrigins[team]);scene.add(radar);
    }
    scene.updateMatrixWorld(true);
    for(const team of ["red","blue"] as const){
      const rotor=mechanism.parts.getObjectByName(team+"-outpost-rotor")!;
      for(let i=0;i<3;i++)bindArmorFrame(mechanism.parts.getObjectByName(team+"-outpost-armor-"+i)!,rotor);
    }
    fieldRobots=robots.filter(r=>!!groundIdentity(r.object.name));
    armorGlow=createArmorGlow(scene,fieldRobots.map(r=>r.object));
    robotFeedback=createRobotFeedback(scene,fieldRobots.map(r=>r.object),(["red","blue"] as const).flatMap((team,i)=>[...(["base","outpost"] as const).map(kind=>({key:team+"-"+kind,team,kind,object:mechanism!.parts.getObjectByName(team+"-"+kind+"-assembly")!})),{key:team+"-rune",team,kind:"rune" as const,object:mechanism!.banks[i]},{key:team+"-dart",team,kind:"dart" as const,object:mechanism!.dartBindings.find(b=>b.team===team)!.guides}]));
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
    match=createMatch(roster(),undefined,undefined,coreGeometry?.energySpawns,coreGeometry?.coreSockets,seed);
    eventFeed.clear();robotFeedback?.clear();taskLog.length=0;match.onDamage=recordDamage;match.onEvent=recordEvent;
    // Three.js raycasting can reject misses against local geometry boxes
    // before testing triangles; important for the large CAD field.
    scene.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.computeBoundingBox();});
    explorer.set(-10, terrain.heightAt(-10, -1.25), -1.25);
    for(const robot of robots){
      const r=match.robots.find(r=>r.id===robot.object.name);
      if(r?.heavy)launcherModels.set(r.id,bindLauncherModule(robot.object,benchModules,launcherBench(r.team).pad));
    }
    syncLaunchers();mechanism.applyDart(match);mechanism.setRuneLights(runeLights(match,"red"),runeLights(match,"blue"));
    prepareShots=createArenaShotPreparer(shotRoots(),new Set([
      mechanism.parts,coreGeometry.group,...coreGeometry.cores.map(c=>c.object),
      ...mechanism.dartBindings.flatMap(b=>[b.door,b.carriage]),benchModules,...fieldRobots.map(r=>r.object)
    ]));
    performance.measure("arena:initialize",{start:phaseStarted,end:performance.now()});
    pendingAssets.clear();
    ready = true;
    firstFrameStarted=performance.now();onProgress({phase:"firstFrame"});
    setView("first");
  })().catch(() => {
    abort.abort();
    if (!disposed) onError("三维场地加载失败，请重试");
  });

  return {
    radarView(value){if(!activeRobot()&&mode!=="ai-first"){if(radarPerspective!==value)audio.stop();radarPerspective=value;if(value!=="all"){stopDirector();if(mode==="third"||mode==="detail")setView("all");}if(observed&&!allowedObservation(observed)){observed=null;if(mode==="follow")setView("all");}publish();invalidate();}},
    airStop(team){if(!experiment?.running&&match?.phase==="running"&&!activeRobot()&&radarPerspective==="all"){air?.stop(team);publish();invalidate();}},
    radarDouble(){const r=activeRobot();if(match?.phase==="running"&&r)activateRadarDouble(match.radar,r.team,match.elapsed);publish();},
    configureStrategies(value){if(!match||match.phase==="running"||experiment?.running||!validStrategy(value.red)||!validStrategy(value.blue))return false;strategies=structuredClone(value);return true;},
    startExperiment,cancelExperiment,
    configureSeed(value){if(!match||experiment?.running||match.phase==="running"||!Number.isInteger(value)||value<0||value>0xffffffff)return false;seed=value;reset();return true;},
    director:enabled=>{if(enabled)enableDirector();else{stopDirector();publish();invalidate();}},cancelStart,view: next=>setView(next), observe, takeControl, toggleSpin, interact, move, touchAction, pause, settings:applySettings, start, buy, heal, revive, install, removeLauncher:detachLauncher, pickup, drop, assembly, assemblyStep, cancelAssembly:cancel, fire:trigger, reset:()=>{if(!experiment?.running)reset();},performance:value=>{if(match&&driving)selectInfantryPerformance(match,driving.object.name,value);publish();invalidate();},stance:(mode,enhanced)=>{if(match&&driving)switchSentry(match,driving.object.name,mode,enhanced,true);publish();invalidate();},rune:()=>{if(match&&driving)activateRune(match,driving.object.name);publish();invalidate();},
    sentryControl:value=>{if(match&&driving)selectSentryControl(match,driving.object.name,value);publish();invalidate();},
    sentryMark:kind=>{const r=activeRobot();if(match&&r)markSentry(match,r.id,`${r.team}-${kind}`);publish();invalidate();},
    armorFortify:(x,y)=>{const r=activeRobot();if(match&&r){const c=recommendedArmorCenter(match,r.team);fortifyArmor(match,r.team,{x:x??c.x,y:y??c.y});}publish();invalidate();},
    dartSelect:value=>{const r=activeRobot();if(match&&r)selectDart(match,r.team,value);publish();invalidate();},
    dartOpen:()=>{const r=activeRobot();if(match&&r)openDart(match,r.team);publish();invalidate();},
    dartFire:()=>{const r=activeRobot();if(match&&r)launchDart(match,r.team);publish();invalidate();},
    dispose() {
      disposed = true;experimentChannel.port1.close();experimentChannel.port2.close();
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
      window.removeEventListener("orientationchange",clearInput);
      reducedMotion.removeEventListener("change",invalidate);
      window.removeEventListener("pointerup", pointerup);
      window.removeEventListener("pointercancel", pointerup);
      countdownEnd=0;audio.dispose();stopDirector();canvas.removeEventListener("wheel",wheel);controls.removeEventListener("start",orbitStart);
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      projectiles.dispose();dartVisual?.dispose();armorGlow?.dispose();robotFeedback?.dispose();
      for(const asset of pendingAssets)if(!asset.parent)disposeObjects(asset);
      pendingAssets.clear();
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