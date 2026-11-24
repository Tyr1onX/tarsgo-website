import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { getExperienceReturnTo, experienceReturnLabel } from "~/lib/experience-navigation";
import type { Route } from "./+types/pixel-jijia";
import { buildPublicMeta } from "~/lib/social-meta";
import {
  FOUNTAIN, groundAt, waterDepthAt, PLACES, SCENERY, SPAWN, TILE, WORLD_HEIGHT, WORLD_WIDTH, benchExit, benchSeat, cameraAt, clampZoom, closestBench, closestPlace, closestStory, movePlayer, outdoorDoorAt, snapCamera, advanceSurfaceTrail,
  type SurfaceMark, type Direction, type Place, type Position, type Scenery,
} from "~/lib/pixel-jijia-world";
import { buildingBounds, renderNavigationMap, renderParticles, renderScene, renderTerrain, renderWorldPreview, WORLD_ART_SCALE, type Terrain, type PixelParticle, type SpriteIndex } from "~/lib/pixel-jijia-scene";
import { explorerAnimation,initialExplorerAnimation,type ExplorerAnimation } from "~/lib/pixel-jijia-explorer";
import { ROOMS, STUDY_ROOM, closestRoomObject, roomInteractionDistance, roomObjectAt, isRoomWalkable, roomExitAt, renderRoomScene, renderRoomTerrain, type RoomObject } from "~/lib/pixel-jijia-room";
import { createWildlife, updateWildlife, closestAnimal, fishingTarget, beginFishing, fishingReady, fishingPose, catchFish, SPECIES_LABEL, type Animal, type FishingCast } from "~/lib/pixel-jijia-life";
import { ROOM_ART_SCALE,preparePublicRoomArt } from "~/lib/pixel-jijia-room-art";
import { COMMUNITY_PREFIX, COMMUNITY_ROOM_OBJECTS, communityDiscoveryId } from "~/lib/pixel-jijia-community";
import { CommunityObjectDetail } from "~/components/pixel-jijia-community-detail";
import { apiRequest } from "~/lib/api-client";
import { getCurrentUser } from "~/lib/auth-client";
import { STUDY_CATALOG, canPlaceStudy, furnitureSize, makeStudyRoom, type StudyFurniture, type StudyFurnitureKind } from "~/lib/pixel-jijia-study";
import { SEASON_LABEL, WEATHER_LABEL, WEATHER_URL, WEATHER_REFRESH_MS, changchunClimate, parseCurrentWeather, advanceSurface, type SurfaceWeather, type ChangchunClimate, type CurrentWeather, type WeatherMode, type TimeMode } from "~/lib/pixel-jijia-climate";
import groundTilesUrl from "../assets/pixel-jijia/ground-tiles.png?url";
import plazaPropsUrl from "../assets/pixel-jijia/plaza-props.png?url";
import roomPropsUrl from "../assets/pixel-jijia/room-props-v3.png?url";
import roomSprites from "../assets/pixel-jijia/room-props-v3.json";
import communityPropsUrl from "../assets/pixel-jijia/room-community-v31.png?url";
import communitySprites from "../assets/pixel-jijia/room-community-v31.json";
import { JOYSTICK_RADIUS, joystickIntent } from "~/lib/pixel-jijia-input";
import "./pixel-jijia.css";

const DEFAULT_ZOOM = 1.35;
const communityObjects = Object.values(COMMUNITY_ROOM_OBJECTS).flat();

type Feature = Place | Scenery;
const featureTitle = (feature: Feature) => "href" in feature ? feature.title : feature.story?.title ?? (feature.sprite === "bench" ? "石凳" : "发现");
const nearDoor = (place: Place, position: Position) => Math.abs(position.x-place.x-place.width/2)<=1.35 && position.y>=place.y+place.height+.3 && position.y<=place.y+place.height+3;
const closestFeature = (position: Position, mobile = false): Feature | null => {
  if(waterDepthAt(position.x,position.y))return null;
  const candidate = closestPlace(position);
  const place = candidate && (!mobile || nearDoor(candidate, position)) ? candidate : null;
  const story = closestStory(position), bench = closestBench(position);
  const scenery = story && bench && Math.hypot(position.x - bench.x, position.y - bench.y) <
    Math.hypot(position.x - story.x, position.y - story.y) ? bench : story ?? bench;
  if (!place || !scenery) return place ?? scenery;
  const dx = Math.max(place.x - position.x, 0, position.x - place.x - place.width);
  const dy = Math.max(place.y - position.y, 0, position.y - place.y - place.height);
  return Math.hypot(position.x - scenery.x, position.y - scenery.y) < Math.hypot(dx, dy)
    ? scenery : place;
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
  const returnTo = getExperienceReturnTo(useLocation().state, "/");
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Position>({ ...SPAWN });
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
  const trailRef = useRef<SurfaceMark[]>([]);
  const castRef = useRef<FishingCast | null>(null);
  const poseRef=useRef<ExplorerAnimation>(initialExplorerAnimation);
  const naturePromptRef = useRef("");
  const noticeUntilRef = useRef(0);
  const [naturePrompt,setNaturePrompt] = useState("");
  const [natureNotice,setNatureNotice] = useState("");
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
  const zoomRef = useRef(DEFAULT_ZOOM);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [timeMode, setTimeMode] = useState<TimeMode>("actual");
  const [clock, setClock] = useState<ChangchunClimate | null>(null);
  const [weatherMode, setWeatherMode] = useState<WeatherMode | null>(null);
  const [actualWeather, setActualWeather] = useState<CurrentWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const liveWeather = actualWeather && Math.abs(Date.now() - actualWeather.time) <= WEATHER_REFRESH_MS * 3 ? actualWeather : null;
  const climate = clock && {
    ...clock,
    weather: weatherMode === "random" ? clock.weather : liveWeather?.weather ?? null,
    temperature: weatherMode === "random" ? clock.temperature : liveWeather?.temperature ?? null,
  };
  const climateRef = useRef(climate);
  useEffect(() => { climateRef.current = climate; }, [climate]);
  const [mapOpen, setMapOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [assetState, setAssetState] = useState<"loading" | "ready" | "error">("loading");
  const [nearby, setNearby] = useState<Feature | null>(null);
  const [selected, setSelected] = useState<Feature | null>(null);
  const [storyActivated, setStoryActivated] = useState(false);
  const [seated, setSeated] = useState<Scenery | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
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
  const roomScale = room ? room.id !== "study" ? ROOM_ART_SCALE : 1 : WORLD_ART_SCALE;
  const [nearbyRoom, setNearbyRoom] = useState<RoomObject | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomObject | null>(null);
  const [roomSitting,setRoomSitting] = useState(false);
  const roomSitOrigin = useRef<Position | null>(null);
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
  const selectRoomObject = useCallback((object: RoomObject | null) => {
    if (roomSitOrigin.current) {
      playerRef.current = roomSitOrigin.current;
      roomSitOrigin.current = null;
    }
    setRoomSitting(false);
    clearInput();
    if (object?.community) recordDiscovery(communityDiscoveryId(object));
    setSelectedRoom(object);
  }, [recordDiscovery, clearInput]);
  const sitAtMeeting = useCallback(() => {
    if (room?.id !== "guild" || selectedRoom?.id !== "weekly-meeting") return;
    const chair = room.objects.find(object => object.id === "decor-2");
    if (!chair) return;
    roomSitOrigin.current = { ...playerRef.current };
    playerRef.current = { x: chair.x + chair.width / 2, y: chair.y + chair.height / 2 };
    directionRef.current = "up";
    setRoomSitting(true);
  }, [room, selectedRoom]);
  const interactNature = useCallback(()=>{
    if(transitionRef.current||selectedRef.current)return;
    const player=playerRef.current,cast=castRef.current;
    if(cast){
      const fish=catchFish(wildlifeRef.current,cast,performance.now());
      if(!fish)return;
      cast.caughtAt=0;recordDiscovery(fish,"钓到一条"+fish);return;
    }
    const target=fishingTarget(player);
    if(target){castRef.current=beginFishing(wildlifeRef.current,target,performance.now());
      const dx=target.x-player.x,dy=target.y-player.y;directionRef.current=Math.abs(dx)>Math.abs(dy)?dx>0?"right":"left":dy>0?"down":"up";return;}
    const animal=closestAnimal(wildlifeRef.current,player);
    if(animal){poseRef.current={...poseRef.current,action:"observe",since:performance.now()};recordDiscovery(SPECIES_LABEL[animal.species],"已观察："+SPECIES_LABEL[animal.species]);}
  },[recordDiscovery]);

  useEffect(() => {
    const refresh = () => setClock(changchunClimate(new Date(), timeMode));
    refresh();
    const interval = window.setInterval(refresh, timeMode === "game" ? 1000 : 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [timeMode]);

  useEffect(() => {
    setTimeMode(localStorage.getItem("pixel-jijia-time-mode") === "game" ? "game" : "actual");
    setWeatherMode(localStorage.getItem("pixel-jijia-weather-mode") === "random" ? "random" : "actual");
  }, []);

  useEffect(() => {
    if (weatherMode !== "actual") return;
    let active = true;
    let request: AbortController | null = null;
    const refresh = async () => {
      if (request) return;
      request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 10_000);
      setWeatherLoading(true);
      try {
        const response = await fetch(WEATHER_URL, { signal: request.signal });
        const value = response.ok ? parseCurrentWeather(await response.json()) : null;
        if (active) setActualWeather(value);
      } catch {
        if (active) setActualWeather(null);
      } finally {
        window.clearTimeout(timeout);
        request = null;
        if (active) setWeatherLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, WEATHER_REFRESH_MS);
    return () => {
      active = false;
      request?.abort();
      window.clearInterval(interval);
    };
  }, [weatherMode]);

  const changeWeatherMode = (mode: WeatherMode) => {
    if (mode === weatherMode) return;
    setActualWeather(null);
    setWeatherLoading(mode === "actual");
    setWeatherMode(mode);
    localStorage.setItem("pixel-jijia-weather-mode", mode);
  };

  const selectPlace = useCallback((place: Feature | null) => {
    if(place){
      castRef.current=null;
      if(!("href" in place)&&place.story&&Math.hypot(playerRef.current.x-place.x,playerRef.current.y-place.y)<2.8)
        recordDiscovery(place.story.title);
    }
    selectedRef.current = place;
    clearInput();
    setStoryActivated(false);
    setSelected(place);
  }, [recordDiscovery, clearInput]);

  const standUp = useCallback(() => {
    if (!seated) return;
    const exit = benchExit(seated);
    if (exit) playerRef.current = exit;
    setSeated(null);
  }, [seated]);

  const sitDown = (bench: Scenery) => {
    if (bench.sprite !== "bench" || !benchExit(bench)) return;
    if (Math.hypot(playerRef.current.x - bench.x, playerRef.current.y - bench.y) >= 2.5) return;
    playerRef.current = benchSeat(bench);
    directionRef.current = "down";
    setSeated(bench);
    selectPlace(null);
  };

  // The existing animation frame owns both halves of the fade. Swap only
  // while fully covered, and keep it covered until the destination has rendered.
  const transitionTo = useCallback((target: string | null, swap: () => void) => {
    if (transitionRef.current) return;
    clearInput();
    setMenuOpen(false);
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
      setRoomSitting(false); roomSitOrigin.current = null;
      setMapOpen(false);
      selectedRef.current = null;
      setSelected(null);
      setStoryActivated(false);
    });
  }, [transitionTo]);

  const openStudy = useCallback(async (invitation?: string) => {
    setStudyNotice("");
    try {
      if (!invitation) await getCurrentUser();
      const data = await apiRequest<{
        furniture: StudyFurniture[]; inviteActive?: boolean;
      }>(invitation ? `/api/pixel-home/visit?token=${encodeURIComponent(invitation)}`
        : "/api/pixel-home/me", { cache: "no-store" });
      transitionTo("study", () => {
        setStudyItems(data.furniture);
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
      setRoomSitting(false); roomSitOrigin.current = null;
        setMapOpen(false);
        selectPlace(null);
      });
    } catch (error) {
      setStudyNotice(error instanceof Error ? error.message : "研究室无法打开");
    }
  }, [selectPlace, transitionTo, clearInput]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("visit");
    if (token) void openStudy(token);
  }, [openStudy]);

  const saveStudy = async () => {
    if (studyGuest || studySaving) return;
    setStudySaving(true);
    setStudyNotice("");
    try {
      await apiRequest("/api/pixel-home/me", {
        method: "PUT", body: { furniture: studyItems },
      });
      setStudyNotice("布局已保存");
    } catch (error) {
      setStudyNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setStudySaving(false);
    }
  };
  const createStudyInvite = async () => {
    if (studySaving || studyGuest) return;
    setStudySaving(true);
    setStudyNotice("");
    try {
      // Invite links must point to the currently visible layout, not an old saved copy.
      await apiRequest("/api/pixel-home/me", {
        method: "PUT", body: { furniture: studyItems },
      });
      const result = await apiRequest<{ token: string }>("/api/pixel-home/invite", { method: "POST" });
      const url = `${window.location.origin}/pixel-jijia?visit=${result.token}`;
      setStudyInvite(url);
      setStudyHasInvite(true);
      setStudyNotice("邀请已生成，可复制链接发给访客");
    } catch (error) {
      setStudyNotice(error instanceof Error ? error.message : "邀请生成失败");
    } finally {
      setStudySaving(false);
    }
  };
  const revokeStudyInvite = async () => {
    try {
      await apiRequest("/api/pixel-home/invite", { method: "DELETE" });
      setStudyInvite("");
      setStudyHasInvite(false);
      setStudyNotice("旧邀请链接已失效");
    } catch (error) {
      setStudyNotice(error instanceof Error ? error.message : "撤销失败");
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
      setRoomSitting(false); roomSitOrigin.current = null;
        setStudyGuest(false);
        if (window.location.search.includes("visit=")) window.history.replaceState(null, "", "/pixel-jijia");
        return;
      }
      const place = PLACES.find(p => p.id === roomId);
      if (!place) return;
      playerRef.current = { x: place.x + place.width / 2, y: place.y + place.height + 1.2 };
      const canvas = canvasRef.current;
      if (canvas) cameraRef.current = cameraAt(playerRef.current, canvas.clientWidth / zoomRef.current, canvas.clientHeight / zoomRef.current);
      setSelectedRoom(null);
      setRoomSitting(false); roomSitOrigin.current = null;
      setRoomId(null);
    });
  }, [roomId, transitionTo]);

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
    cameraRef.current = cameraAt(playerRef.current, width, height,
      (room?.width ?? WORLD_WIDTH) * TILE, (room?.height ?? WORLD_HEIGHT) * TILE);
  }, [room, roomScale, mobile]);

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

  useEffect(() => {
    let active = true;
    const atlas = new Image();
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
      fetch("/assets/pixel-jijia/campus-buildings-v3.json")
        .then((response) => {
          if (!response.ok) throw new Error("像素素材索引加载失败");
          return response.json() as Promise<{ sprites: SpriteIndex }>;
        }),
    ])
      .then(([image, explorer, ground, environment, furniture, communityFurniture, metadata]) => {
        if (!active) return;
        if (ground.naturalWidth !== 384 || ground.naturalHeight !== 1376) {
          throw new Error("地面图集与场景版本不匹配");
        }
        if (environment.naturalWidth !== 512 || environment.naturalHeight !== 384) {
          throw new Error("场景美术素材与当前版本不匹配");
        }
        characterRef.current = explorer;
        artRef.current = image;
        artIndexRef.current = metadata.sprites;
        propsRef.current = environment;
        wildlifeRef.current = createWildlife();
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
    if (selected) closeRef.current?.focus();
  }, [selected]);

  const distanceNotice = useCallback(() => {
    setNatureNotice("再靠近一点");
    noticeUntilRef.current = performance.now() + 1800;
  }, []);
  const interactRoom = useCallback((object: RoomObject) => {
    if (!room || transitionRef.current || !room.objects.includes(object)) return;
    if (roomInteractionDistance(room, object, playerRef.current) >= 2.1) { distanceNotice(); return; }
    if (object.kind === "exit") exitRoom();
    else selectRoomObject(object);
  }, [room, exitRoom, selectRoomObject, distanceNotice]);
  const interactFeature = useCallback((feature: Feature) => {
    if (room || transitionRef.current || waterDepthAt(playerRef.current.x, playerRef.current.y)) return;
    if ("href" in feature) {
      if (!nearDoor(feature,playerRef.current)) { distanceNotice(); return; }
      if (ROOMS[feature.id]) enterRoom(feature.id);
      else selectPlace(feature);
    } else {
      const radius = feature.sprite === "bench" ? 2.5 : 2.8;
      if (Math.hypot(playerRef.current.x-feature.x,playerRef.current.y-feature.y) >= radius) { distanceNotice(); return; }
      selectPlace(feature);
    }
  }, [room, enterRoom, selectPlace, distanceNotice]);
  useEffect(() => {
    if (menuOpen || (mobile && mapOpen) || selectedRoom || selected) clearInput();
  }, [menuOpen, mapOpen, mobile, selectedRoom, selected, clearInput]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable=true]")) return;
      if (transitionRef.current) return;
      if (event.key === "Escape") {
        if (selectedRoom) selectRoomObject(null);
        else if(castRef.current)castRef.current=null;
        else if (selectedRef.current) selectPlace(null);
        else { setMapOpen(false); setShowHelp(false); setMenuOpen(false); }
        return;
      }
      if (menuOpen || (mobile && mapOpen)) return;
      if (event.key === "Shift") {
        if (!selectedRef.current) sprintKeyRef.current = true;
        return;
      }
      if (event.key.toLowerCase() === "m") {
        if (!room) { event.preventDefault(); setMapOpen(open => !open); }
        return;
      }
      if (event.key.toLowerCase() === "e") {
        if (selectedRoom || event.repeat) return;
        if (room) {
          const object = closestRoomObject(room, playerRef.current);
          if (object && (mobile || object.kind !== "exit")) {
            event.preventDefault();
            interactRoom(object);
          }
          return;
        }
        if (seated) { event.preventDefault(); standUp(); return; }
        const place = closestFeature(playerRef.current, mobile);
        if(castRef.current){event.preventDefault();interactNature();}
        else if(place){event.preventDefault();if (mobile) interactFeature(place); else selectPlace(place);}
        else if(fishingTarget(playerRef.current)||closestAnimal(wildlifeRef.current,playerRef.current)){event.preventDefault();interactNature();}
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
      clearInput();
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
  }, [selectPlace, selectRoomObject, seated, standUp, room, selectedRoom, interactRoom, interactFeature, interactNature, clearInput, menuOpen, mobile, mapOpen]);

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
    let lastDust = 0, lastFountain = 0, lastPetal = 0, lastWeather = 0;
    const particles: PixelParticle[] = [];
    const cherryTrees = SCENERY.filter((item) => item.sprite === "cherry");
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
      lastTime = time;
      surfaceRef.current=advanceSurface(surfaceRef.current,climate?.weather??null,climate?.temperature??null,dt);
      const held = (dir: Direction) => Number(keysRef.current.has(dir));
      const touch = joystick.current;
      const x = touch ? touch.x : held("right") - held("left");
      const y = touch ? touch.y : held("down") - held("up");
      let walking = false;
      const sprinting = touch ? touch.running : sprintKeyRef.current;

      const previous = playerRef.current;
      if (!transitionRef.current && (x !== 0 || y !== 0) && !selectedRef.current && !selectedRoom && !seated && !menuOpen && !(mobile && mapOpen)) {
        const next = movePlayer(previous, x, y, dt, sprinting,
          room ? (px, py) => isRoomWalkable(room, px, py) : undefined);
        const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
        playerRef.current = next;
        directionRef.current = Math.abs(x) >= Math.abs(y) ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up");
        walking = distance > 0.0001;
        if (walking) { traveled += distance; castRef.current=null; }
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
      const viewWidth = canvas.width / roomScale, viewHeight = canvas.height / roomScale;
      const target = cameraAt(playerRef.current, viewWidth, viewHeight,
        (room?.width ?? WORLD_WIDTH) * TILE, (room?.height ?? WORLD_HEIGHT) * TILE);
      const follow = 1 - Math.exp(-(sprinting ? 8 : 6) * dt);
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
        water:room?0:waterDepthAt(playerRef.current.x,playerRef.current.y),seated:Boolean(seated)||roomSitting,
        fishing:fishingPose(castNow,readyNow,time),now:time,motion:!reducedMotion.matches,
      });
      ctx.setTransform(roomScale, 0, 0, roomScale, 0, 0);
      ctx.clearRect(0, 0, viewWidth, viewHeight);
      ctx.imageSmoothingEnabled = false;
      if (room && roomTerrain) {
        trailRef.current.length = 0;
        renderRoomScene(ctx, roomTerrain, room, character, playerRef.current,
          pose, cameraRef.current,
          time, !reducedMotion.matches, climate);
      } else {
        advanceSurfaceTrail(trailRef.current, previous, playerRef.current, dt, surfaceRef.current.snow, !reducedMotion.matches);
        updateWildlife(wildlifeRef.current,playerRef.current,dt,climate?.hour??12,climate?.weather??null,!reducedMotion.matches,castRef.current);
        renderScene(ctx, terrain, atlas, sprites, props, character,
          playerRef.current, pose, cameraRef.current,
          climate,wildlifeRef.current,castRef.current,time,!reducedMotion.matches,surfaceRef.current,trailRef.current);
      }

      if (reducedMotion.matches || room) {
        particles.length = 0;
      } else {
        if (walking && sprinting && !waterDepthAt(playerRef.current.x,playerRef.current.y) && climate?.weather !== "rain" && climate?.weather !== "storm" && climate?.weather !== "snow" && time - lastDust > 110) {
          const foot = playerRef.current;
          const surface = groundAt(foot.x,foot.y);
          emit({ x: foot.x * TILE + (Math.random() - 0.5) * 12, y: foot.y * TILE - 3,
            vx: (Math.random() - 0.5) * 14, vy: -8, age: 0, ttl: 0.38,
            color: surface === 0 ? "#c4d69c" : "#e5d9bd", size: 2 });
          lastDust = time;
        }
        if ((climate?.temperature ?? 0) > 0 && time - lastFountain > 220 &&
            Math.hypot(playerRef.current.x - FOUNTAIN.x, playerRef.current.y - FOUNTAIN.y) < 19) {
          emit({ x: FOUNTAIN.x * TILE + (Math.random() - 0.5) * 32,
            y: (FOUNTAIN.y - 2.8) * TILE, vx: (Math.random() - 0.5) * 14,
            vy: -14, age: 0, ttl: 0.58, color: "#a8effa", size: 2 });
          lastFountain = time;
        }
        if (climate?.season === "spring" && climate.weather !== "rain" && climate.weather !== "storm" && time - lastPetal > 560) {
          lastPetal = time;
          const tree = cherryTrees.find((item) =>
            Math.hypot(playerRef.current.x - item.x, playerRef.current.y - item.y) < 16);
          if (tree) {
            emit({ x: tree.x * TILE + (Math.random() - 0.5) * 48,
              y: tree.y * TILE - 68, vx: 9, vy: 12,
              age: 0, ttl: 2.1, color: "#f7b6ce", size: 3 });
          }
        }
        if (climate && (climate.weather === "rain" || climate.weather === "storm" || climate.weather === "snow") &&
            time - lastWeather > (climate.weather === "snow" ? 150 : climate.weather === "storm" ? 38 : 65)) {
          const snow = climate.weather === "snow";
          emit({ x: cameraRef.current.x + Math.random() * viewWidth,
            y: cameraRef.current.y + Math.random() * viewHeight - 24, vx: snow ? 4 : -20,
            vy: snow ? 24 : 140, age: 0, ttl: snow ? 4 : 1.4,
            color: snow ? "#f4f7ed" : "#a3d3e0", size: snow ? 2 : 1, height: snow ? 2 : 8,rain:!snow });
          lastWeather = time;
        }
        for (let index = particles.length - 1; index >= 0; index--) {
          const particle = particles[index];
          particle.age += dt;
          particle.x += particle.vx * dt;
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

      const nextNearby = seated || room ? null : closestFeature(playerRef.current, mobile);
      const cast=castRef.current;
      const ready=cast&&fishingReady(wildlifeRef.current,cast,time);
      const animal=!room&&!nextNearby&&!seated?closestAnimal(wildlifeRef.current,playerRef.current):null;
      const prompt=room||seated||selectedRef.current||transitionRef.current?"":cast?(cast.caughtAt!==undefined?"":ready?"收竿":"等待鱼咬钩"):
        nextNearby?"":fishingTarget(playerRef.current)?"钓鱼":animal?"观察"+SPECIES_LABEL[animal.species]:"";
      if(prompt!==naturePromptRef.current){naturePromptRef.current=prompt;setNaturePrompt(prompt);}
      if(noticeUntilRef.current&&time>=noticeUntilRef.current){noticeUntilRef.current=0;setNatureNotice("");}
      canvas.dataset.wildlife=String(room?0:wildlifeRef.current.length);
      canvas.dataset.fishing=cast?(cast.caughtAt!==undefined?"caught":ready?"ready":"waiting"):"idle";
      canvas.dataset.action=pose.action;
      canvas.dataset.actionFrame=String(pose.frame);
      const object = room && !selectedRoom ? closestRoomObject(room, playerRef.current) : null;
      const nextRoom = object && (mobile || object.kind !== "exit") ? object : null;
      if (nearRoomIdRef.current !== (nextRoom?.id ?? null)) {
        nearRoomIdRef.current = nextRoom?.id ?? null;
        setNearbyRoom(nextRoom);
      }
      const nearId = nextNearby ? ("href" in nextNearby ? nextNearby.id : nextNearby.story?.title ?? `bench-${nextNearby.x}-${nextNearby.y}`) : null;
      if (nearIdRef.current !== nearId) {
        nearIdRef.current = nearId;
        setNearby(nextNearby);
      }
      canvas.dataset.playerX = playerRef.current.x.toFixed(3);
      canvas.dataset.playerY = playerRef.current.y.toFixed(3);
      canvas.dataset.cameraX = cameraRef.current.x.toFixed(2);
      canvas.dataset.facing = directionRef.current;
      canvas.dataset.sprinting = String(sprinting && walking);
      canvas.dataset.seated = String(Boolean(seated)||roomSitting);
      canvas.dataset.walkFrame = walking ? String(pose.frame) : "0";

      if (!room && miniCtx && (!mobile || mapOpen) && time - lastMini > 100) {
        renderNavigationMap(miniCtx, preview, playerRef.current, directionRef.current,
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
    climate?.season, enterRoom, exitRoom, discoveries, roomSitting, clearInput, menuOpen, mobile]);

  const handleMapClick = (event: {clientX: number; clientY: number}, touch = false) => {
    const canvas = canvasRef.current;
    if (!canvas || transitionRef.current || (mobile && (menuOpen || mapOpen || selected || selectedRoom))) return;
    const rect = canvas.getBoundingClientRect();
    const camera = snapCamera(cameraRef.current);
    const x = ((event.clientX - rect.left) / rect.width * canvas.width / roomScale + camera.x) / TILE;
    const y = ((event.clientY - rect.top) / rect.height * canvas.height / roomScale + camera.y) / TILE;
    if (room?.id === "study" && !studyGuest) {
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
        if (player.x + 0.3 > cellX && player.x - 0.3 < cellX + shape.width &&
            player.y + 0.3 > cellY && player.y - 0.3 < cellY + shape.height) {
          setStudyNotice("不能将家具放在角色脚下");
          return;
        }
        setStudyItems(items => canPlaceStudy(items, furniture) ? [...items, furniture] : items);
      }
      setStudyNotice("");
      return;
    }
    if (room) {
      const object = roomObjectAt(room, { x, y });
      if (object) {
        if (touch || mobile) interactRoom(object);
        else if (object.kind !== "exit" && (!object.community || roomInteractionDistance(room, object, playerRef.current) < 2.1)) selectRoomObject(object);
      }
      return;
    }
    const sprites = artIndexRef.current;
    const place = sprites && [...PLACES].sort((a,b) => b.y + b.height - a.y - a.height).find(p => {
      const bounds = buildingBounds(p, sprites);
      return x*TILE >= bounds.x && x*TILE < bounds.x+bounds.width && y*TILE >= bounds.y && y*TILE < bounds.y+bounds.height;
    });
    if (place) { if (touch || mobile) interactFeature(place); else selectPlace(place); }
    else {
      const story = closestStory({ x, y }) ?? (mobile ? closestBench({x,y}) : null);
      if (story) {
        if (touch || mobile) interactFeature(story);
        else if (discoveries.includes(story.story!.title) || Math.hypot(playerRef.current.x-story.x,playerRef.current.y-story.y)<2.8) selectPlace(story);
      }
    }
  };

  const handleTouchDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" || !mobile || transitionRef.current ||
        menuOpen || mapOpen || selected || selectedRoom || assetState !== "ready") return;
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
    if (seated) standUp();
  };
  const handleTouchMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = joystick.current;
    if (!active || active.pointer !== event.pointerId) {
      const start = tapPointers.current.get(event.pointerId);
      if (start && Math.hypot(event.clientX-start.x,event.clientY-start.y)>7) tapPointers.current.delete(event.pointerId);
      return;
    }
    const dx = event.clientX-active.startX, dy = event.clientY-active.startY;
    const distance = Math.hypot(dx,dy);
    if (distance > JOYSTICK_RADIUS*.15) active.moved = true;
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
      if (tap) handleMapClick(event, true);
    } else {
      const start = tapPointers.current.get(event.pointerId);
      tapPointers.current.delete(event.pointerId);
      if (start && event.type === "pointerup" && Math.hypot(event.clientX-start.x,event.clientY-start.y)<=7) handleMapClick(event, true);
    }
  };
  const handleNavigationClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (transitionRef.current) return;
    if (!mapOpen) { setMapOpen(true); return; }
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
          <select aria-label="时间模式" value={timeMode} onChange={event => {
            const mode=event.target.value as TimeMode;
            setTimeMode(mode); localStorage.setItem("pixel-jijia-time-mode",mode);
          }}><option value="actual">真实时间</option><option value="game">游戏时间</option></select>
          <select aria-label="天气模式" value={weatherMode} onChange={event => changeWeatherMode(event.target.value as WeatherMode)}>
            <option value="actual">长春实况</option>
            <option value="random">随机天气</option>
          </select>
          {weatherMode === "actual" && liveWeather && <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" title="当前天气来自 Open-Meteo 气象模型">Open-Meteo</a>}
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
            <><button type="button" className="pixel-world-tool" onClick={exitRoom}>返回户外</button>{mobile && <button type="button" className="pixel-world-tool" onClick={() => { clearInput(); setMapOpen(true); setMenuOpen(false); }}>图鉴</button>}</>
          ) : (
            <>
              <button type="button" className="pixel-world-tool" onClick={() => void openStudy()}>我的研究室</button>
              <button type="button" className="pixel-world-tool" aria-controls="pixel-world-map-panel"
                aria-expanded={mapOpen} onClick={() => { clearInput(); setMapOpen(open => !open); setMenuOpen(false); }}>地图 <kbd>M</kbd></button>
            </>
          )}
          <button type="button" className="pixel-world-tool" aria-expanded={showHelp}
            onClick={() => { clearInput(); setShowHelp(open => !open); setMenuOpen(false); }} aria-label="操作帮助">{mobile ? "操作帮助" : "?"}</button>
          {mobile && weatherControls}
          <Link to={returnTo === "/pixel-jijia" ? "/" : returnTo} className="pixel-world-return">{experienceReturnLabel(returnTo === "/pixel-jijia" ? "/" : returnTo)}</Link>
        </div>}
      </header>

      {(!room || (mobile && mapOpen)) && <aside id="pixel-world-map-panel" className={`pixel-world-map-panel ${mapOpen ? "is-open" : ""}`}
        aria-label="小镇导航地图">
        {mobile && <button type="button" className="pixel-world-tool" onClick={() => setMapOpen(false)}>关闭地图</button>}
        {!room && <><div className="pixel-world-map-caption"><span>吉甲地图</span><span>6 个区域 · {SCENERY.filter(p => p.story).length} 处发现</span></div>
        <canvas ref={miniRef} width={432} height={288} onClick={handleNavigationClick}
          aria-label="小镇真实世界缩略图，点击可展开查看或选择地标" role="img" />
        <div className="pixel-world-map-destinations" aria-label="建筑目的地">
          {PLACES.map(place => (
            <button type="button" key={place.id} onClick={() => { selectPlace(place); setMapOpen(false); }}>
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
                onClick={() => { selectPlace(item); setMapOpen(false); }}>{item.story!.title}</button>
            ))}
          </div>
        </details>
        <details className="pixel-world-map-discoveries">
          <summary>自然图鉴 · {natureDiscoveries.length}</summary>
          {natureDiscoveries.length?<div className="pixel-world-nature-log">{natureDiscoveries.join(" · ")}</div>:<div className="pixel-world-nature-log">观察动物或钓鱼后收录。</div>}
        </details>
        <details className="pixel-world-map-discoveries">
          <summary>共建图鉴 · {knownCommunity.length}/{communityObjects.length}</summary>
          <div className="pixel-world-map-discovery-list">
            {!knownCommunity.length && <span className="pixel-world-nature-log">探索校园中的共建物件。</span>}
            {knownCommunity.map(object => <button key={object.id} type="button" onClick={() => { selectRoomObject(object); setMapOpen(false); }}>{object.title}</button>)}
          </div>
        </details>
        {!room && <div className="pixel-world-zoom">
          <button type="button" aria-label="缩小地图" onClick={() => setMapZoom(zoomRef.current - 0.1)}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="放大地图" onClick={() => setMapZoom(zoomRef.current + 0.1)}>+</button>
        </div>}
      </aside>}
      {room && <div className="pixel-world-room-name">{room.title}</div>}
      {room?.id === "study" && !studyGuest && <div className="pixel-world-study-tools" role="group" aria-label="研究室家具布置">
        <select aria-label="选择家具或删除" value={studyTool}
          onChange={event => setStudyTool(event.target.value as StudyFurnitureKind | "erase")}>
          {Object.entries(STUDY_CATALOG).map(([kind, title]) =>
            <option value={kind} key={kind}>{title}</option>)}
          <option value="erase">移除家具</option>
        </select>
        <button type="button" disabled={studySaving} onClick={() => void saveStudy()}>保存布局</button>
        <button type="button" onClick={() => void createStudyInvite()}>邀请参观</button>
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
      {room?.id === "study" && studyGuest && <div className="pixel-world-study-guest">只读参观</div>}
      {studyNotice && <div className="pixel-world-study-notice" role="status">
        {studyNotice} {studyNotice.includes("未登录") && <Link to="/login">前往登录</Link>}
      </div>}
      {climate && <div className="pixel-world-climate" aria-label="长春时间与天气">
        <div className="pixel-world-weather-line" role="status">
          <span>{SEASON_LABEL[climate.season]}</span>
          <time>{String(climate.hour).padStart(2, "0")}:{String(climate.minute).padStart(2, "0")}</time>
          <span>{weatherMode === "random" ? WEATHER_LABEL[clock!.weather] : liveWeather?.label ?? (weatherLoading ? "更新中" : "天气不可用")}</span>
          {climate.temperature !== null && <span>{climate.temperature.toFixed(0)}°C</span>}
        </div>
        {!mobile && weatherControls}
      </div>}
      {showHelp && <div className="pixel-world-guide" role="note">
        {mobile ? "左下拖动 · 推远疾跑 · 靠近或点击交互" : "WASD / 方向键移动 · Shift 疾跑 · E 探索 · 滚轮缩放 · M 地图"}
      </div>}
      {!menuOpen && !(mobile && mapOpen) && !selected && !selectedRoom && room && nearbyRoom && (
        <button type="button" className="pixel-world-interact"
          onClick={() => interactRoom(nearbyRoom)}>
          <kbd>E</kbd> {mobile ? (nearbyRoom.kind === "exit" ? "离开" : ({ senior:"对话", meeting:"落座", drive:"驾驶", assembly:"组装", terminal:"使用", silverwolf:"使用" } as Record<string,string>)[nearbyRoom.community?.interaction ?? ""] ?? "查看") : nearbyRoom.title}
        </button>
      )}
      {!menuOpen&&!(mobile&&mapOpen)&&!room&&!selected&&!seated&&naturePrompt&&(!mobile||naturePrompt!=="等待鱼咬钩")&&<button type="button" className="pixel-world-interact"
        disabled={naturePrompt==="等待鱼咬钩"} onClick={interactNature}><kbd>E</kbd> {naturePrompt}</button>}
      {mobile && naturePrompt === "等待鱼咬钩" && !natureNotice && <div className="pixel-world-nature-notice" role="status">等待鱼咬钩</div>}
      {natureNotice&&<div className="pixel-world-nature-notice" role="status">{natureNotice}</div>}
      {!menuOpen && !(mobile && mapOpen) && !selected && seated && (
        <button type="button" className="pixel-world-interact" onClick={standUp}><kbd>E</kbd> 起身</button>
      )}
      {!menuOpen && !(mobile && mapOpen) && !room && !selected && !seated && !naturePrompt && nearby && (mobile || !("href" in nearby)) && (
        <button type="button" className="pixel-world-interact" onClick={() => mobile ? interactFeature(nearby) : selectPlace(nearby)}>
          <kbd>E</kbd> {mobile ? ("href" in nearby && ROOMS[nearby.id] ? "进入" : "查看") : "探索" + featureTitle(nearby)}
        </button>
      )}

      {selected && (
        <section className="pixel-world-detail" role="dialog" aria-label={featureTitle(selected)} aria-modal="false">
          <button ref={closeRef} className="pixel-world-detail-close" type="button" aria-label="关闭介绍" onClick={() => selectPlace(null)}>×</button>
          <div className="pixel-world-detail-content"><span className="pixel-world-detail-eyebrow">{"href" in selected ? selected.caption : selected.story?.caption}</span>
          <h1>{featureTitle(selected)}</h1>
          <p>{"href" in selected ? selected.description : selected.story?.description ?? "坐在这里，看看周围的风景。"}</p>
          {"sprite" in selected && selected.sprite === "bench" && !seated && (
            <button type="button" className="pixel-world-detail-link"
              disabled={Math.hypot(playerRef.current.x - selected.x, playerRef.current.y - selected.y) >= 2.5 || !benchExit(selected)}
              onClick={() => sitDown(selected)}>坐下</button>
          )}
          {"href" in selected && <Link to={selected.href} state={selected.href === "/pixel-jijia/battle" ? { experienceReturnTo: returnTo.startsWith("/dashboard") ? returnTo : "/pixel-jijia" } : undefined} className="pixel-world-detail-link">{selected.action}<span aria-hidden="true">↗</span></Link>}
          {"href" in selected && selected.id === "ai" && <Link to="/about" className="pixel-world-detail-secondary-link">认识 AI 组</Link>}
          {"story" in selected && selected.sprite !== "bench" && selected.story?.action && !storyActivated && (
            <button type="button" className="pixel-world-detail-link"
              onClick={() => setStoryActivated(true)}>{selected.story.action}</button>
          )}
          {"story" in selected && selected.story?.result && storyActivated && (
            <p className="pixel-world-story-result" role="status">{selected.story.result}</p>
          )}
        </div></section>
      )}
      {selectedRoom && <section className={`pixel-world-detail${selectedRoom.community ? " pixel-world-community-detail" : ""}`} role="dialog"
        aria-label={selectedRoom.title} aria-modal="false">
        <button type="button" className="pixel-world-detail-close" aria-label="关闭介绍"
          onClick={() => selectRoomObject(null)}>×</button>
        <div className="pixel-world-detail-content"><span className="pixel-world-detail-eyebrow">{selectedRoom.community ? "共建者的痕迹" : room?.title ?? "INDOOR SPACE"}</span>
        <h1>{selectedRoom.title}</h1>
        {selectedRoom.community ? <CommunityObjectDetail key={selectedRoom.id} object={selectedRoom} sitting={roomSitting}
          onSit={room?.id === "guild" && selectedRoom.id === "weekly-meeting" ? sitAtMeeting : undefined}
          returnTo={returnTo.startsWith("/dashboard") ? returnTo : "/pixel-jijia"} /> : <p>{selectedRoom.description}</p>}
        {selectedRoom.href && <Link to={selectedRoom.href} className="pixel-world-detail-link">
          {selectedRoom.action ?? "查看详情"}<span aria-hidden="true">↗</span>
        </Link>}
      </div></section>}
    </main>
  );
}
