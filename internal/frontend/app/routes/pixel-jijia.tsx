import { worldItems, guestCatch, pondLabels, closestItemSource, availableSources, type ItemSource, type ItemRow } from "~/lib/pixel-jijia-items";
import { freshLoans, lifeObjects, closeLife, plantStage, plantPoint, outdoorPlacement, studyPlacement, placementClear, lifeBlocks, plantCarrySprite, type HeldItem, type PlantRecord, type LifeObject } from "~/lib/pixel-jijia-nature";
import { PixelInventory } from "~/components/pixel-jijia-inventory";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { getExperienceReturnTo, experienceReturnLabel, getPixelReturn } from "~/lib/experience-navigation";
import type { Route } from "./+types/pixel-jijia";
import { buildPublicMeta } from "~/lib/social-meta";
import {
  FOUNTAIN, groundAt, pathIsWalkable, waterDepthAt, PLACES, SCENERY, SPAWN, TILE, WORLD_HEIGHT, WORLD_WIDTH, cameraAt, clampZoom, closestPlace, closestFeature, nearDoor, movePlayer, isWalkable, outdoorDoorAt, snapCamera, advanceSurfaceTrail, directionToward,
  type SurfaceMark, type Direction, type Place, type Position, type Scenery,
} from "~/lib/pixel-jijia-world";
import { buildingBounds, renderNavigationMap, renderParticles, renderScene, renderTerrain, renderWorldPreview, WORLD_ART_SCALE, type Terrain, type PixelParticle, type SpriteIndex } from "~/lib/pixel-jijia-scene";
import { explorerAnimation,initialExplorerAnimation,type ExplorerAnimation } from "~/lib/pixel-jijia-explorer";
import { ROOMS, STUDY_ROOM, closestRoomObject, seatPlacement, seatDepth, meetingChair, meetingSeat, roomInteractable, type SeatObject, roomInteractionDistance, roomObjectAt, isRoomWalkable, roomExitAt, renderRoomScene, renderRoomTerrain, type RoomObject } from "~/lib/pixel-jijia-room";
import { createWildlife, createCampusPets, updateWildlife, closestAnimal, fishingTarget, beginFishing, fishingReady, fishingPose, animalLabel, observeAnimal, petAnimal, foodPosition, placeAnimalFood, createCompanion, updateCompanion, dryAnimalWalkable, animalPath, type Animal, type FishingCast, type Companion, type PetRecord } from "~/lib/pixel-jijia-life";
import { ROOM_ART_SCALE,preparePublicRoomArt, roomObjectVisualBounds, hasEquipmentBehavior, equipmentProgress, roomSpriteKey } from "~/lib/pixel-jijia-room-art";
import { PixelWorldAudio, footstepMaterial, distanceVolume, type LocalSound } from "~/lib/pixel-jijia-audio";
import { COMMUNITY_PREFIX, COMMUNITY_ROOM_OBJECTS, communityCreditRole, communityDiscoveryId } from "~/lib/pixel-jijia-community";
import { BaseObjectDetail, SaveAchievement } from "~/components/pixel-jijia-base-detail";
import { baseAction, carriedLabel, freshBaseRoom, transferItem, togglePower, RESEARCH_IDS, type Achievement } from "~/lib/pixel-jijia-base";
import { CommunityObjectDetail, CommunityCredits } from "~/components/pixel-jijia-community-detail";
import { ApiError, apiRequest } from "~/lib/api-client";
import { getCurrentUser, getCachedCurrentUser, subscribeAuthStateChange, subscribeAccountSessionChange, type AuthUser } from "~/lib/auth-client";
import { STUDY_CATALOG, canPlaceStudy, furnitureSize, makeStudyRoom, type StudyFurniture, type StudyFurnitureKind } from "~/lib/pixel-jijia-study";
import { SEASON_LABEL, changchunClimate, advanceSurface, advanceWind, type SurfaceWeather, type WeatherMode, type TimeMode } from "~/lib/pixel-jijia-climate";
import { usePixelClimate } from "~/lib/pixel-jijia-climate-state";
import groundTilesUrl from "../assets/pixel-jijia/ground-tiles.png?url";
import plazaPropsUrl from "../assets/pixel-jijia/plaza-props.png?url";
import roomPropsUrl from "../assets/pixel-jijia/room-props-v3.png?url";
import roomSprites from "../assets/pixel-jijia/room-props-v3.json";
import communityPropsUrl from "../assets/pixel-jijia/room-community-v31.png?url";
import communitySprites from "../assets/pixel-jijia/room-community-v31.json";
import { JOYSTICK_RADIUS, joystickIntent } from "~/lib/pixel-jijia-input";
import { ROBOT_MODELS, DART_BODY, createCampusRobots, nearestRobot, startRobotDemo, tickCampusRobot, robotInReach, robotBlocksPlayer, type CampusRobot, type RobotAtlases, aimTraining, releaseCampusRobot, inTrainingField, createTraining, tickTraining, fireTraining, type TrainingSession } from "~/lib/pixel-jijia-robot";
import "./pixel-jijia.css";

const DEFAULT_ZOOM = 1.35;
const communityObjects = Object.values(COMMUNITY_ROOM_OBJECTS).flat();

type Feature = Place | Scenery;
const featureTitle = (feature: Feature) => "href" in feature ? feature.title : feature.story?.title ?? (feature.sprite === "bench" ? "石凳" : "发现");
const featureAction=(feature:Feature)=>"href" in feature?"进入":feature.sprite==="bench"?"坐下":feature.story?.action??"观察";
const roomAction=(object:RoomObject,roomId?:string,state= freshBaseRoom())=>{
 const action=baseAction(roomId,object.id);
 if(action==="power")return state.power[object.id]===undefined?"切换设备":state.power[object.id]?"关闭设备":"开启设备";
 if(action==="take")return state.item==="source"?"拿取零件":"归还零件";
 if(action==="assembly")return "装配";
 if(action==="drink")return state.drank?"查看外卖":"休息饮用";
 if(action==="water")return state.watered.includes(object.id)?"已浇水":"浇水";
 if(action&&action!=="links")return action==="history"?"查看档案":"开始实验";
 return object.kind==="chair"?"坐下":object.kind==="exit"?"离开":({senior:"对话",meeting:"落座",drive:"驾驶",assembly:"组装",terminal:"使用",silverwolf:"使用",memoir:"查看",memory:"查看"} as Record<string,string>)[object.community?.interaction??""]??(object.community?"互动":"查看");
};

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
};

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "像素吉甲 | TARSGO",
    description: "漫游吉甲大师像素小镇，探索机械、电控、视觉、AI、赛事荣誉与招新公会。",
    path: "/pixel-jijia",
    image: "/assets/images/Social/home.jpg",
  });
}

export default function PixelJijiaPage() {
  const location=useLocation();
  const pixelReturn=getPixelReturn(location.state);
  const returnTo=pixelReturn?.parent??getExperienceReturnTo(location.state,"/");
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Position>(pixelReturn&&isWalkable(pixelReturn.x,pixelReturn.y)?{x:pixelReturn.x,y:pixelReturn.y}:{...SPAWN});
  const robotsRef=useRef<CampusRobot[]|null>(null);
  if(!robotsRef.current)robotsRef.current=createCampusRobots();
  const robots=robotsRef.current;
  const robotAtlasesRef=useRef<RobotAtlases>(new Map());
  const [controlledRobot,setControlledRobot]=useState<CampusRobot|null>(null);
  const robotControlled=controlledRobot!==null;
  const activeRobot=controlledRobot??robots[0];
  const trainingRef=useRef<TrainingSession|null>(null);
  const [trainingPhase,setTrainingPhase]=useState<TrainingSession["phase"]|null>(null);
  const pilotZoomRef=useRef(DEFAULT_ZOOM);
  const cameraRef = useRef<Position>({ x: 0, y: 0 });
  const directionRef = useRef<Direction>("down");
  const keysRef = useRef(new Set<Direction>());
  const sprintKeyRef = useRef(false);
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystick = useRef<{ pointer: number; startX: number; startY: number; moved: boolean; x: number; y: number; running: boolean } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const tapPointers = useRef(new Map<number, {x:number;y:number}>());
  const releaseJoystick = useCallback(() => {
    const pointer = joystick.current?.pointer;
    joystick.current = null;
    if (joystickRef.current) { joystickRef.current.hidden = true; joystickRef.current.dataset.running = "false"; }
    const canvas = canvasRef.current;
    if (pointer !== undefined && canvas?.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }, []);
  const clearInput = useCallback(() => {
    keysRef.current.clear(); sprintKeyRef.current = false; tapPointers.current.clear(); releaseJoystick();
  }, [releaseJoystick]);
  const selectedRef = useRef<Feature | null>(null);
  const terrainRef = useRef<Terrain | null>(null);
  const wildlifeRef = useRef<Animal[]>([]);
  const surfaceRef=useRef<SurfaceWeather>({wet:0,snow:0});
  const windRef=useRef(0);
  const trailRef = useRef<SurfaceMark[]>([]);
  const castRef = useRef<FishingCast | null>(null);
  const poseRef=useRef<ExplorerAnimation>(initialExplorerAnimation);
  const naturePromptRef = useRef("");
  const noticeUntilRef = useRef(0);
  const [naturePrompt,setNaturePrompt] = useState("");
  const [natureNotice,setNatureNotice] = useState<string | RoomObject>("");
  const [discoveries,setDiscoveries] = useState<string[]>([]);
  const storySites=SCENERY.filter(p=>p.story);
  const knownStories=storySites.filter(p=>discoveries.includes(p.story!.title));
  const natureDiscoveries=discoveries.filter(name=>!name.startsWith(COMMUNITY_PREFIX)&&!storySites.some(p=>p.story!.title===name));
  const knownCommunity=communityObjects.filter(object=>discoveries.includes(communityDiscoveryId(object)));
  const groundTilesRef = useRef<HTMLImageElement | null>(null);
  const roomTerrainRef = useRef<Record<string, HTMLCanvasElement>>({});
  const transitionRef = useRef<{
    target: string | null; phase: "out" | "in"; started: number | null; swap: () => void;
  } | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const characterRef = useRef<HTMLImageElement | null>(null);
  const artRef = useRef<HTMLImageElement | null>(null);
  const artIndexRef = useRef<SpriteIndex | null>(null);
  const propsRef = useRef<HTMLImageElement | null>(null);
  const nearIdRef = useRef<string | null>(null);
  const nearRoomIdRef = useRef<string | null>(null);
  const zoomRef = useRef(pixelReturn?.zoom??DEFAULT_ZOOM);
  const [zoom, setZoom] = useState(pixelReturn?.zoom??DEFAULT_ZOOM);
  const {climate,climateRef,timeMode,weatherMode,changeTimeMode,changeWeatherMode,weatherLabel,hasLiveWeather}=usePixelClimate();
  const [mapOpen, setMapOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [assetState, setAssetState] = useState<"loading" | "ready" | "error">("loading");
  const [nearby, setNearby] = useState<Feature | null>(null);
  const [selected, setSelected] = useState<Feature | null>(null);

  const [seated, setSeated] = useState<{ object:SeatObject; exit: Position } | null>(null);
  const effectsRef = useRef(new Map<string,number>());
  const [baseState,setBaseState]=useState(freshBaseRoom);
  const gatheredSources=useRef(new Map<string,number>());
  const [inventoryChange,setInventoryChange]=useState(0);
  const [pet,setPet]=useState<PetRecord|null>(null);
  const companionRef=useRef<Companion|null>(null);
  const petOwner=useRef<number|null>(null);
  const petGeneration=useRef(0);
  const animalActionRef=useRef<AbortController|null>(null);
  const [animalBusy,setAnimalBusy]=useState(false);
  const [animalMenu,setAnimalMenu]=useState<string|null>(null);
  const [petName,setPetName]=useState("");
  const [heldItem,setHeldItem]=useState<HeldItem|null>(null);
  const [loans,setLoans]=useState(()=>freshLoans("outdoor"));
  const [publicPlants,setPublicPlants]=useState<PlantRecord[]>([]);
  const [studyPlants,setStudyPlants]=useState<PlantRecord[]>([]);
  const lifePromptRef=useRef("");
  const pendingFood=useRef<{animal:string;point:Position;revision:number;item:string}|null>(null);
  const [freshFish,setFreshFish]=useState(false);
  const [studyAchievements,setStudyAchievements]=useState<Achievement[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const worldAudioRef=useRef<PixelWorldAudio|null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef=useRef(false);
  useEffect(()=>{
    const unlock=(event:Event)=>{
      if(!event.isTrusted||mutedRef.current||document.hidden)return;
      (worldAudioRef.current??=new PixelWorldAudio()).unlock();
    };
    window.addEventListener("keydown",unlock,true);window.addEventListener("pointerdown",unlock,true);
    return ()=>{
      window.removeEventListener("keydown",unlock,true);window.removeEventListener("pointerdown",unlock,true);
      audioRef.current?.pause();worldAudioRef.current?.dispose();worldAudioRef.current=null;
    };
  },[]);
  const [studyEditing, setStudyEditing] = useState(false);
  const [catalogueDetail, setCatalogueDetail] = useState<RoomObject | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const studyAccessRef = useRef<{ownerId:number;controller:AbortController}|null>(null);
  const [studyItems, setStudyItems] = useState<StudyFurniture[]>([]);
  const [studyGuest, setStudyGuest] = useState(false);
  const [studyTool, setStudyTool] = useState<StudyFurnitureKind | "erase">("desk");
  const [studySaving, setStudySaving] = useState(false);
  const [studyNotice, setStudyNotice] = useState("");
  const [studyHasInvite, setStudyHasInvite] = useState(false);
  const [studyInvite, setStudyInvite] = useState("");
  const room = useMemo(() => roomId === "study"
    ? makeStudyRoom(studyItems, studyGuest)
    : roomId ? ROOMS[roomId] ?? null : null, [roomId, studyItems, studyGuest]);
  const sceneRef=useRef(roomId??"outdoor");
  sceneRef.current=roomId??"outdoor";
  const sceneLife=useMemo(()=>lifeObjects(roomId&&roomId!=="study"?[]:loans,roomId==="study"?studyPlants:roomId?[]:publicPlants,heldItem),[roomId,loans,studyPlants,publicPlants,heldItem]);
  useEffect(()=>{setLoans(freshLoans(roomId??"outdoor"));},[roomId]);
  const roomScale = room ? room.id !== "study" ? ROOM_ART_SCALE : 1 : WORLD_ART_SCALE;
  const [nearbyRoom, setNearbyRoom] = useState<RoomObject | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomObject | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const targetRef = useRef<Feature | RoomObject | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      const stored:unknown=JSON.parse(localStorage.getItem("pixel-jijia-nature-log")??"[]");
      if(Array.isArray(stored))setDiscoveries(stored.filter((item):item is string=>typeof item==="string"));
    } catch { /* Ignore an invalid local collection. */ }
  },[]);
  const recordDiscovery = useCallback((item:string,notice?:string)=>{
    if(notice){setNatureNotice(notice);noticeUntilRef.current=performance.now()+3200;}
    setDiscoveries(items=>items.includes(item)?items:[...items,item]);
  },[]);
  useEffect(() => {
    if(discoveries.length) localStorage.setItem("pixel-jijia-nature-log",JSON.stringify(discoveries));
  },[discoveries]);
  const resetStudy = useCallback(() => {
    studyAccessRef.current?.controller.abort();
    studyAccessRef.current=null;
    setStudyItems([]);setStudyPlants([]);setStudyAchievements([]);setStudyGuest(false);setStudyEditing(false);
    setStudySaving(false);setStudyHasInvite(false);setStudyInvite("");setStudyNotice("");
  }, []);
  const invalidateOwnerStudy = useCallback(() => {
    if (!studyAccessRef.current) return;
    resetStudy();
    transitionRef.current=null;
    clearInput();effectsRef.current.clear();audioRef.current?.pause();
    playerRef.current={...SPAWN};setSeated(null);setRoomId(null);
    setSelectedRoom(null);setSelected(null);selectedRef.current=null;
    targetRef.current=null;setMapOpen(false);
  }, [resetStudy,clearInput]);
  const applyPet=useCallback((record:PetRecord|null)=>{
    const current=companionRef.current;
    if(record&&(!current||current.species!==record.species||current.variant!==record.variant))companionRef.current=createCompanion(record);
    if(!record)companionRef.current=null;
    setPet(record);
  },[]);
  const clearAnimalSession=useCallback(()=>{
    ++petGeneration.current;petOwner.current=null;
    animalActionRef.current?.abort();animalActionRef.current=null;
    gatheredSources.current.clear();setSeated(old=>{if(old?.object&&"id" in old.object&&old.object.id.startsWith("picnic-mat:")){playerRef.current=old.exit;return null;}return old;});setLoans(freshLoans(sceneRef.current));setPublicPlants([]);pendingFood.current=null;setHeldItem(null);setAnimalBusy(false);setAnimalMenu(null);setPetName("");
    applyPet(null);
    for(const a of wildlifeRef.current){a.food=undefined;a.familiar=0;a.observed=false;a.petting=0;a.calm=0;a.satiated=0;}
  },[applyPet]);
  const loadPet=useCallback(async()=>{
    const generation=++petGeneration.current;
    try{
      const user=await getCurrentUser();
      if(generation!==petGeneration.current||getCachedCurrentUser()?.id!==user.id)return;
      petOwner.current=user.id;
      const record=await apiRequest<PetRecord|null>("/api/pixel-home/pet",{cache:"no-store"});
      void apiRequest<{source:string;nextAt:number}[]>("/api/pixel-home/gathered",{cache:"no-store"}).then(rows=>{
        if(generation===petGeneration.current&&getCachedCurrentUser()?.id===user.id)for(const row of rows)gatheredSources.current.set(row.source,Math.max(row.nextAt,gatheredSources.current.get(row.source)??0));
      }).catch(()=>{});
      if(generation===petGeneration.current&&getCachedCurrentUser()?.id===user.id)applyPet(record);
    }catch(error){
      if(generation===petGeneration.current&&error instanceof ApiError&&error.status===401){petOwner.current=null;applyPet(null);}
    }
  },[applyPet]);
  useEffect(() => {
    const onAuth=(user:AuthUser|null)=>{
      if(castRef.current?.owner && castRef.current.owner!==user?.id)castRef.current=null;
      if(studyAccessRef.current&&studyAccessRef.current.ownerId!==user?.id)invalidateOwnerStudy();
      if(petOwner.current!==(user?.id??null)){clearAnimalSession();if(user)void loadPet();}
    };
    const unsubscribe=subscribeAuthStateChange(onAuth);
    const unsubscribeSession=subscribeAccountSessionChange(()=>{castRef.current=null;invalidateOwnerStudy();setBaseState(freshBaseRoom());setFreshFish(false);setSelectedRoom(null);clearAnimalSession();void loadPet();});
    void loadPet();
    return()=>{unsubscribe();unsubscribeSession();studyAccessRef.current?.controller.abort();++petGeneration.current;animalActionRef.current?.abort();};
  }, [invalidateOwnerStudy,clearAnimalSession,loadPet]);
  const standUp = useCallback(() => {
    if (!seated) return;
    playerRef.current = seated.exit;
    setSeated(null);
  }, [seated]);
  const selectRoomObject = useCallback((object: RoomObject | null) => {
    if (!object && selectedRoom?.community?.interaction === "meeting") standUp();
    clearInput();
    setSelectedRoom(object);
  }, [selectedRoom, standUp, clearInput]);
  const discover = (object: RoomObject) => {
    const id=communityDiscoveryId(object);
    if(!object.community || discoveries.includes(id)) return;
    recordDiscovery(id);setNatureNotice(object);noticeUntilRef.current=performance.now()+3200;
  };
  const fishingNotice=useCallback((message:string)=>{
    setNatureNotice(message);noticeUntilRef.current=performance.now()+3200;
  },[]);
  const visibleAnimals=useCallback(()=>{
    const animals=room?[]:wildlifeRef.current.filter(a=>!pet||a.variant!==pet.variant||a.species!==pet.species);
    const companion=companionRef.current;
    if(pet&&companion&&!studyGuest&&companion.scene===(room?.id??"campus")&&(pet.mode==="follow"||room?.id==="study"))animals.push(companion);
    return animals;
  },[room,pet,studyGuest]);
  const animalWalkable=useCallback((x:number,y:number)=>!lifeBlocks(sceneLife,x,y)&&(room?isRoomWalkable(room,x,y):dryAnimalWalkable(x,y)&&!inTrainingField({x,y},0)),[room,sceneLife]);
  const reachableAnimal=useCallback((a:Animal,limit=2.7)=>{
    const player=playerRef.current;
    return Math.hypot(a.x-player.x,a.y-player.y)<=limit&&(a.species==="fish"||animalPath(player,a,animalWalkable));
  },[animalWalkable]);
  const nearAnimal=useCallback(()=>{
    const animals=visibleAnimals();
    if(heldItem){
      const suitable=animals.filter(a=>heldItem.item.feeds?.includes(a.species)&&reachableAnimal(a,a.species==="fish"?5:3.5));
      if(suitable.length)return closestAnimal(suitable,playerRef.current,5.1);
    }
    return closestAnimal(animals.filter(a=>reachableAnimal(a)),playerRef.current);
  },[visibleAnimals,heldItem,reachableAnimal]);
  const openAnimal=useCallback((a:Animal)=>{
    if(!reachableAnimal(a,heldItem?.item.feeds?.includes(a.species)?a.species==="fish"?5:3.5:2.7))return;
    clearInput();observeAnimal(a);directionRef.current=directionToward(playerRef.current,a,directionRef.current);
    poseRef.current={...poseRef.current,action:"observe",since:performance.now()};
    if(a.id!=="companion")recordDiscovery(animalLabel(a));
    setAnimalMenu(a.id);setPetName(a.id==="companion"?pet?.name??"":"");
  },[clearInput,recordDiscovery,heldItem,reachableAnimal,pet]);
  const runAnimalAction=useCallback(async(action:(owner:number,signal:AbortSignal)=>Promise<void>)=>{
    if(animalActionRef.current)return;
    const controller=new AbortController();animalActionRef.current=controller;setAnimalBusy(true);
    try{
      const user=await getCurrentUser();
      if(controller.signal.aborted||getCachedCurrentUser()?.id!==user.id)return;
      await action(user.id,controller.signal);
    }catch(error){
      if(!controller.signal.aborted)fishingNotice(error instanceof Error?error.message:"操作未确认，请重试");
    }finally{
      if(animalActionRef.current===controller){animalActionRef.current=null;setAnimalBusy(false);}
    }
  },[fishingNotice]);
  const nearbySource=()=>closestItemSource(playerRef.current,climateRef.current?.season??"summer",gatheredSources.current,Date.now());
  const collectSource=useCallback((source:ItemSource)=>runAnimalAction(async(owner,signal)=>{
    const id=source.id;
    const item=worldItems.get(id);
    if(!item?.gather)return;
    const rows=await apiRequest<ItemRow[]>("/api/pixel-home/items",{cache:"no-store",signal});
    const row=rows.find(r=>r.id===id);
    if((row?.quantity??0)>=item.gather){fishingNotice("背包里已有足够的"+item.name);return;}
    if(signal.aborted||getCachedCurrentUser()?.id!==owner)return;
    let result:{nextAt:number};
    try{result=await apiRequest<{nextAt:number}>("/api/pixel-home/collect",{method:"POST",body:{owner,id,revision:row?.revision??0,target:source.key},signal});}
    catch(error){
      if(error instanceof ApiError&&error.status===409&&!signal.aborted){
        const rows=await apiRequest<{source:string;nextAt:number}[]>("/api/pixel-home/gathered",{cache:"no-store",signal});
        if(!signal.aborted&&getCachedCurrentUser()?.id===owner){for(const r of rows)gatheredSources.current.set(r.source,r.nextAt);setInventoryChange(n=>n+1);}
      }
      throw error;
    }
    if(signal.aborted||getCachedCurrentUser()?.id!==owner)return;
    gatheredSources.current.set(source.key,result.nextAt);
    setHeldItem(old=>old?.row?.id===id?null:old);
    poseRef.current={...poseRef.current,action:"observe",since:performance.now()};
    directionRef.current=directionToward(playerRef.current,source,directionRef.current);
    setInventoryChange(n=>n+1);fishingNotice("收入背包 · "+item.name);
  }),[runAnimalAction,fishingNotice]);
  const feedAnimal=(a:Animal)=>{
    if(!heldItem?.row||!heldItem.item.feeds?.includes(a.species)||castRef.current||robotControlled)return;
    const pending=pendingFood.current;
    if(pending&&pending.animal!==a.id){fishingNotice("请先确认上一次喂食");return;}
    const point=pending?.point??foodPosition(a,playerRef.current,room?animalWalkable:undefined);
    if(!point){fishingNotice("再靠近一点，找一处动物能到达的地方");return;}
    pendingFood.current={animal:a.id,point,revision:heldItem.row.revision,item:heldItem.item.id};
    void runAnimalAction(async(owner,signal)=>{
      if(owner!==heldItem.owner)return;
      try{
        await apiRequest("/api/pixel-home/feed",{method:"POST",body:{owner,id:heldItem.item.id,revision:heldItem.row.revision,species:a.species,target:a.id},signal});
      }catch(error){
        if(error instanceof ApiError&&error.status===409&&!signal.aborted){pendingFood.current=null;setHeldItem(null);setInventoryChange(n=>n+1);}
        throw error;
      }
      if(signal.aborted||getCachedCurrentUser()?.id!==owner)return;
      placeAnimalFood(a,point,heldItem.item);pendingFood.current=null;setHeldItem(null);setInventoryChange(n=>n+1);
      setAnimalMenu(null);fishingNotice("放下"+heldItem.item.name);
    });
  };
  const adoptAnimal=(a:Animal)=>{
    const name=petName.trim();
    if(pet||!a.variant||!a.observed||!a.familiar||!reachableAnimal(a)||!name||name.length>16)return;
    void runAnimalAction(async(owner,signal)=>{
      const record=await apiRequest<PetRecord>("/api/pixel-home/pet",{method:"POST",body:{owner,name,species:a.species,variant:a.variant},signal});
      if(signal.aborted||getCachedCurrentUser()?.id!==owner)return;
      petOwner.current=owner;applyPet(record);
      const companion=companionRef.current;
      if(companion){companion.scene="campus";companion.x=a.x;companion.y=a.y;companion.home={x:a.x,y:a.y};}
      setAnimalMenu(null);fishingNotice(record.name+" 加入了你的校园生活");
    });
  };
  const savePet=(mode:PetRecord["mode"],name:string)=>{
    if(!pet||!name.trim()||(mode==="home"&&(room?.id!=="study"||studyGuest)))return;
    if(pet.mode===mode&&pet.name===name.trim()){setAnimalMenu(null);return;}
    void runAnimalAction(async(owner,signal)=>{
      if(petOwner.current!==owner)return;
      const record=await apiRequest<PetRecord>("/api/pixel-home/pet",{method:"PUT",body:{owner,name:name.trim(),mode,revision:pet.revision},signal});
      if(signal.aborted||getCachedCurrentUser()?.id!==owner)return;
      if(pet.mode==="home"&&mode==="follow"&&companionRef.current&&room?.id!=="study")companionRef.current.scene="";
      applyPet(record);setAnimalMenu(null);fishingNotice(mode==="home"?record.name+" 留在研究室":record.name+" · 跟随中");
    });
  };
  const lifePose=(point:Position)=>{
    clearInput();directionRef.current=directionToward(playerRef.current,point,directionRef.current);
    poseRef.current={...poseRef.current,action:"observe",since:performance.now()};
  };
  const restoreHeld=()=>{
    if(heldItem?.loan){const loan=heldItem.loan;const origin=freshLoans(sceneRef.current).find(o=>o.key===loan.key)??loan;setLoans(old=>[...old.filter(o=>o.key!==loan.key),origin]);}
    pendingFood.current=null;setHeldItem(null);
  };
  const combineItem=(target:"workbench"|"open")=>{
    if(!heldItem?.row||studyGuest)return;
    const current=heldItem;
    if(target==="workbench"&&!["wrench","wheel"].includes(current.item.id)||target==="open"&&current.item.id!=="pinecone")return;
    void runAnimalAction(async(owner,signal)=>{
      if(owner!==current.owner)return;
      try{
        const result=await apiRequest<{id:string}>("/api/pixel-home/combine",{method:"POST",body:{owner,id:current.item.id,revision:current.row.revision,target},signal});
        if(signal.aborted||getCachedCurrentUser()?.id!==owner)return;
        const rows=await apiRequest<ItemRow[]>("/api/pixel-home/items",{cache:"no-store",signal});
        if(signal.aborted||getCachedCurrentUser()?.id!==owner)return;
        const item=worldItems.get(result.id),row=rows.find(r=>r.id===result.id&&r.quantity>0);
        setHeldItem(item&&row?{item,row,owner}:null);setInventoryChange(n=>n+1);
        lifePose(playerRef.current);fishingNotice((target==="workbench"?"清理完成 · ":"剥出 · ")+(item?.name??""));
      }catch(error){
        if(error instanceof ApiError&&error.status===409&&!signal.aborted){setHeldItem(null);setInventoryChange(n=>n+1);}
        throw error;
      }
    });
  };
  const lifeReach=(point:Position)=>room?isRoomWalkable(room,point.x,point.y)&&animalPath(playerRef.current,point,(x,y)=>isRoomWalkable(room,x,y)):pathIsWalkable(playerRef.current,point,true);
  const lifeLabel=(object:LifeObject)=>{
    if(studyGuest||animalBusy)return "";
    if(heldItem?.item.id==="water-can"&&object.type==="plant"&&!object.value.wateredAt)return "浇水";
    if(heldItem?.row&&heldItem.item.kind==="seed"&&object.type==="loan"&&object.value.itemId==="flowerpot")return "播种";
    if(heldItem||baseState.item==="held")return "";
    if(object.type==="loan")return "拿取"+worldItems.get(object.value.itemId)?.name;
    if(room?.id==="study"&&plantStage(object.value)===3)return "收集花朵";
    return object.value.pot!==false?"移动花盆":"";
  };
  const nearLife=(clicked?:Position)=>closeLife(sceneLife.filter(o=>lifeLabel(o)),playerRef.current,lifeReach,clicked);
  const validPlacement=(point:Position,ignore?:LifeObject)=>{
    if(studyGuest||room&&room.id!=="study")return false;
    const valid=(p:Position)=>room?studyPlacement(p)&&isRoomWalkable(room,p.x,p.y):outdoorPlacement(p);
    if(freshLoans(sceneRef.current).some(o=>o.key!==heldItem?.loan?.key&&o.key!==heldItem?.plant?.potKey&&!(ignore?.type==="loan"&&ignore.value.key===o.key)&&Math.hypot(o.x-point.x,o.y-point.y)<.8))return false;
    const companion=companionRef.current;
    if(companion?.scene===(room?.id??"campus")&&Math.hypot(companion.x-point.x,companion.y-point.y)<.75)return false;
    if(!room&&robots.some(robot=>robotBlocksPlayer(robot,point.x,point.y)))return false;
    return placementClear(point,sceneLife.filter(o=>o!==ignore),playerRef.current,valid,.9)&&lifeReach(point);
  };
  const placePoint=(point:Position)=>({x:Math.floor(point.x)+.5,y:Math.floor(point.y)+.5});
  const aheadPoint=()=>{
    const dir=directionRef.current,p=playerRef.current;
    return placePoint({x:p.x+(dir==="left"?-1.4:dir==="right"?1.4:0),y:p.y+(dir==="up"?-1.4:dir==="down"?1.4:0)});
  };
  const mayPlace=()=>Boolean(heldItem&&(heldItem.loan||heldItem.plant||heldItem.row&&heldItem.item.kind==="seed")&&!studyGuest&&!animalBusy&&(!room||room.id==="study"));
  const sowAt=(point:Position,pot?:LifeObject)=>{
    if(!heldItem?.row||heldItem.item.kind!=="seed"||!validPlacement(point,pot))return false;
    const current=heldItem,privateStudy=room?.id==="study";
    void runAnimalAction(async(owner,signal)=>{
      if(owner!==current.owner)return;
      try{
        const plant=await apiRequest<PlantRecord>("/api/pixel-home/sow",{method:"POST",body:{owner,id:current.item.id,revision:current.row.revision,mode:privateStudy?"study":"public",x:Math.floor(point.x),y:Math.floor(point.y)},signal});
        if(signal.aborted||getCachedCurrentUser()?.id!==owner)return;
        const row={...plant,pot:privateStudy||Boolean(pot),potKey:pot?.type==="loan"?pot.value.key:undefined};
        (privateStudy?setStudyPlants:setPublicPlants)(old=>[...old.filter(p=>p.id!==row.id),row]);
        if(pot?.type==="loan")setLoans(old=>old.filter(o=>o.key!==pot.value.key));
        setHeldItem(null);setInventoryChange(n=>n+1);lifePose(point);fishingNotice("已播种 · "+current.item.name);
      }catch(error){
        if(error instanceof ApiError&&error.status===409&&!signal.aborted)setInventoryChange(n=>n+1);
        throw error;
      }
    });
    return true;
  };
  const changePlant=(plant:PlantRecord,mode:"water"|"move"|"harvest",point=plantPoint(plant))=>{
    const privateStudy=room?.id==="study";
    if(studyGuest||animalBusy||mode==="move"&&!validPlacement(point))return false;
    if(mode==="water"&&plant.wateredAt)return false;
    if(mode==="harvest"&&(!privateStudy||plantStage(plant)!==3))return false;
    const apply=(next:PlantRecord)=>{
      (privateStudy?setStudyPlants:setPublicPlants)(old=>mode==="harvest"?old.filter(p=>p.id!==plant.id):old.map(p=>p.id===plant.id?next:p));
      if(mode==="move")setHeldItem(null);
      if(mode==="harvest")setInventoryChange(n=>n+1);
      lifePose(point);fishingNotice(mode==="water"?"已浇水":mode==="move"?"花盆已放置":"花朵已收入背包");
    };
    if(!privateStudy){
      apply({...plant,x:Math.floor(point.x),y:Math.floor(point.y),wateredAt:mode==="water"?Date.now():plant.wateredAt,revision:plant.revision+1});
      return true;
    }
    void runAnimalAction(async(owner,signal)=>{
      const next=await apiRequest<PlantRecord>("/api/pixel-home/plant",{method:"POST",body:{owner,id:plant.id,revision:plant.revision,mode,x:Math.floor(point.x),y:Math.floor(point.y)},signal});
      if(!signal.aborted&&getCachedCurrentUser()?.id===owner)apply({...next,pot:true});
    });
    return true;
  };
  const placeHeld=(point:Position)=>{
    if(!mayPlace()||!heldItem||!validPlacement(point))return false;
    if(heldItem.plant)return changePlant(heldItem.plant,"move",point);
    if(heldItem.loan){const loan=heldItem.loan;setLoans(old=>[...old,{...loan,...point}]);setHeldItem(null);lifePose(point);fishingNotice("已放下"+heldItem.item.name);return true;}
    return sowAt(point);
  };
  const interactLife=(target=nearLife())=>{
    if(!target||!lifeLabel(target)||studyGuest||animalBusy||seated||robotControlled||transitionRef.current)return false;
    if(target.type==="plant"){
      if(heldItem?.item.id==="water-can")return changePlant(target.value,"water");
      if(!heldItem&&room?.id==="study"&&plantStage(target.value)===3)return changePlant(target.value,"harvest");
      if(!heldItem&&target.value.pot!==false){setHeldItem({item:worldItems.get("flowerpot")!,plant:target.value});lifePose(target.point);return true;}
      return false;
    }
    if(heldItem?.row&&heldItem.item.kind==="seed"&&target.value.itemId==="flowerpot")return sowAt(placePoint(target.point),target);
    const item=worldItems.get(target.value.itemId);
    if(!item||heldItem)return false;
    setLoans(old=>old.filter(o=>o.key!==target.value.key));setHeldItem({item,loan:target.value});lifePose(target.point);fishingNotice("拿起"+item.name);return true;
  };
  const restOnMat=(object:LifeObject)=>{
    if(object.type!=="loan"||object.value.itemId!=="picnic-mat"||heldItem||room||!lifeReach(object.point)||Math.hypot(object.point.x-playerRef.current.x,object.point.y-playerRef.current.y)>=2.1)return;
    const exit={...playerRef.current};clearInput();castRef.current=null;playerRef.current={...object.point};directionRef.current="down";
    setSeated({object:{id:object.value.key,title:"野餐垫",kind:"chair",x:object.point.x-.5,y:object.point.y-.5,width:1,height:1},exit});
  };
  const interactNature = useCallback(async()=>{
    if(transitionRef.current||selectedRef.current)return;
    const player=playerRef.current,cast=castRef.current;
    if(cast){
      if(cast.pending||!fishingReady(wildlifeRef.current,cast,performance.now()))return;
      cast.pending=true;
      try{
        const receipt=cast.owner
          ? await apiRequest<{id:string;first:boolean}>("/api/pixel-home/reel",{method:"POST",body:{owner:cast.owner,token:cast.token}})
          : null;
        const item=receipt?worldItems.get(receipt.id):guestCatch(cast.pond);
        if(cast.owner && getCachedCurrentUser()?.id!==cast.owner)return;
        if(cast.owner){setInventoryChange(value=>value+1);if(item)setHeldItem(old=>old?.row?.id===item.id?null:old);}
        if(!item||castRef.current!==cast)return;
        cast.sprite=item;cast.caughtAt=0;
        if(!mutedRef.current)worldAudioRef.current?.step("water",false);
        if(cast.owner)fishingNotice((receipt?.first?"首次发现 · ":"收入背包 · ")+item.name);
        else recordDiscovery(item.name,"钓到"+item.name+" · 访客发现");
        setFreshFish(true);
      }catch(error){
        if(castRef.current!==cast)return;
        if(error instanceof ApiError && error.status===409)castRef.current=null;
        fishingNotice(error instanceof Error?error.message:"收竿未确认，请重试");
      }finally{cast.pending=false;}
      return;
    }
    const animal=nearAnimal();
    if(heldItem&&animal&&heldItem.item.feeds?.includes(animal.species)){openAnimal(animal);return;}
    if(room){if(animal)openAnimal(animal);return;}
    const source=nearbySource();
    if(source){void collectSource(source);return;}
    const target=fishingTarget(player);
    if(target){
      const next=beginFishing(wildlifeRef.current,target,performance.now());
      if(!next)return;
      castRef.current=next;next.pending=true;
      directionRef.current=directionToward(player,target,directionRef.current);
      try{
        let owner:AuthUser|undefined;
        try {owner=await getCurrentUser();}
        catch(error){
          const guest=error instanceof ApiError && error.status===401;
          const offlineVisitor=error instanceof TypeError && !getCachedCurrentUser();
          if(!guest&&!offlineVisitor)throw error;
        }
        if(castRef.current!==next)return;
        if(owner){
          if(getCachedCurrentUser()?.id!==owner.id){castRef.current=null;return;}
          next.owner=owner.id;
          const data=await apiRequest<{token:string}>("/api/pixel-home/cast",{method:"POST",body:{owner:owner.id,pond:next.pond}});
          if(castRef.current!==next)return;
          next.token=data.token;
        }
        next.started=performance.now();fishingNotice(pondLabels[next.pond]+" · 已抛竿");
      }catch(error){
        if(castRef.current===next){castRef.current=null;fishingNotice(error instanceof Error?error.message:"抛竿失败");}
      }finally{next.pending=false;}
      return;
    }
    if(animal)openAnimal(animal);
  },[recordDiscovery,fishingNotice,nearAnimal,heldItem,openAnimal,collectSource,room]);

  const selectPlace = useCallback((place: Feature | null) => {
    if(place){
      castRef.current=null;
      if(!("href" in place)&&place.story&&Math.hypot(playerRef.current.x-place.x,playerRef.current.y-place.y)<2.8)
        recordDiscovery(place.story.title);
    }
    selectedRef.current = place;
    clearInput();
    setSelected(place);
  }, [recordDiscovery, clearInput]);

  const sit = (object:SeatObject) => {
    const placement=seatPlacement(room,object,playerRef.current);
    if(!placement)return false;
    clearInput();castRef.current=null;
    playerRef.current=placement.anchor;directionRef.current="down";
    if(room&&"kind" in object&&meetingSeat(room,object)){
      const table=room.objects.find(o=>o.community?.interaction==="meeting")!;
      directionRef.current=object.y>table.y?"up":"down";
    }
    setSeated({object,exit:placement.exit});
    if("sprite" in object&&object.story)recordDiscovery(object.story.title);
    return true;
  };
  const playSound = (name: "frog-laugh"|"poster-laugh"|"chime") => {
    if(muted||document.hidden)return;
    audioRef.current?.pause();
    const audio=new Audio(`/assets/pixel-jijia/${name}.wav`);
    audio.volume=.35;audioRef.current=audio;
    void audio.play().catch(()=>{});
  };
  // The existing animation frame owns both halves of the fade. Swap only
  // while fully covered, and keep it covered until the destination has rendered.
  const transitionTo = useCallback((target: string | null, swap: () => void) => {
    if (transitionRef.current||animalActionRef.current) return;
    setPublicPlants([]);setHeldItem(old=>old?.loan||old?.plant?null:old);
    clearInput();
    setMenuOpen(false);
    audioRef.current?.pause();effectsRef.current.clear();targetRef.current=null;setBaseState(freshBaseRoom());setFreshFish(false);
    castRef.current=null;
    if (!canvasRef.current?.dataset.scene || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      swap();
      return;
    }
    transitionRef.current = { target, phase: "out", started: null, swap };
  }, [clearInput]);

  const enterRoom = useCallback((placeId: string) => {
    const destination = ROOMS[placeId];
    if (!destination || closestPlace(playerRef.current)?.id !== placeId) return;
    transitionTo(placeId, () => {
      playerRef.current = { ...destination.entry };
      const canvas = canvasRef.current;
      if (canvas) cameraRef.current = cameraAt(destination.entry, canvas.clientWidth / zoomRef.current, canvas.clientHeight / zoomRef.current,
        destination.width * TILE, destination.height * TILE);
      setSeated(null);
      setRoomId(placeId);
      setSelectedRoom(null);
      setMapOpen(false);
      selectedRef.current = null;
      setSelected(null);
      });
  }, [transitionTo]);

  const openStudy = useCallback(async (invitation?: string) => {
    setStudyNotice("");
    let access:typeof studyAccessRef.current=null;
    try {
      if (!invitation) {
        const user=await getCurrentUser();
        if(getCachedCurrentUser()?.id!==user.id)return;
        studyAccessRef.current?.controller.abort();
        access={ownerId:user.id,controller:new AbortController()};
        studyAccessRef.current=access;
      }
      const data = await apiRequest<{
        furniture: StudyFurniture[]; inviteActive?: boolean; achievements:Achievement[]; plants:PlantRecord[];
      }>(invitation ? `/api/pixel-home/visit?token=${encodeURIComponent(invitation)}`
        : "/api/pixel-home/me", { cache: "no-store",signal:access?.controller.signal });
      if(access?.controller.signal.aborted)return;
      transitionTo("study", () => {
        if(access?.controller.signal.aborted)return;
        setStudyItems(data.furniture);setStudyPlants(data.plants??[]);setStudyAchievements(data.achievements??[]);setStudyEditing(false);
        setStudyHasInvite(Boolean(data.inviteActive));
        setStudyGuest(Boolean(invitation));
        setStudyInvite("");
        playerRef.current = { ...STUDY_ROOM.entry };
        const canvas = canvasRef.current;
        if (canvas) cameraRef.current = cameraAt(STUDY_ROOM.entry, canvas.clientWidth / zoomRef.current, canvas.clientHeight / zoomRef.current,
          STUDY_ROOM.width * TILE, STUDY_ROOM.height * TILE);
        clearInput();
        setRoomId("study");
        setSelectedRoom(null);
      setSeated(null);
        setMapOpen(false);
        selectPlace(null);
      });
    } catch (error) {
      if(access?.controller.signal.aborted)return;
      if(studyAccessRef.current===access)studyAccessRef.current=null;
      setStudyNotice(error instanceof Error ? error.message : "研究室无法打开");
    }
  }, [selectPlace, transitionTo, clearInput]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("visit");
    if (token) void openStudy(token);
  }, [openStudy]);

  const saveStudy = async (invite=false) => {
    const access=studyAccessRef.current;
    if (!access||studyGuest||studySaving||getCachedCurrentUser()?.id!==access.ownerId) return;
    const signal=access.controller.signal;
    setStudySaving(true);setStudyNotice("");
    try {
      await apiRequest("/api/pixel-home/me", {
        method:"PUT",body:{furniture:studyItems},signal,
      });
      if(signal.aborted)return;
      if(invite){
        const result=await apiRequest<{token:string}>("/api/pixel-home/invite",{method:"POST",signal});
        if(signal.aborted)return;
        setStudyInvite(`${window.location.origin}/pixel-jijia?visit=${result.token}`);
        setStudyHasInvite(true);
      }
      setStudyNotice(invite?"邀请已生成，可复制链接发给访客":"布局已保存");
    } catch(error){
      if(!signal.aborted)setStudyNotice(error instanceof Error?error.message:invite?"邀请生成失败":"保存失败");
    } finally {
      if(!signal.aborted)setStudySaving(false);
    }
  };
  const toggleStudyAchievement=async(item:Achievement)=>{
    const access=studyAccessRef.current;
    if(!access||studyGuest||studySaving||getCachedCurrentUser()?.id!==access.ownerId)return;
    const signal=access.controller.signal;
    setStudySaving(true);setStudyNotice("");
    try{
      const rows=await apiRequest<Achievement[]>("/api/pixel-home/achievements/display",{method:"PUT",body:{id:item.id,displayed:!item.displayed},signal});
      if(!signal.aborted)setStudyAchievements(rows);
    }catch(error){if(!signal.aborted)setStudyNotice(error instanceof Error?error.message:"展示保存失败");}
    finally{if(!signal.aborted)setStudySaving(false);}
  };
  const revokeStudyInvite = async () => {
    const access=studyAccessRef.current;
    if(!access||studyGuest||studySaving||getCachedCurrentUser()?.id!==access.ownerId)return;
    const signal=access.controller.signal;
    setStudySaving(true);
    try {
      await apiRequest("/api/pixel-home/invite",{method:"DELETE",signal});
      if(signal.aborted)return;
      setStudyInvite("");setStudyHasInvite(false);setStudyNotice("旧邀请链接已失效");
    } catch(error){
      if(!signal.aborted)setStudyNotice(error instanceof Error?error.message:"撤销失败");
    } finally {
      if(!signal.aborted)setStudySaving(false);
    }
  };

  const exitRoom = useCallback(() => {
    if (!roomId) return;
    transitionTo(null, () => {
      if (roomId === "study") {
        playerRef.current = { ...SPAWN };
        const canvas = canvasRef.current;
        if (canvas) cameraRef.current = cameraAt(SPAWN, canvas.clientWidth / zoomRef.current, canvas.clientHeight / zoomRef.current);
        setRoomId(null);
        setSelectedRoom(null);
      setSeated(null);
        resetStudy();
        if (window.location.search.includes("visit=")) window.history.replaceState(null, "", "/pixel-jijia");
        return;
      }
      const place = PLACES.find(p => p.id === roomId);
      if (!place) return;
      playerRef.current = { x: place.x + place.width / 2, y: place.y + place.height + 1.2 };
      const canvas = canvasRef.current;
      if (canvas) cameraRef.current = cameraAt(playerRef.current, canvas.clientWidth / zoomRef.current, canvas.clientHeight / zoomRef.current);
      setSelectedRoom(null);
      setSeated(null);
      setRoomId(null);
    });
  }, [roomId, transitionTo, resetStudy]);

  const resizeCanvas = useCallback(() => {
    const stage = stageRef.current, canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const value = clampZoom(zoomRef.current, stage.clientWidth, stage.clientHeight);
    if (value !== zoomRef.current) {
      zoomRef.current = value;
      setZoom(value);
    }
    // A touch viewport should not show large empty bands around a small interior.
    // Keep the outdoor zoom preference unchanged when entering or rotating a room.
    const effective = mobile && room ? Math.max(value, stage.clientWidth / (room.width*TILE), stage.clientHeight / (room.height*TILE)) : value;
    const width = Math.max(1, Math.round(stage.clientWidth / effective));
    const height = Math.max(1, Math.round(stage.clientHeight / effective));
    if (canvas.width === width * roomScale && canvas.height === height * roomScale) return;
    canvas.width = width * roomScale;
    canvas.height = height * roomScale;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.imageSmoothingEnabled = false;
    cameraRef.current = cameraAt(controlledRobot??playerRef.current, width, height,
      (room?.width ?? WORLD_WIDTH) * TILE, (room?.height ?? WORLD_HEIGHT) * TILE);
  }, [room, roomScale, mobile,controlledRobot]);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse), (max-width: 700px)");
    const update = () => {
      clearInput();
      setMobile(query.matches);
      if (query.matches && zoomRef.current === DEFAULT_ZOOM) {
        zoomRef.current = 1;
        setZoom(1);
      }
    };
    update();
    query.addEventListener("change", update);
    window.addEventListener("orientationchange", clearInput);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("orientationchange", clearInput);
    };
  }, [clearInput]);

  const setMapZoom = useCallback((next: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const value = clampZoom(next, stage.clientWidth, stage.clientHeight);
    if (value === zoomRef.current) return;
    zoomRef.current = value;
    setZoom(value);
    resizeCanvas();
  }, [resizeCanvas]);

  const toggleRobot=useCallback((requested?:CampusRobot)=>{
    if(room||transitionRef.current)return false;
    if(controlledRobot){
      clearInput();trainingRef.current=null;setTrainingPhase(null);releaseCampusRobot(controlledRobot);setControlledRobot(null);
      setMapZoom(pilotZoomRef.current);return true;
    }
    if(seated||castRef.current||selectedRef.current||selectedRoom||catalogueDetail||
        !robotAtlasesRef.current.size)return false;
    const target=requested??nearestRobot(robots,playerRef.current);
    if(!target||!robotInReach(target,playerRef.current))return false;
    if(target.model.capability==="display"){startRobotDemo(target);return true;}
    clearInput();pilotZoomRef.current=zoomRef.current;setControlledRobot(target);
    setMapZoom(Math.max(mobile&&stageRef.current&&stageRef.current.clientHeight>stageRef.current.clientWidth?1.65:2.6,zoomRef.current));return true;
  },[room,controlledRobot,robots,seated,selectedRoom,catalogueDetail,clearInput,setMapZoom,mobile]);
  useEffect(() => {
    let active = true;
    const atlas = new Image();
    const robotAssets=[...Object.values(ROBOT_MODELS),{id:"dart-body",...DART_BODY,wheelFrames:1,upper:false}];
    const robotImages=robotAssets.map(()=>new Image());
    const character = new Image();
    const groundTiles = new Image();
    const props = new Image();
    const roomProps=new Image();
    const communityProps=new Image();
    const loadImage = (image: HTMLImageElement, source: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("像素图片加载失败"));
        image.src = source;
      });
    Promise.all([
      loadImage(atlas, "/assets/pixel-jijia/campus-buildings-v3.png"),
      loadImage(character, "/assets/pixel-jijia/explorer-actions-v3.png"),
      loadImage(groundTiles, groundTilesUrl),
      loadImage(props, plazaPropsUrl),
      loadImage(roomProps,roomPropsUrl),
      loadImage(communityProps,communityPropsUrl),
      Promise.all(robotAssets.map((asset,i)=>loadImage(robotImages[i],asset.atlas))),
      fetch("/assets/pixel-jijia/campus-buildings-v3.json")
        .then((response) => {
          if (!response.ok) throw new Error("像素素材索引加载失败");
          return response.json() as Promise<{ sprites: SpriteIndex }>;
        }),
    ])
      .then(([image, explorer, ground, environment, furniture, communityFurniture, loadedRobots, metadata]) => {
        if (!active) return;
        if (ground.naturalWidth !== 384 || ground.naturalHeight !== 1376) {
          throw new Error("地面图集与场景版本不匹配");
        }
        if (environment.naturalWidth !== 512 || environment.naturalHeight !== 640) {
          throw new Error("场景美术素材与当前版本不匹配");
        }
        robotAtlasesRef.current=new Map(robotAssets.map((asset,i)=>{
          const img=loadedRobots[i];
          if(img.naturalWidth!==asset.width*asset.nativeScale*8||img.naturalHeight!==asset.height*asset.nativeScale*(asset.wheelFrames+Number(asset.upper)))throw new Error("机器人图集与当前版本不匹配");
          return [asset.id,img];
        }));
        characterRef.current = explorer;
        artRef.current = image;
        artIndexRef.current = metadata.sprites;
        propsRef.current = environment;
        wildlifeRef.current = [...createWildlife(),...createCampusPets()];
        groundTilesRef.current = ground;
        const season=changchunClimate(new Date()).season;
        terrainRef.current = renderTerrain(ground, season);
        previewRef.current = renderWorldPreview(terrainRef.current, image, metadata.sprites, environment,season);
        preparePublicRoomArt(furniture,Object.values(ROOMS),roomSprites,communityFurniture,communitySprites);
        roomTerrainRef.current = Object.fromEntries(Object.values(ROOMS).map(scene => [scene.id, renderRoomTerrain(scene, ground)]));
        setAssetState("ready");
      })
      .catch(() => { if (active) setAssetState("error"); });
    return () => {
      active = false;
      atlas.onload = null;
      atlas.onerror = null;
      for(const image of robotImages){image.onload=null;image.onerror=null;}
      character.onload = null;
      character.onerror = null;
      groundTiles.onload = null;
      groundTiles.onerror = null;
      props.onload = null;
      props.onerror = null;
      roomProps.onload=null;roomProps.onerror=null;
      communityProps.onload=null;communityProps.onerror=null;
    };
  }, []);

  useEffect(() => {
    if (!climate || !groundTilesRef.current ||
        !artRef.current || !artIndexRef.current || !propsRef.current) return;
    terrainRef.current = renderTerrain(groundTilesRef.current, climate.season);
    previewRef.current = renderWorldPreview(terrainRef.current, artRef.current,
      artIndexRef.current, propsRef.current,climate.season);
  }, [climate?.season]);

  useEffect(() => {
    if (selected || selectedRoom || catalogueDetail) {
      const dialog=dialogRef.current;
      (dialog?.querySelector<HTMLElement>("[data-drive], .pixel-community-controls button:not(:disabled)") ?? dialog?.querySelector<HTMLElement>(".pixel-world-detail-close"))?.focus();
    } else canvasRef.current?.focus({preventScroll:true});
  }, [selected, selectedRoom, catalogueDetail]);

  const distanceNotice = useCallback(() => {
    setNatureNotice("再靠近一点");
    noticeUntilRef.current = performance.now() + 1800;
  }, []);
  const interactRoom = useCallback((object: RoomObject) => {
    if (!room || transitionRef.current || !room.objects.includes(object) || !roomInteractable(room,object)) return;
    if (roomInteractionDistance(room, object, playerRef.current) >= 2.1) { distanceNotice(); return; }
    if (seated) { standUp(); return; }
    if (object.kind === "exit") { exitRoom(); return; }
    if (object.kind === "chair") {
      const meeting=room.objects.find(o=>o.community?.interaction==="meeting");
      if(meeting&&meetingSeat(room,object))object=meeting;
      else {if(!sit(object))distanceNotice();return;}
    }
    directionRef.current=directionToward(playerRef.current,{x:object.x+object.width/2,y:object.y+object.height/2},directionRef.current);
    poseRef.current={...poseRef.current,action:"idle",frame:0,since:performance.now()};
    const now=performance.now();
    const action=baseAction(room.id,object.id);
    if(room.id==="mechanical"&&object.kind==="workbench"&&heldItem?.row&&["wrench","wheel"].includes(heldItem.item.id)){combineItem("workbench");return;}
    if(action==="power"){
      const hour=(climateRef.current?.hour??12)+(climateRef.current?.minute??0)/60;
      const automatic=equipmentProgress(roomSpriteKey(object),now,effectsRef.current.get(object.id),hour)>=0;
      setBaseState(old=>togglePower(old,object.id,automatic));effectsRef.current.set(object.id,now);return;
    }
    if(action==="take"){
      if(baseState.item==="source"){restoreHeld();}
      setBaseState(old=>transferItem(old,old.item==="source"?"held":"source"));return;
    }
    const device=action==="communication"?"oscilloscope":action==="vision"?"camera":action==="planning"?"models":null;
    if(device&&baseState.power[device]===undefined){
      const hour=(climateRef.current?.hour??12)+(climateRef.current?.minute??0)/60;
      const powered=equipmentProgress(device,now,effectsRef.current.get(device),hour)>=0;
      setBaseState(old=>({...old,power:{...old.power,[device]:powered}}));
    }
    if(action==="assembly"&&baseState.item==="held")setBaseState(old=>transferItem(old,"placed"));
    if(action==="drink"&&!baseState.drank){
      setBaseState(old=>({...old,drank:true}));effectsRef.current.set(object.id,now);
      poseRef.current={...poseRef.current,action:"observe",since:now};return;
    }
    if(action==="water"){
      setBaseState(old=>old.watered.includes(object.id)?old:{...old,watered:[...old.watered,object.id]});
      effectsRef.current.set(object.id,now);poseRef.current={...poseRef.current,action:"observe",since:now};return;
    }
    if(hasEquipmentBehavior(object.id)&&equipmentProgress(object.id,now,effectsRef.current.get(object.id),(climateRef.current?.hour??12)+(climateRef.current?.minute??0)/60)<0)
      effectsRef.current.set(object.id,now);
    if (object.community) {
      const action=object.community.interaction;
      if(action==="meeting"){
        const chair=meetingChair(room,playerRef.current);
        if(!chair || !sit(chair)){distanceNotice();return;}
      }
      discover(object);
      if(!action || ["smoke","burst","glow","cable","old-capacitor","laugh","poster-laugh","tools"].includes(action)){
        if((action==="laugh"||action==="poster-laugh")&&performance.now()-(effectsRef.current.get(object.id)??-Infinity)<1500)return;
        effectsRef.current.set(object.id,performance.now());
        if(action==="laugh"||action==="poster-laugh")playSound(action==="laugh"?"frog-laugh":"poster-laugh");

        return;
      }
    }
    selectRoomObject(object);
  }, [room, exitRoom, selectRoomObject, distanceNotice, seated, standUp, discoveries, muted,baseState,heldItem,animalBusy]);
  const interactFeature = useCallback((feature: Feature) => {
    if (room || transitionRef.current || waterDepthAt(playerRef.current.x, playerRef.current.y)) return;
    if ("href" in feature) {
      if (!nearDoor(feature,playerRef.current)) { distanceNotice(); return; }
      if (ROOMS[feature.id]) enterRoom(feature.id);
      else selectPlace(feature);
    } else {
      const radius = feature.sprite === "bench" ? 2.5 : 2.8;
      if (Math.hypot(playerRef.current.x-feature.x,playerRef.current.y-feature.y) >= radius) { distanceNotice(); return; }
      if(seated){standUp();return;}
      if(feature.sprite==="bench"){if(!sit(feature))distanceNotice();return;}
      if(feature.story){
        const now=performance.now();
        directionRef.current=directionToward(playerRef.current,feature,directionRef.current);
        poseRef.current={...poseRef.current,action:"idle",frame:0,since:now};
        if(feature.story.action&&now-(effectsRef.current.get(feature.story.title)??-Infinity)<1500)return;
        effectsRef.current.set(feature.story.title,now);
        if(feature.sprite==="arch")playSound("chime");
        if(feature.sprite==="cherry")poseRef.current={...poseRef.current,action:"observe",since:now};
        recordDiscovery(feature.story.title,feature.sprite==="statue"&&feature.story.action?"自检通过":feature.sprite==="sign"&&feature.story.action?feature.story.result:feature.story.title);
        if(feature.story.title==="机器人试验场")selectPlace(feature);
      }
    }
  }, [room, enterRoom, selectPlace, distanceNotice, seated, standUp, recordDiscovery, clearInput, muted]);
  useEffect(() => {
    if (menuOpen || mapOpen || selectedRoom || selected || catalogueDetail || animalMenu) clearInput();
  }, [menuOpen, mapOpen, selectedRoom, selected, catalogueDetail, animalMenu, clearInput]);
  useEffect(()=>{setAnimalMenu(null);},[roomId,robotControlled,mapOpen,menuOpen]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable=true]")) return;
      if (transitionRef.current) return;
      if (event.key === "Escape") {
        if(animalMenu){if(!animalBusy)setAnimalMenu(null);return;}
        if (catalogueDetail) setCatalogueDetail(null);
        else if (selectedRoom) selectRoomObject(null);
        else if(castRef.current)castRef.current=null;
        else if (selectedRef.current) selectPlace(null);
        else if(mapOpen)setMapOpen(false);else if(menuOpen)setMenuOpen(false);else if(showHelp)setShowHelp(false);else if(robotControlled)toggleRobot();
        return;
      }
      if (selectedRoom || selectedRef.current || catalogueDetail) {
        const dialog=dialogRef.current;
        if(!dialog)return;
        const controls=[...dialog.querySelectorAll<HTMLElement>(".pixel-community-controls button:not(:disabled), .pixel-community-action:not(:disabled), .pixel-world-detail-link")];
        const current=controls.indexOf(document.activeElement as HTMLElement);
        if(event.key.toLowerCase()==="e"&&!event.repeat){
          event.preventDefault();
          if(current>=0)controls[current].click();
          else if(selectedRoom?.community?.interaction==="drive")dialog.querySelector<HTMLButtonElement>("[data-drive-turn]")?.click();
          else controls.find(c=>c.tagName==="BUTTON")?.click();
        }
        else if(event.key.startsWith("Arrow")&&selectedRoom?.community?.interaction!=="drive"){
          event.preventDefault();
          if(selectedRoom?.community?.interaction==="memoir"&&(event.key==="ArrowLeft"||event.key==="ArrowRight")){
            dialog.querySelector<HTMLButtonElement>(event.key==="ArrowLeft"?"[data-page=previous]":"[data-page=next]")?.click();
          }else if(controls.length)controls[current<0?(event.key==="ArrowLeft"||event.key==="ArrowUp"?controls.length-1:0):(current+(event.key==="ArrowLeft"||event.key==="ArrowUp"?-1:1)+controls.length)%controls.length]?.focus();
        }
        return;
      }
      if (menuOpen || mapOpen) {
        if(event.key.toLowerCase()==="m"&&!event.repeat){event.preventDefault();setMapOpen(false);return;}
        const panel=document.querySelector(menuOpen?".pixel-world-top-actions":"#pixel-world-map-panel");
        const controls=[...(panel?.querySelectorAll<HTMLElement>("button:not(:disabled),summary,a")??[])].filter(e=>e.getClientRects().length);
        const index=controls.indexOf(document.activeElement as HTMLElement);
        if(event.key.toLowerCase()==="e"&&!event.repeat){event.preventDefault();if(index>=0)controls[index].click();else controls[0]?.focus();}
        else if(event.key.startsWith("Arrow")&&controls.length){event.preventDefault();controls[index<0?0:(index+(event.key==="ArrowLeft"||event.key==="ArrowUp"?-1:1)+controls.length)%controls.length].focus();}
        return;
      }
      if(animalMenu)return;
      if (event.key === "Shift") {
        if (!selectedRef.current) sprintKeyRef.current = true;
        return;
      }
      if (event.key.toLowerCase() === "m") {
        event.preventDefault(); setMapOpen(open => !open);
        return;
      }
      if (event.key.toLowerCase() === "e") {
        if (event.repeat) return;
        if (seated) {event.preventDefault();standUp();return;}
        if(!room&&toggleRobot()){event.preventDefault();return;}
        if(!castRef.current&&interactLife()){event.preventDefault();return;}
        if (room) {
          if(studyEditing)return;
          const object = targetRef.current as RoomObject | null;
          if (object) {
            event.preventDefault();
            interactRoom(object);
          }else if(placeHeld(aheadPoint())){event.preventDefault();}
          else if(nearAnimal()){event.preventDefault();void interactNature();}
          return;
        }
        const place = targetRef.current as Feature | null;
        const animal=nearAnimal();
        if(castRef.current||animal&&heldItem?.item.feeds?.includes(animal.species)){event.preventDefault();interactNature();}
        else if(!place&&placeHeld(aheadPoint())){event.preventDefault();}
        else if(nearbySource()){event.preventDefault();interactNature();}
        else if(place){event.preventDefault();interactFeature(place);}
        else if(fishingTarget(playerRef.current)||animal){event.preventDefault();interactNature();}
        return;
      }
      const dir = KEY_DIRECTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!dir || selectedRef.current || selectedRoom) return;
      event.preventDefault();
      if (seated) standUp();
      keysRef.current.add(dir);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Shift") sprintKeyRef.current = false;
      const dir = KEY_DIRECTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (dir) keysRef.current.delete(dir);
    };
    const stop = () => {
      clearInput();audioRef.current?.pause();worldAudioRef.current?.silence();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", stop);
    const hide = () => { if (document.visibilityState !== "visible") stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [selectPlace, selectRoomObject, seated, standUp, room, selectedRoom, interactRoom, interactFeature, interactNature, clearInput, menuOpen, mobile, mapOpen, catalogueDetail, studyEditing, robotControlled,toggleRobot,nearAnimal,animalMenu,animalBusy,heldItem,sceneLife,studyGuest,baseState]);

  useEffect(() => {
    if (assetState !== "ready") return;
    const stage = stageRef.current, canvas = canvasRef.current;
    const minimap = miniRef.current, terrain = terrainRef.current, preview = previewRef.current;
    const roomTerrain = room ? roomTerrainRef.current[room.id] : null;
    const character = characterRef.current;
    const atlas = artRef.current, sprites = artIndexRef.current, props = propsRef.current;
    if (!stage || !canvas || !terrain || !preview || !character || !atlas || !sprites || !props || (room && !roomTerrain)) return;
    const ctx = canvas.getContext("2d");
    const miniCtx = minimap?.getContext("2d");
    if (!ctx) return;
    let frame = 0, lastTime = 0, traveled = 0, lastMini = 0;
    let stepDistance=0,lastAudio=0,lastFountain=0,lastPetal=0,lastWeather=0;
    const particles: PixelParticle[] = [];
    const leafTrees = SCENERY.filter(item => item.sprite === "cherry" || item.sprite === "oak" || item.sprite === "lime_tree");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const emit = (particle: PixelParticle) => { if (particles.length < 72) particles.push(particle); };

    resizeCanvas();
    let viewportWidth = stage.clientWidth, viewportHeight = stage.clientHeight;
    const observer = new ResizeObserver(() => {
      if (stage.clientWidth !== viewportWidth || stage.clientHeight !== viewportHeight) {
        viewportWidth = stage.clientWidth; viewportHeight = stage.clientHeight;
        clearInput();
      }
      resizeCanvas();
    });
    observer.observe(stage);
    // Wheel/trackpad zoom keeps sub-step deltas until a visible 1% change is possible.
    let wheelDelta = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      wheelDelta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
      const next = clampZoom(zoomRef.current * Math.exp(-wheelDelta * 0.0015), stage.clientWidth, stage.clientHeight);
      if (next !== zoomRef.current) {
        wheelDelta = 0;
        setMapZoom(next);
      } else if (Math.abs(wheelDelta) > 120) {
        wheelDelta = 0;
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const tick = (time: number) => {
      const climate = climateRef.current;
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      const wind = windRef.current = reducedMotion.matches ? 0 : advanceWind(windRef.current,climate?.weather??null,time,dt);
      lastTime = time;
      surfaceRef.current=advanceSurface(surfaceRef.current,climate?.weather??null,climate?.temperature??null,dt);
      const held = (dir: Direction) => Number(keysRef.current.has(dir));
      const touch = joystick.current;
      const x = touch ? touch.x : held("right") - held("left");
      const y = touch ? touch.y : held("down") - held("up");
      let walking = false,stepped=false;
      const sprinting = touch ? touch.running : sprintKeyRef.current;

      const previous = playerRef.current;
      const canMove=!transitionRef.current&&!selectedRef.current&&!selectedRoom&&!seated&&!menuOpen&&!mapOpen&&!catalogueDetail&&!animalMenu;
      if(!room){
        const previousPhase=trainingRef.current?.phase??null;
        const participants=trainingRef.current?[...robots,trainingRef.current.opponent]:robots;
        for(const robot of robots){
          const controlled=robot===controlledRobot;
          const moving=controlled&&canMove&&trainingRef.current?.phase!=="lost";
          tickCampusRobot(robot,previous,dt,controlled,moving?x:0,moving?y:0,!reducedMotion.matches,participants);
        }
        if(controlledRobot?.model.capability==="training"&&inTrainingField(controlledRobot,controlledRobot.model.radius)){
          if(!trainingRef.current)trainingRef.current=createTraining(controlledRobot,previous,robots);
          if(trainingRef.current&&canMove)tickTraining(trainingRef.current,controlledRobot,previous,dt,!reducedMotion.matches,robots);
        }else trainingRef.current=null;
        const phase=trainingRef.current?.phase??null;
        if(phase!==previousPhase)setTrainingPhase(phase);
      }
      if (!robotControlled && !transitionRef.current && (x !== 0 || y !== 0) && !selectedRef.current && !selectedRoom && !seated && !menuOpen && !mapOpen && !catalogueDetail && !animalMenu) {
        const next = movePlayer(previous, x, y, dt, sprinting,
          (px, py) => !lifeBlocks(sceneLife, px, py) && (room ? isRoomWalkable(room, px, py) : !robots.some(robot=>robotBlocksPlayer(robot,px,py)) && isWalkable(px,py)),!room);
        const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
        playerRef.current = next;
        directionRef.current = Math.abs(x) >= Math.abs(y) ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up");
        walking = distance > 0.0001;
        if (walking) {
          traveled += distance;castRef.current=null;stepDistance+=distance;
          const stride=sprinting?2.35:1.9;
          if(stepDistance>=stride){stepDistance-=stride;stepped=true;}
        }
        // The door is a spatial threshold: walking into it changes scenes directly.
        // The room entry is placed behind its exit, so holding a direction is safe.
        const door = room ? null : outdoorDoorAt(next, y);
        if (room ? roomExitAt(room, next, y) : Boolean(door)) {
          if (room) exitRoom();
          else if (door) enterRoom(door.id);
          // Reduced motion swaps directly; the next effect renders the destination.
          if (!transitionRef.current) {
            frame = requestAnimationFrame(tick);
            return;
          }
        }
      }
      if(!walking)stepDistance=0;
      const foot=controlledRobot??playerRef.current,audio=worldAudioRef.current;
      const material=stepped?footstepMaterial(room?.id??null,groundAt(foot.x,foot.y),surfaceRef.current.wet,surfaceRef.current.snow):null;
      if(audio?.running&&!mutedRef.current&&!document.hidden){
        if(material)audio.step(material,sprinting);
        if(time-lastAudio>=120){
          lastAudio=time;
          let kind:LocalSound="none",volume=0;
          if(room){
            for(const o of room.objects){
              if(equipmentProgress(roomSpriteKey(o),time,effectsRef.current.get(o.id),(climate?.hour??12)+(climate?.minute??0)/60,baseState.power[o.id])<0)continue;
              const gain=distanceVolume(Math.hypot(foot.x-o.x-o.width/2,foot.y-o.y-o.height),9)*.095;
              if(gain>volume){volume=gain;kind="device";}
            }
          }else{
            if((climate?.temperature??0)>0){
              volume=distanceVolume(Math.hypot(foot.x-FOUNTAIN.x,foot.y-FOUNTAIN.y),17)*.12;
              if(volume>0)kind="fountain";
            }
            for(const motor of robots){
              if(!motor.model.speed&&!motor.demo)continue;
              const hum=distanceVolume(Math.hypot(foot.x-motor.x,foot.y-motor.y),10)*(motor.moving?.065:.022);
              if(hum>volume){volume=hum;kind="device";}
            }
            for(const o of leafTrees){
              const gain=distanceVolume(Math.hypot(foot.x-o.x,foot.y-o.y),8)*(.028+Math.abs(wind)*.003);
              if(gain>volume){volume=gain;kind="trees";}
            }
          }
          audio.update(climate?.weather??null,Boolean(room),wind,kind,volume);
        }
      }
      const viewWidth = canvas.width / roomScale, viewHeight = canvas.height / roomScale;
      const target = cameraAt(controlledRobot??playerRef.current, viewWidth, viewHeight,
        (room?.width ?? WORLD_WIDTH) * TILE, (room?.height ?? WORLD_HEIGHT) * TILE);
      const follow = reducedMotion.matches?1:1 - Math.exp(-(sprinting ? 8 : 6) * dt);
      cameraRef.current.x += (target.x - cameraRef.current.x) * follow;
      cameraRef.current.y += (target.y - cameraRef.current.y) * follow;

      // Begin reeling on the first rendered frame, not on the input event.
      // This preserves the full sequence even after a slow frame or React update.
      if(castRef.current?.caughtAt===0)castRef.current.caughtAt=time;
      if(castRef.current?.caughtAt!==undefined&&time-castRef.current.caughtAt>1050)castRef.current=null;
      const castNow=castRef.current;
      const readyNow=Boolean(castNow&&fishingReady(wildlifeRef.current,castNow,time));
      const pose=poseRef.current=explorerAnimation(poseRef.current,{
        direction:directionRef.current,moving:walking,sprinting,distance:traveled,
        water:room?0:waterDepthAt(playerRef.current.x,playerRef.current.y),seated:Boolean(seated),
        fishing:fishingPose(castNow,readyNow,time),now:time,motion:!reducedMotion.matches,
        idleAllowed:!x&&!y&&!selectedRef.current&&!selectedRoom&&!menuOpen&&!mapOpen&&!catalogueDetail&&!transitionRef.current,
      });
      if(!castNow&&!controlledRobot&&(!room||baseState.item!=="held"))pose.held=heldItem?.plant?plantCarrySprite(heldItem.plant):heldItem?.item;
      ctx.setTransform(roomScale, 0, 0, roomScale, 0, 0);
      ctx.clearRect(0, 0, viewWidth, viewHeight);
      ctx.imageSmoothingEnabled = false;
      const companion=companionRef.current;
      const activeCompanion=pet&&companion&&!studyGuest&&(pet.mode==="follow"||room?.id==="study")&&
        updateCompanion(companion,playerRef.current,dt,room?.id??"campus",animalWalkable,Boolean(controlledRobot),pet.mode==="home",walking,!castRef.current)?companion:null;
      if (room && roomTerrain) {
        trailRef.current.length = 0;
        renderRoomScene(ctx, roomTerrain, room, character, playerRef.current,
          pose, cameraRef.current,
          time, !reducedMotion.matches, climate, seated?seatDepth(seated.object):playerRef.current.y, effectsRef.current,baseState,studyAchievements,robotAtlasesRef.current.get("guodong"),activeCompanion,sceneLife);
      } else {
        advanceSurfaceTrail(trailRef.current, previous, playerRef.current, dt, surfaceRef.current, !reducedMotion.matches);
        const wild=wildlifeRef.current.filter(a=>!pet||a.variant!==pet.variant||a.species!==pet.species);
        updateWildlife(wild,playerRef.current,dt,(climate?.hour??12)+(climate?.minute??0)/60,climate?.weather??null,!reducedMotion.matches,castRef.current,walking);
        renderScene(ctx, terrain, atlas, sprites, props, character,
          playerRef.current, pose, cameraRef.current,
          climate,activeCompanion?[...wild,activeCompanion]:wild,castRef.current,time,!reducedMotion.matches,surfaceRef.current,trailRef.current,seated?seatDepth(seated.object):playerRef.current.y,effectsRef.current,wind,robots,robotAtlasesRef.current,controlledRobot,trainingRef.current,availableSources(climate?.season??"summer",gatheredSources.current,Date.now()),sceneLife);
      }

      if (reducedMotion.matches || room) {
        particles.length = 0;
      } else {
        if (stepped&&material&&material!=="water"&&material!=="wet"&&material!=="snow"&&(sprinting||material==="grass"||material==="soil")) {
          emit({x:foot.x*TILE+(Math.random()-.5)*8,y:foot.y*TILE-2,vx:(Math.random()-.5)*12,vy:-6,
            age:0,ttl:.32,color:material==="grass"?"#c4d69c":material==="wood"?"#c3a47d":"#e5d9bd",size:sprinting?2:1});
        }
        if ((climate?.temperature ?? 0) > 0 && time - lastFountain > 220 &&
            Math.hypot(playerRef.current.x - FOUNTAIN.x, playerRef.current.y - FOUNTAIN.y) < 19) {
          emit({ x: FOUNTAIN.x * TILE + (Math.random() - 0.5) * 32,
            y: (FOUNTAIN.y - 2.8) * TILE, vx: (Math.random() - 0.5) * 14,
            vy: -14, age: 0, ttl: 0.58, color: "#a8effa", size: 2 });
          lastFountain = time;
        }
        if ((climate?.season === "spring" || climate?.season === "autumn") &&
            climate.weather !== "rain" && climate.weather !== "storm" && climate.weather !== "snow" &&
            time - lastPetal > (climate.season==="spring"?560:840)/(1+Math.abs(wind)*.035)) {
          lastPetal = time;
          const autumn=climate.season==="autumn";
          const trees=leafTrees.filter(item=>(autumn||item.sprite==="cherry")&&
            item.x*TILE>=cameraRef.current.x-32&&item.x*TILE<=cameraRef.current.x+viewWidth+32&&
            item.y*TILE-item.height>=cameraRef.current.y-32&&item.y*TILE-item.height<=cameraRef.current.y+viewHeight);
          const tree=trees[Math.floor(Math.random()*trees.length)];
          if (tree) {
            emit({ x: tree.x*TILE+(Math.random()-.5)*tree.width*.6,
              y: tree.y*TILE-tree.height*(.55+Math.random()*.35), vx:(Math.random()-.5)*7, vy:8+Math.random()*8,
              age:0, ttl:2+Math.random()*2, color:autumn?(Math.random()<.5?"#c28c46":"#dfb761"):"#f7b6ce",size:2,wind:1 });
          }
        }
        if (climate && (climate.weather === "rain" || climate.weather === "storm" || climate.weather === "snow") &&
            time - lastWeather > (climate.weather === "snow" ? 150 : climate.weather === "storm" ? 38 : 65)) {
          const snow = climate.weather === "snow";
          emit({ x: cameraRef.current.x + Math.random() * viewWidth,
            y: cameraRef.current.y + Math.random() * viewHeight - 24, vx: (Math.random()-.5)*(snow?12:7),
            vy: snow ? 16+Math.random()*20 : 120+Math.random()*55, age: 0, ttl: snow ? 3+Math.random()*2 : 1.4,
            color: snow ? "#f4f7ed" : "#a3d3e0", size: snow ? (Math.random()<.35?1:2) : 1, height: snow ? undefined : 6+Math.floor(Math.random()*5),rain:!snow,wind:snow?1.1:.9 });
          lastWeather = time;
        }
        for (let index = particles.length - 1; index >= 0; index--) {
          const particle = particles[index];
          particle.age += dt;
          particle.x += (particle.vx+wind*(particle.wind??0))*dt;
          particle.y += particle.vy * dt;
          if (particle.age >= particle.ttl) particles.splice(index, 1);
        }
        renderParticles(ctx, particles, cameraRef.current);
      }
      canvas.dataset.particles = String(particles.length);
      canvas.dataset.scene = room?.id ?? "outdoor";
      canvas.dataset.waterDepth = String(room ? 0 : waterDepthAt(playerRef.current.x,playerRef.current.y));
      canvas.dataset.wetness=surfaceRef.current.wet.toFixed(2);
      canvas.dataset.snow=surfaceRef.current.snow.toFixed(2);

      const nearRobot=!room&&!seated?(controlledRobot??(!castRef.current?nearestRobot(robots,playerRef.current):null)):null;
      const nextNearby = seated || room || nearRobot ? null : closestFeature(playerRef.current, directionRef.current, targetRef.current as Feature|null);
      const cast=castRef.current;
      const ready=cast&&!cast.pending&&fishingReady(wildlifeRef.current,cast,time);
      const animal=(!nextNearby||heldItem)&&!seated?nearAnimal():null;
      const source=!room?nearbySource():null;
      const labelAnimal=animal?(animal.id==="companion"?pet?.name??animalLabel(animal):animalLabel(animal)):"";
      const life=!seated&&!nearRobot&&!cast&&!studyEditing?nearLife():null;
      const lifeLabelNow=life?lifeLabel(life):!seated&&!nearRobot&&!cast&&!studyEditing&&!nextNearby&&!targetRef.current&&mayPlace()&&validPlacement(aheadPoint())?(heldItem?.item.kind==="seed"?"播种":"放置"+heldItem?.item.name):"";
      lifePromptRef.current=lifeLabelNow;
      const prompt=seated||selectedRef.current||transitionRef.current||animalMenu?"":cast?(cast.caughtAt!==undefined?"":ready?"收竿":"等待鱼咬钩"):
        nearRobot?(robotControlled?"退出机器人":nearRobot.model.capability==="display"?"观看飞镖展示":"接管"+nearRobot.model.name.replace("机器人","")):
        animal&&heldItem?.item.feeds?.includes(animal.species)?"喂食"+labelAnimal:lifeLabelNow|| (source?"拿取"+worldItems.get(source.id)?.name:nextNearby?"":
        !room&&fishingTarget(playerRef.current)?"钓鱼":animal?"观察"+labelAnimal:"");
      if(prompt!==naturePromptRef.current){naturePromptRef.current=prompt;setNaturePrompt(prompt);}
      if(noticeUntilRef.current&&time>=noticeUntilRef.current){noticeUntilRef.current=0;setNatureNotice("");}
      canvas.dataset.wildlife=String(room?0:wildlifeRef.current.length);
      canvas.dataset.animals=JSON.stringify(visibleAnimals().map(a=>({id:a.id,species:a.species,x:+a.x.toFixed(3),y:+a.y.toFixed(3),behavior:a.behavior,familiar:Boolean(a.familiar),food:Boolean(a.food)})));
      canvas.dataset.pet=activeCompanion?activeCompanion.behavior:"away";
      canvas.dataset.fishing=cast?(cast.caughtAt!==undefined?"caught":ready?"ready":"waiting"):"idle";
      canvas.dataset.action=pose.action;
      canvas.dataset.actionFrame=String(pose.frame);
      const object = room && !selectedRoom && !catalogueDetail && !studyEditing ? closestRoomObject(room, playerRef.current, directionRef.current, targetRef.current as RoomObject | null) : null;
      const nextRoom = seated ? null : object;
      targetRef.current = room ? nextRoom : nextNearby;
      if (nearRoomIdRef.current !== (nextRoom?.id ?? null)) {
        nearRoomIdRef.current = nextRoom?.id ?? null;
        setNearbyRoom(nextRoom);
      }
      const nearId = nextNearby ? ("href" in nextNearby ? nextNearby.id : nextNearby.story?.title ?? `bench-${nextNearby.x}-${nextNearby.y}`) : null;
      if (nearIdRef.current !== nearId) {
        nearIdRef.current = nearId;
        setNearby(nextNearby);
      }
      const feature=room?nextRoom:nextNearby;
      const label=seated?"起身":lifeLabelNow|| (room&&nextRoom?(room.id==="mechanical"&&nextRoom.kind==="workbench"&&heldItem?.row&&["wrench","wheel"].includes(heldItem.item.id)?"清理"+heldItem.item.name:roomAction(nextRoom,room.id,baseState)):naturePromptRef.current || (nextNearby?featureAction(nextNearby):""));
      canvas.dataset.life=JSON.stringify(sceneLife.map(o=>({type:o.type,id:o.type==="loan"?o.value.itemId:o.value.id,x:o.point.x,y:o.point.y,stage:o.type==="plant"?plantStage(o.value):undefined})));
      canvas.dataset.held=heldItem?.item.id??"";
      if(!studyEditing&&!menuOpen&&!mapOpen&&!selectedRef.current&&!selectedRoom&&!catalogueDetail&&!animalMenu&&!transitionRef.current&&label&&label!=="等待鱼咬钩"&&!(robotControlled&&trainingRef.current)){
        const c=snapCamera(cameraRef.current);
        const anchor=nearRobot?{x:nearRobot.x,y:nearRobot.y-nearRobot.model.anchorY/TILE}:life&&lifeLabelNow?{x:life.point.x,y:life.point.y-1.6}:seated||!feature?{x:playerRef.current.x,y:playerRef.current.y-3}:"kind" in feature?(room&&room.id!=="study"&&feature.kind!=="exit"?roomObjectVisualBounds(feature):{x:feature.x+feature.width/2,y:feature.y-1}):"href" in feature?{x:feature.x+feature.width/2,y:feature.y+feature.height-2}:{x:feature.x,y:feature.y-feature.height/TILE};
        const text=(mobile?"":"E ")+label;
        ctx.save();ctx.font="bold 10px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
        const w=ctx.measureText(text).width+12;
        const px=Math.max(w/2+2,Math.min(viewWidth-w/2-2,anchor.x*TILE-c.x)),py=Math.max(12,Math.min(viewHeight-12,anchor.y*TILE-c.y-12));
        ctx.fillStyle="#263f39";ctx.fillRect(px-w/2,py-8,w,16);ctx.strokeStyle="#dfc58d";ctx.strokeRect(px-w/2,py-8,w,16);ctx.fillStyle="#fff0c5";ctx.fillText(text,px,py);ctx.restore();
      }
      canvas.dataset.interaction=label;
      canvas.dataset.baseItem=baseState.item;
      canvas.dataset.basePower=JSON.stringify(baseState.power);
      canvas.dataset.targetId=feature?("id" in feature?feature.id:feature.story?.title??feature.sprite):"";
      canvas.dataset.training=trainingRef.current?.phase??"off";
      canvas.dataset.trainingHp=String(trainingRef.current?.hp??100);
      canvas.dataset.trainingOpponentHp=String(trainingRef.current?.opponentHp??100);
      canvas.dataset.trainingOpponentX=String(trainingRef.current?.opponent.x??0);
      canvas.dataset.trainingOpponentY=String(trainingRef.current?.opponent.y??0);
      canvas.dataset.trainingLights=String(trainingRef.current?.lights.length??0);
      canvas.dataset.trainingResult=trainingRef.current?.lastResult??"";
      canvas.dataset.trainingSparks=String(trainingRef.current?.sparks.length??0);
      canvas.dataset.robotWaypoint=String(activeRobot.waypoint);
      canvas.dataset.robotSpeed=activeRobot.speed.toFixed(2);
      canvas.dataset.cameraY=cameraRef.current.y.toFixed(2);
      canvas.dataset.control=robotControlled?"robot":"player";
      canvas.dataset.robotId=controlledRobot?.model.id??"";
      canvas.dataset.robots=robots.map(r=>[r.model.id,r.x.toFixed(3),r.y.toFixed(3),r.demo.toFixed(2)].join(":")).join("|");
      canvas.dataset.robotX=activeRobot.x.toFixed(3);
      canvas.dataset.robotY=activeRobot.y.toFixed(3);
      canvas.dataset.robotHeading=String(activeRobot.heading);
      canvas.dataset.robotYaw=String(activeRobot.yaw);
      canvas.dataset.playerX = playerRef.current.x.toFixed(3);
      canvas.dataset.playerY = playerRef.current.y.toFixed(3);
      canvas.dataset.cameraX = cameraRef.current.x.toFixed(2);
      canvas.dataset.facing = directionRef.current;
      canvas.dataset.sprinting = String(sprinting && walking);
      canvas.dataset.seated = String(Boolean(seated));
      canvas.dataset.walkFrame = walking ? String(pose.frame) : "0";

      if (!room && miniCtx && (!mobile || mapOpen) && time - lastMini > 100) {
        renderNavigationMap(miniCtx, preview, controlledRobot??playerRef.current, directionRef.current,
          cameraRef.current, viewWidth, viewHeight, mapOpen,discoveries);
        lastMini = time;
      }
      const transition = transitionRef.current;
      if (transition) {
        let alpha = 1;
        if (transition.phase === "out") {
          transition.started ??= time;
          alpha = reducedMotion.matches ? 1 : Math.min(1, (time - transition.started) / 180);
          if (alpha >= 1) {
            transition.phase = "in";
            transition.started = null;
            transition.swap();
          }
        } else if (transition.target === (room?.id ?? null)) {
          transition.started ??= time;
          alpha = reducedMotion.matches ? 0 : 1 - Math.min(1, (time - transition.started) / 240);
          if (alpha <= 0) transitionRef.current = null;
        }
        ctx.save();
        ctx.globalAlpha = alpha * alpha * (3 - 2 * alpha);
        ctx.fillStyle = "#101c24";
        ctx.fillRect(0, 0, viewWidth, viewHeight);
        ctx.restore();
        canvas.dataset.transition = transitionRef.current ? transition.phase : "idle";
      } else canvas.dataset.transition = "idle";
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [assetState, resizeCanvas, setMapZoom, seated, mapOpen, room, roomScale, selectedRoom,
    climate?.season, enterRoom, exitRoom, discoveries, clearInput, menuOpen, mobile, catalogueDetail, studyEditing, controlledRobot,robots,activeRobot,baseState,studyAchievements,pet,heldItem,animalWalkable,nearAnimal,animalMenu,visibleAnimals,studyGuest,sceneLife,animalBusy]);

  const handleMapClick = (event: {clientX: number; clientY: number}) => {
    const canvas = canvasRef.current;
    if (!canvas || transitionRef.current || (menuOpen || mapOpen || selected || selectedRoom || catalogueDetail || animalMenu)) return;
    const rect = canvas.getBoundingClientRect();
    const camera = snapCamera(cameraRef.current);
    const x = ((event.clientX - rect.left) / rect.width * canvas.width / roomScale + camera.x) / TILE;
    const y = ((event.clientY - rect.top) / rect.height * canvas.height / roomScale + camera.y) / TILE;
    if (seated){standUp();return;}
    if (room?.id === "study" && !studyGuest && studyEditing) {
      const cellX = Math.floor(x), cellY = Math.floor(y);
      if (studyTool === "erase") {
        setStudyItems(items => items.filter(item => {
          const shape = furnitureSize(item.kind);
          return !(cellX >= item.x && cellX < item.x + shape.width &&
            cellY >= item.y && cellY < item.y + shape.height);
        }));
      } else {
        const furniture = { kind: studyTool, x: cellX, y: cellY };
        const shape = furnitureSize(studyTool);
        const player = playerRef.current;
        const companion=companionRef.current;
        const actors=[player,...(companion?.scene==="study"?[companion]:[]),...sceneLife.map(o=>o.point)];
        if (actors.some(actor=>actor.x + 0.3 > cellX && actor.x - 0.3 < cellX + shape.width &&
            actor.y + 0.3 > cellY && actor.y - 0.3 < cellY + shape.height)) {
          setStudyNotice("不能将家具放在角色或宠物脚下");
          return;
        }
        setStudyItems(items => canPlaceStudy(items, furniture) ? [...items, furniture] : items);
      }
      setStudyNotice("");
      return;
    }
    if(!room){
      if(controlledRobot){
        if(controlledRobot.model.capability==="carry")startRobotDemo(controlledRobot);
        else if(trainingRef.current)fireTraining(trainingRef.current,controlledRobot,{x,y});
        else aimTraining(controlledRobot,{x,y});
        return;
      }
      const target=robots.filter(robot=>robotInReach(robot,playerRef.current)&&Math.abs(x-robot.x)<robot.model.width/TILE/2&&y>=robot.y-robot.model.anchorY/TILE&&y<=robot.y+.7).sort((a,b)=>b.y-a.y)[0];
      if(target&&toggleRobot(target))return;
    }
    if(!castRef.current&&interactLife(nearLife({x,y})))return;
    if(!castRef.current&&mayPlace()&&placeHeld(placePoint({x,y})))return;
    const clickedAnimal=visibleAnimals().filter(a=>Math.abs(a.x-x)<1&&y>=a.y-2&&y<=a.y+.4&&reachableAnimal(a,heldItem?.item.feeds?.includes(a.species)?a.species==="fish"?5:3.5:2.7)).sort((a,b)=>b.y-a.y)[0];
    if(clickedAnimal){openAnimal(clickedAnimal);return;}
    if(!room){
      const source=nearbySource();
      if(source&&Math.hypot(source.x-x,source.y-y)<1){void collectSource(source);return;}
    }
    if (room) {
      const object = roomObjectAt(room, { x, y });
      if (object) interactRoom(object);
      return;
    }
    const sprites = artIndexRef.current;
    const place = sprites && [...PLACES].sort((a,b) => b.y + b.height - a.y - a.height).find(p => {
      const bounds = buildingBounds(p, sprites);
      return x*TILE >= bounds.x && x*TILE < bounds.x+bounds.width && y*TILE >= bounds.y && y*TILE < bounds.y+bounds.height;
    });
    if (place) interactFeature(place);
    else {
      const story = [...SCENERY].sort((a,b)=>b.y-a.y).find(o=>(o.story||o.sprite==="bench")&&Math.abs(x-o.x)<=o.width/(TILE*2)&&y>=o.y-o.height/TILE&&y<=o.y);
      if (story) interactFeature(story);
    }
  };

  const handleTouchDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" || !mobile || transitionRef.current ||
        menuOpen || mapOpen || selected || selectedRoom || catalogueDetail || animalMenu || assetState !== "ready") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (joystick.current || x > rect.width * .48 || y < rect.height * .5) {
      tapPointers.current.set(event.pointerId, {x:event.clientX,y:event.clientY});
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const ring = joystickRef.current!;
    ring.style.left = Math.max(62, Math.min(rect.width - 62, x)) + "px";
    ring.style.top = Math.max(62, Math.min(rect.height - 62, y)) + "px";
    ring.style.setProperty("--dx", "0px"); ring.style.setProperty("--dy", "0px");
    ring.dataset.running = "false"; ring.hidden = false;
    joystick.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, x: 0, y: 0, running: false };
  };
  const handleTouchMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if(controlledRobot?.model.capability==="training"&&event.pointerType==="mouse"){
      if(trainingRef.current?.phase==="lost")return;
      const canvas=event.currentTarget,rect=canvas.getBoundingClientRect(),camera=snapCamera(cameraRef.current);
      aimTraining(controlledRobot,{x:((event.clientX-rect.left)/rect.width*canvas.width/roomScale+camera.x)/TILE,
        y:((event.clientY-rect.top)/rect.height*canvas.height/roomScale+camera.y)/TILE});
      return;
    }
    const active = joystick.current;
    if (!active || active.pointer !== event.pointerId) {
      const start = tapPointers.current.get(event.pointerId);
      if (start && Math.hypot(event.clientX-start.x,event.clientY-start.y)>7) tapPointers.current.delete(event.pointerId);
      return;
    }
    const dx = event.clientX-active.startX, dy = event.clientY-active.startY;
    const distance = Math.hypot(dx,dy);
    if (distance > JOYSTICK_RADIUS*.15) { active.moved = true; if(seated)standUp(); }
    Object.assign(active, joystickIntent(dx, dy, active.running));
    const ring = joystickRef.current!;
    const scale = Math.min(1, JOYSTICK_RADIUS / (distance || 1));
    ring.style.setProperty("--dx", dx*scale + "px");
    ring.style.setProperty("--dy", dy*scale + "px");
    ring.dataset.running = String(active.running);
  };
  const handleTouchEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = joystick.current;
    if (active?.pointer === event.pointerId) {
      const tap = !active.moved && event.type === "pointerup";
      releaseJoystick();
      if (tap) handleMapClick(event);
    } else {
      const start = tapPointers.current.get(event.pointerId);
      tapPointers.current.delete(event.pointerId);
      if (start && event.type === "pointerup" && Math.hypot(event.clientX-start.x,event.clientY-start.y)<=7) handleMapClick(event);
    }
  };
  const handleNavigationClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (transitionRef.current) return;
    if (!mapOpen) { setMapOpen(true); return; }
    if(robotControlled)return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * WORLD_WIDTH;
    const y = (event.clientY - rect.top) / rect.height * WORLD_HEIGHT;
    const story = knownStories.find(p => Math.hypot(x - p.x, y - p.y) < 2.8);
    const place = PLACES.find(p => x >= p.x && x <= p.x + p.width &&
      y >= p.y && y <= p.y + p.height);
    if (story || place) {
      selectPlace(story ?? place ?? null);
      setMapOpen(false);
    }
  };

  const weatherControls = weatherMode && <div className="pixel-world-weather-controls">
          <select aria-label="时间模式" value={timeMode} onChange={event => changeTimeMode(event.target.value as TimeMode)}><option value="actual">真实时间</option><option value="game">游戏时间</option></select>
          <select aria-label="天气模式" value={weatherMode} onChange={event => changeWeatherMode(event.target.value as WeatherMode)}>
            <option value="actual">长春实况</option>
            <option value="random">随机天气</option>
          </select>
          {hasLiveWeather && <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" title="当前天气来自 Open-Meteo 气象模型">Open-Meteo</a>}
        </div>;
  return (
    <main className={`pixel-world${mobile ? " is-mobile" : ""}`}>
      <div className="pixel-world-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="pixel-world-canvas"
          role="application"
          tabIndex={0}
          aria-label="像素吉甲小镇。WASD 或方向键连续移动，靠近建筑按 E，点击建筑查看介绍。"
          onClick={event => { if (!mobile || (event.nativeEvent as PointerEvent).pointerType === "mouse" || event.detail === 0) handleMapClick(event); }}
          onPointerDown={handleTouchDown} onPointerMove={handleTouchMove}
          onPointerUp={handleTouchEnd} onPointerCancel={handleTouchEnd} onLostPointerCapture={handleTouchEnd}
        />
        <div ref={joystickRef} className="pixel-world-joystick" hidden aria-hidden="true"><i /></div>
        {assetState !== "ready" && (
          <div className="pixel-world-load" role="status">
            {assetState === "loading" ? "正在进入吉甲小镇…" : "地图加载失败，请刷新重试"}
          </div>
        )}
      </div>

      <header className="pixel-world-header">
        {mobile && <button type="button" className="pixel-world-tool pixel-world-menu-toggle" aria-label="菜单" aria-expanded={menuOpen}
          onClick={() => { clearInput(); setMenuOpen(open => !open); setMapOpen(false); }}><i aria-hidden="true" /></button>}
        {(!mobile || menuOpen) && <div className="pixel-world-top-actions">
          {room ? (
            <><button type="button" className="pixel-world-tool" onClick={exitRoom}>返回户外</button><button type="button" className="pixel-world-tool" onClick={() => { clearInput(); setMapOpen(true); setMenuOpen(false); }}>图鉴</button></>
          ) : (
            <>
              {!robotControlled&&<button type="button" className="pixel-world-tool" onClick={() => void openStudy()}>我的研究室</button>}
              <button type="button" className="pixel-world-tool" aria-controls="pixel-world-map-panel"
                aria-expanded={mapOpen} onClick={() => { clearInput(); setMapOpen(open => !open); setMenuOpen(false); }}>地图 <kbd>M</kbd></button>
            </>
          )}
          <button type="button" className="pixel-world-tool" aria-expanded={showHelp}
            onClick={() => { clearInput(); setShowHelp(open => !open); setMenuOpen(false); }} aria-label="操作帮助">{mobile ? "操作帮助" : "?"}</button>
          <button type="button" className="pixel-world-tool" aria-pressed={muted} onClick={event=>{
            const next=!muted;mutedRef.current=next;setMuted(next);
            if(next){audioRef.current?.pause();worldAudioRef.current?.silence();}
            else if(event.nativeEvent.isTrusted)(worldAudioRef.current??=new PixelWorldAudio()).unlock();
          }}>音效 {muted?"关":"开"}</button>
          {mobile && weatherControls}
          <Link to={returnTo === "/pixel-jijia" ? "/" : returnTo} className="pixel-world-return">{experienceReturnLabel(returnTo === "/pixel-jijia" ? "/" : returnTo)}</Link>
        </div>}
      </header>

      {(!room || mapOpen) && <aside id="pixel-world-map-panel" className={`pixel-world-map-panel ${mapOpen ? "is-open" : ""}`}
        aria-label="小镇导航地图">
        {(mobile || room) && <button type="button" className="pixel-world-tool" onClick={() => setMapOpen(false)}>关闭地图</button>}
        {!room && <><div className="pixel-world-map-caption"><span>吉甲地图</span><span>6 个区域 · {SCENERY.filter(p => p.story).length} 处发现</span></div>
        <canvas ref={miniRef} width={432} height={288} onClick={handleNavigationClick}
          aria-label="小镇真实世界缩略图，点击可展开查看或选择地标" role="img" />
        <div className="pixel-world-map-destinations" aria-label="建筑目的地">
          {PLACES.map(place => (
            <button type="button" key={place.id} disabled={robotControlled} onClick={() => { selectPlace(place); setMapOpen(false); }}>
              {place.title}
            </button>
          ))}
        </div>
        </>}
        <details className="pixel-world-map-discoveries">
          <summary>探索发现 · {knownStories.length}/{storySites.length}</summary>
          <div className="pixel-world-map-discovery-list">
            {knownStories.length===0&&<span className="pixel-world-nature-log">靠近地标，按 E 探索。</span>}
            {knownStories.map(item => (
              <button type="button" key={item.story!.title}
                disabled={robotControlled} onClick={() => { selectPlace(item); setMapOpen(false); }}>{item.story!.title}</button>
            ))}
          </div>
        </details>
        <PixelInventory change={inventoryChange} atWater={()=>!room&&Boolean(fishingTarget(playerRef.current))} onRelease={id=>setHeldItem(old=>old?.row?.id===id?null:old)} onInspect={(item,row,owner)=>{
          if(animalBusy)return;
          restoreHeld();setHeldItem({item,row,owner});
          if(baseState.item==="held")setBaseState(old=>transferItem(old,"source"));
          setMapOpen(false);fishingNotice(item.name);
        }}/>
        {pet&&<details className="pixel-world-map-discoveries">
          <summary>宠物 · {pet.name}</summary>
          <div className="pixel-world-map-discovery-list">
            <span>{pet.mode==="home"?"在研究室休息":"跟随中"}</span>
            {pet.mode==="home"&&!studyGuest&&<button type="button" disabled={animalBusy} onClick={()=>savePet("follow",pet.name)}>召回</button>}
          </div>
        </details>}
        <details className="pixel-world-map-discoveries">
          <summary>自然图鉴 · {natureDiscoveries.length}</summary>
          {natureDiscoveries.length?<div className="pixel-world-nature-log">{natureDiscoveries.join(" · ")}</div>:<div className="pixel-world-nature-log">观察动物或钓鱼后收录。</div>}
        </details>
        <details className="pixel-world-map-discoveries">
          <summary>共建图鉴 · {knownCommunity.length}/{communityObjects.length}</summary>
          <div className="pixel-world-map-discovery-list">
            {!knownCommunity.length && <span className="pixel-world-nature-log">探索校园中的共建物件。</span>}
            {knownCommunity.map(object => <button key={object.id} type="button" onClick={() => { setCatalogueDetail(object); setMapOpen(false); }}>{object.title}</button>)}
          </div>
        </details>
        {!room && <div className="pixel-world-zoom">
          <button type="button" aria-label="缩小地图" onClick={() => setMapZoom(zoomRef.current - 0.1)}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="放大地图" onClick={() => setMapZoom(zoomRef.current + 0.1)}>+</button>
        </div>}
      </aside>}
      {room && <div className="pixel-world-room-name">{room.title}</div>}
      {heldItem&&!animalMenu&&!menuOpen&&!mapOpen&&!robotControlled&&<div className="pixel-base-toolbelt pixel-world-held-food">
        <span>手持 · {heldItem.item.name}</span>
        {heldItem.item.id==="pinecone"&&heldItem.row&&<button type="button" disabled={animalBusy} onClick={()=>combineItem("open")}>剥取松子</button>}
        <button type="button" disabled={animalBusy} onClick={restoreHeld}>{heldItem.loan?"归还":heldItem.plant?"取消移动":"收回"}</button>
      </div>}
      {!heldItem&&!seated&&!menuOpen&&!mapOpen&&!robotControlled&&!studyGuest&&!animalMenu&&(()=>{
        const object=nearLife();
        if(object?.type==="loan"&&object.value.itemId==="picnic-mat")return <div className="pixel-base-toolbelt pixel-world-life-action"><button type="button" onClick={()=>restOnMat(object)}>坐在野餐垫上</button></div>;
        if(room?.id==="study"&&object?.type==="plant"&&plantStage(object.value)===3)return <div className="pixel-base-toolbelt pixel-world-life-action"><button type="button" disabled={animalBusy} onClick={()=>{setHeldItem({item:worldItems.get("flowerpot")!,plant:object.value});lifePose(object.point);}}>移动花盆</button></div>;
        if(object?.type==="loan"&&["toolbox","lantern"].includes(object.value.itemId))return <div className="pixel-base-toolbelt pixel-world-life-action"><button type="button" onClick={()=>{setLoans(old=>old.map(o=>o.key===object.value.key?{...o,active:!o.active}:o));lifePose(object.point);}}>{object.value.itemId==="toolbox"?(object.value.active?"合上工具箱":"打开工具箱"):(object.value.active?"熄灭提灯":"点亮提灯")}</button></div>;
        return null;
      })()}
      {animalMenu&&(()=>{
        const animal=visibleAnimals().find(a=>a.id===animalMenu);
        if(!animal)return null;
        const own=animal.id==="companion",canAdopt=!own&&Boolean(animal.variant&&animal.observed&&animal.familiar)&&!pet;
        return <section className="pixel-world-detail pixel-world-animal-detail" role="dialog" aria-label={own?pet?.name:animalLabel(animal)} aria-modal="false">
          <button type="button" className="pixel-world-detail-close" aria-label="关闭动物互动" disabled={animalBusy} onClick={()=>setAnimalMenu(null)}>×</button>
          <div className="pixel-world-detail-content">
            <h1>{own?pet?.name:animalLabel(animal)}</h1>
            {animal.variant&&<span>{own?animalLabel(animal):animal.familiar?"熟悉你了":"校园动物"}</span>}
            <div className="pixel-world-animal-actions">
              {animal.variant&&<button type="button" disabled={animalBusy} onClick={()=>{
                if(petAnimal(animal,playerRef.current)){setAnimalMenu(null);fishingNotice((own?pet?.name:animalLabel(animal))+" 亲近了你");}
                else fishingNotice("先在它身边安静停留一会儿");
              }}>抚摸</button>}
              {heldItem?.item.feeds?.includes(animal.species)&&<button type="button" disabled={animalBusy} onClick={()=>feedAnimal(animal)}>喂食 · {heldItem.item.name}</button>}
              {canAdopt&&(getCachedCurrentUser()?<form onSubmit={e=>{e.preventDefault();adoptAnimal(animal);}}>
                <input aria-label="宠物名称" placeholder="给它取个名字" value={petName} maxLength={16} onChange={e=>setPetName(e.target.value)}/>
                <button type="submit" disabled={animalBusy||!petName.trim()}>领养</button>
              </form>:<Link to="/login">登录后领养</Link>)}
              {own&&pet&&<form onSubmit={e=>{e.preventDefault();savePet(pet.mode,petName);}}>
                <input aria-label="宠物名称" value={petName} maxLength={16} onChange={e=>setPetName(e.target.value)}/>
                <button type="submit" disabled={animalBusy||!petName.trim()||petName.trim()===pet.name}>保存名称</button>
              </form>}
              {own&&pet&&room?.id==="study"&&!studyGuest&&<button type="button" disabled={animalBusy} onClick={()=>savePet(pet.mode==="home"?"follow":"home",pet.name)}>{pet.mode==="home"?"继续跟随":"留在研究室"}</button>}
            </div>
          </div>
        </section>;
      })()}
      {room&&baseState.item==="held"&&!selectedRoom&&<div className="pixel-base-toolbelt"><span>{carriedLabel(room.id)}</span><button type="button" onClick={()=>setBaseState(old=>transferItem(old,"source"))}>归还</button></div>}
      {!room&&freshFish&&!menuOpen&&!mapOpen&&<div className="pixel-base-fish"><SaveAchievement id="fish"/><button type="button" onClick={()=>setFreshFish(false)}>×</button></div>}
      {room?.id === "study" && <div className="pixel-world-study-panel">
      {!studyGuest && <div className="pixel-world-study-tools" role="group" aria-label="研究室家具布置">
        <button type="button" aria-pressed={studyEditing} onClick={()=>{standUp();setStudyEditing(!studyEditing);}}> {studyEditing?"完成布置":"布置家具"}</button>
        {studyEditing && <select aria-label="选择家具或删除" value={studyTool}
          onChange={event => setStudyTool(event.target.value as StudyFurnitureKind | "erase")}>
          {Object.entries(STUDY_CATALOG).map(([kind, title]) =>
            <option value={kind} key={kind}>{title}</option>)}
          <option value="erase">移除家具</option>
        </select>}
        <button type="button" disabled={studySaving} onClick={() => void saveStudy()}>保存布局</button>
        <button type="button" onClick={() => void saveStudy(true)}>邀请参观</button>
        {studyHasInvite && <button type="button" onClick={() => void revokeStudyInvite()}>撤销邀请</button>}
        {studyInvite && <>
          <input aria-label="参观邀请链接" readOnly value={studyInvite}
            onFocus={event => event.target.select()} />
          <button type="button" onClick={() => {
            void navigator.clipboard.writeText(studyInvite)
              .then(() => setStudyNotice("链接已复制"))
              .catch(() => setStudyNotice("请选中上方链接手动复制"));
          }}>复制</button>
        </>}
      </div>}
      {studyGuest && <div className="pixel-world-study-guest">只读参观</div>}
      {studyAchievements.length>0&&<details className="pixel-base-study-achievements">
        <summary>{studyGuest?"展品":"个人成果"} · {studyAchievements.length}</summary>
        {!studyGuest&&<p>研发纪念 · {RESEARCH_IDS.filter(id=>studyAchievements.some(row=>row.id===id)).length}/{RESEARCH_IDS.length}</p>}
        {studyAchievements.map(item=><div key={item.id}><span>{item.title}</span>{!studyGuest&&<button type="button" disabled={studySaving} aria-pressed={item.displayed} onClick={()=>void toggleStudyAchievement(item)}>{item.displayed?"取消展示":"展示"}</button>}</div>)}
      </details>}
      </div>}
      {studyNotice && <div className="pixel-world-study-notice" role="status">
        {studyNotice} {studyNotice.includes("未登录") && <Link to="/login">前往登录</Link>}
      </div>}
      {climate && <div className="pixel-world-climate" aria-label="长春时间与天气">
        <div className="pixel-world-weather-line" role="status">
          <span>{SEASON_LABEL[climate.season]}</span>
          <time>{String(climate.hour).padStart(2, "0")}:{String(climate.minute).padStart(2, "0")}</time>
          <span>{weatherLabel}</span>
          {climate.temperature !== null && <span>{climate.temperature.toFixed(0)}°C</span>}
        </div>
        {!mobile && weatherControls}
      </div>}
      {controlledRobot?.model.capability==="carry"&&!menuOpen&&!mapOpen&&<div className="pixel-world-training"><button type="button" onClick={()=>startRobotDemo(controlledRobot)}>搬运演示</button></div>}
      {robotControlled&&trainingPhase&&!menuOpen&&!mapOpen&&<div className="pixel-world-training" role="status">
        {trainingPhase==="playing"?<span>{mobile?"点击瞄准 · 摇杆移动":"微缩训练 · 点击发射 · E 退出"}</span>:<>
          <span>{trainingPhase==="won"?"训练完成":"训练机器人失能"}</span>
          {trainingPhase==="won"&&activeRobot.model.id==="guodong"&&<SaveAchievement id="training-guodong"/>}
          <button type="button" onClick={()=>{trainingRef.current=createTraining(activeRobot,playerRef.current,robots);setTrainingPhase(trainingRef.current?.phase??null);}}>重新训练</button>
        </>}
      </div>}
      {showHelp && <div className="pixel-world-guide" role="note">
        {mobile ? "左下拖动 · 推远疾跑 · 靠近或点击交互" : "WASD / 方向键移动 · Shift 疾跑 · E 探索 · 滚轮缩放 · M 地图"}
      </div>}
      {naturePrompt==="等待鱼咬钩" && !natureNotice && <div className="pixel-world-nature-notice" role="status">等待鱼咬钩</div>}
      {natureNotice&&<div className="pixel-world-nature-notice" role="status">{typeof natureNotice==="string"?natureNotice:<>
        发现共建彩蛋 · {natureNotice.title}{natureNotice.community?.sources.map((source,index)=>source.authorName&&<span key={source.comment}> · {communityCreditRole(natureNotice.community!.sources,index)}：{source.authorName}</span>)}
      </>}</div>}
      {mobile && !studyEditing && !menuOpen && !mapOpen && !selected && !selectedRoom && !catalogueDetail && !animalMenu && (seated || nearbyRoom || nearby || (naturePrompt && naturePrompt!=="等待鱼咬钩")) &&
        <button type="button" className="pixel-world-interact" onClick={() => seated ? standUp() : toggleRobot()?undefined:!castRef.current&&interactLife()?undefined:nearbyRoom ? interactRoom(nearbyRoom) : lifePromptRef.current&&placeHeld(aheadPoint())?undefined:naturePrompt ? interactNature() : nearby && interactFeature(nearby)}>
          {seated?"起身":lifePromptRef.current|| (nearbyRoom?(room?.id==="mechanical"&&nearbyRoom.kind==="workbench"&&heldItem?.row&&["wrench","wheel"].includes(heldItem.item.id)?"清理"+heldItem.item.name:roomAction(nearbyRoom,room?.id,baseState)):naturePrompt|| (nearby?featureAction(nearby):""))}
        </button>}

      {selected && (
        <section ref={dialogRef} className="pixel-world-detail" role="dialog" aria-label={featureTitle(selected)} aria-modal="false">
          <button ref={closeRef} className="pixel-world-detail-close" type="button" aria-label="关闭介绍" onClick={() => selectPlace(null)}>×</button>
          <div className="pixel-world-detail-content">
          <h1>{featureTitle(selected)}</h1>
          {!("href" in selected) && selected.story?.description && <p>{selected.story.description}</p>}
          {!("href" in selected)&&selected.story?.title==="机器人试验场"&&Math.hypot(playerRef.current.x-selected.x,playerRef.current.y-selected.y)<2.8&&
            <Link to="/pixel-jijia/arena" state={{experienceReturnTo:"/pixel-jijia",pixelReturn:{...playerRef.current,zoom:zoomRef.current,parent:returnTo}}} className="pixel-world-detail-link">进入三维战场<span aria-hidden="true">↗</span></Link>}
          {"href" in selected && <Link to={selected.href} state={selected.href === "/pixel-jijia/battle" ? { experienceReturnTo: returnTo.startsWith("/dashboard") ? returnTo : "/pixel-jijia" } : undefined} className="pixel-world-detail-link">{selected.action}<span aria-hidden="true">↗</span></Link>}
          {"href" in selected && selected.id === "ai" && <Link to="/about" className="pixel-world-detail-secondary-link">认识 AI 组</Link>}

        </div></section>
      )}
      {selectedRoom && <section ref={dialogRef} className={`pixel-world-detail${selectedRoom.community||baseAction(room?.id,selectedRoom.id) ? " pixel-world-community-detail" : ""}`} role="dialog"
        aria-label={selectedRoom.title} aria-modal="false">
        <button type="button" className="pixel-world-detail-close" aria-label="关闭介绍"
          onClick={() => selectRoomObject(null)}>×</button>
        <div className="pixel-world-detail-content">
        <h1>{selectedRoom.title}</h1>
        {selectedRoom.community && baseAction(room?.id,selectedRoom.id)==="history" ? <CommunityCredits object={selectedRoom}/> : selectedRoom.community ? <CommunityObjectDetail key={selectedRoom.id} object={selectedRoom}
          returnTo={returnTo.startsWith("/dashboard") ? returnTo : "/pixel-jijia"} /> : null}
        {baseAction(room?.id,selectedRoom.id)&&<BaseObjectDetail key={selectedRoom.id} action={baseAction(room?.id,selectedRoom.id)!} state={baseState} setState={setBaseState} objectId={selectedRoom.id}/>}
        {selectedRoom.href && <Link to={selectedRoom.href} className="pixel-world-detail-link">
          {selectedRoom.action ?? "查看详情"}<span aria-hidden="true">↗</span>
        </Link>}
      </div></section>}
      {catalogueDetail && <section ref={dialogRef} className="pixel-world-detail pixel-world-community-detail" role="dialog" aria-label={catalogueDetail.title}>
        <button className="pixel-world-detail-close" type="button" aria-label="关闭图鉴" onClick={()=>setCatalogueDetail(null)}>×</button>
        <div className="pixel-world-detail-content"><h1>{catalogueDetail.title}</h1><CommunityCredits object={catalogueDetail}/></div>
      </section>}
    </main>
  );
}
