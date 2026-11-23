import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia";
import { buildPublicMeta } from "~/lib/social-meta";
import {
  FOUNTAIN, GROUND_AREAS, PLACES, SCENERY, SPAWN, TILE, WORLD_HEIGHT, WORLD_WIDTH, benchExit, benchSeat, cameraAt, clampZoom, closestBench, closestPlace, closestStory, movePlayer, outdoorDoorAt, snapCamera,
  type Direction, type Place, type Position, type Scenery,
} from "~/lib/pixel-jijia-world";
import { renderNavigationMap, renderParticles, renderScene, renderTerrain, renderWorldPreview, type PixelParticle, type SpriteIndex } from "~/lib/pixel-jijia-scene";
import { ROOMS, STUDY_ROOM, closestRoomObject, isRoomWalkable, roomExitAt, renderRoomScene, renderRoomTerrain, type RoomObject } from "~/lib/pixel-jijia-room";
import { apiRequest } from "~/lib/api-client";
import { getCurrentUser } from "~/lib/auth-client";
import { STUDY_CATALOG, canPlaceStudy, furnitureSize, makeStudyRoom, type StudyFurniture, type StudyFurnitureKind } from "~/lib/pixel-jijia-study";
import { SEASON_LABEL, WEATHER_LABEL, changchunClimate, type ChangchunClimate } from "~/lib/pixel-jijia-climate";
import groundTilesUrl from "../assets/pixel-jijia/ground-tiles.png?url";
import plazaPropsUrl from "../assets/pixel-jijia/plaza-props.png?url";
import "./pixel-jijia.css";

const DEFAULT_ZOOM = 1.35;

type Feature = Place | Scenery;
const featureTitle = (feature: Feature) => "href" in feature ? feature.title : feature.story?.title ?? (feature.sprite === "bench" ? "石凳" : "发现");
const closestFeature = (position: Position): Feature | null => {
  const place = closestPlace(position);
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
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Position>({ ...SPAWN });
  const cameraRef = useRef<Position>({ x: 0, y: 0 });
  const directionRef = useRef<Direction>("down");
  const keysRef = useRef(new Set<Direction>());
  const touchRef = useRef(new Set<Direction>());
  const sprintKeyRef = useRef(false);
  const sprintTouchRef = useRef(false);
  const selectedRef = useRef<Feature | null>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const groundTilesRef = useRef<HTMLImageElement | null>(null);
  const roomTerrainRef = useRef<Record<string, HTMLCanvasElement>>({});
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const characterRef = useRef<HTMLImageElement | null>(null);
  const artRef = useRef<HTMLImageElement | null>(null);
  const artIndexRef = useRef<SpriteIndex | null>(null);
  const propsRef = useRef<HTMLImageElement | null>(null);
  const nearIdRef = useRef<string | null>(null);
  const nearRoomIdRef = useRef<string | null>(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [climate, setClimate] = useState<ChangchunClimate | null>(null);
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
  const [nearbyRoom, setNearbyRoom] = useState<RoomObject | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomObject | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const refresh = () => setClimate(changchunClimate(new Date()));
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const selectPlace = useCallback((place: Feature | null) => {
    selectedRef.current = place;
    keysRef.current.clear();
    touchRef.current.clear();
    sprintKeyRef.current = false;
    sprintTouchRef.current = false;
    setStoryActivated(false);
    setSelected(place);
  }, []);

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

  const enterRoom = useCallback((placeId: string) => {
    const destination = ROOMS[placeId];
    if (!destination || closestPlace(playerRef.current)?.id !== placeId) return;
    playerRef.current = { ...destination.entry };
    const canvas = canvasRef.current;
    if (canvas) cameraRef.current = cameraAt(destination.entry, canvas.width, canvas.height,
      destination.width * TILE, destination.height * TILE);
    setSeated(null);
    setRoomId(placeId);
    setSelectedRoom(null);
    setMapOpen(false);
    selectedRef.current = null;
    setSelected(null);
    setStoryActivated(false);
  }, []);

  const openStudy = useCallback(async (invitation?: string) => {
    setStudyNotice("");
    try {
      if (!invitation) await getCurrentUser();
      const data = await apiRequest<{
        furniture: StudyFurniture[]; inviteActive?: boolean;
      }>(invitation ? `/api/pixel-home/visit?token=${encodeURIComponent(invitation)}`
        : "/api/pixel-home/me", { cache: "no-store" });
      setStudyItems(data.furniture);
      setStudyHasInvite(Boolean(data.inviteActive));
      setStudyGuest(Boolean(invitation));
      setStudyInvite("");
      playerRef.current = { ...STUDY_ROOM.entry };
      const canvas = canvasRef.current;
      if (canvas) cameraRef.current = cameraAt(STUDY_ROOM.entry, canvas.width, canvas.height,
        STUDY_ROOM.width * TILE, STUDY_ROOM.height * TILE);
      keysRef.current.clear();
      touchRef.current.clear();
      setRoomId("study");
      setSelectedRoom(null);
      setMapOpen(false);
      selectPlace(null);
    } catch (error) {
      setStudyNotice(error instanceof Error ? error.message : "研究室无法打开");
    }
  }, [selectPlace]);

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
    if (roomId === "study") {
      playerRef.current = { ...SPAWN };
      const canvas = canvasRef.current;
      if (canvas) cameraRef.current = cameraAt(SPAWN, canvas.width, canvas.height);
      setRoomId(null);
      setSelectedRoom(null);
      setStudyGuest(false);
      if (window.location.search.includes("visit=")) window.history.replaceState(null, "", "/pixel-jijia");
      return;
    }
    const place = PLACES.find(p => p.id === roomId);
    if (!place) return;
    playerRef.current = { x: place.x + place.width / 2, y: place.y + place.height + 1.2 };
    const canvas = canvasRef.current;
    if (canvas) cameraRef.current = cameraAt(playerRef.current, canvas.width, canvas.height);
    setSelectedRoom(null);
    setRoomId(null);
  }, [roomId]);

  const resizeCanvas = useCallback(() => {
    const stage = stageRef.current, canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const value = clampZoom(zoomRef.current, stage.clientWidth, stage.clientHeight);
    if (value !== zoomRef.current) {
      zoomRef.current = value;
      setZoom(value);
    }
    const width = Math.max(1, Math.round(stage.clientWidth / value));
    const height = Math.max(1, Math.round(stage.clientHeight / value));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.imageSmoothingEnabled = false;
    cameraRef.current = cameraAt(playerRef.current, width, height,
      (room?.width ?? WORLD_WIDTH) * TILE, (room?.height ?? WORLD_HEIGHT) * TILE);
  }, [room]);

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
    const loadImage = (image: HTMLImageElement, source: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("像素图片加载失败"));
        image.src = source;
      });
    Promise.all([
      loadImage(atlas, "/assets/pixel-jijia/actual-imagegen-atlas.png"),
      loadImage(character, "/assets/pixel-jijia/explorer-4dir.png"),
      loadImage(groundTiles, groundTilesUrl),
      loadImage(props, plazaPropsUrl),
      fetch("/assets/pixel-jijia/actual-imagegen-atlas.json")
        .then((response) => {
          if (!response.ok) throw new Error("像素素材索引加载失败");
          return response.json() as Promise<{ sprites: SpriteIndex }>;
        }),
    ])
      .then(([image, explorer, ground, environment, metadata]) => {
        if (!active) return;
        if (ground.naturalWidth !== 384 || ground.naturalHeight !== 528) {
          throw new Error("地面图集与场景版本不匹配");
        }
        if (environment.naturalWidth !== 512 || environment.naturalHeight !== 384) {
          throw new Error("场景美术素材与当前版本不匹配");
        }
        characterRef.current = explorer;
        artRef.current = image;
        artIndexRef.current = metadata.sprites;
        propsRef.current = environment;
        groundTilesRef.current = ground;
        terrainRef.current = renderTerrain(ground, changchunClimate(new Date()).season);
        previewRef.current = renderWorldPreview(terrainRef.current, image, metadata.sprites, environment);
        roomTerrainRef.current = Object.fromEntries(
          Object.values(ROOMS).map(room => [room.id, renderRoomTerrain(room)]));
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
    };
  }, []);

  useEffect(() => {
    if (assetState !== "ready" || !climate || !groundTilesRef.current ||
        !artRef.current || !artIndexRef.current || !propsRef.current) return;
    terrainRef.current = renderTerrain(groundTilesRef.current, climate.season);
    previewRef.current = renderWorldPreview(terrainRef.current, artRef.current,
      artIndexRef.current, propsRef.current);
  }, [assetState, climate?.season]);

  useEffect(() => {
    if (selected) closeRef.current?.focus();
  }, [selected]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable=true]")) return;
      if (event.key === "Escape") {
        if (selectedRoom) setSelectedRoom(null);
        else if (selectedRef.current) selectPlace(null);
        else { setMapOpen(false); setShowHelp(false); }
        return;
      }
      if (event.key === "Shift") {
        if (!selectedRef.current) sprintKeyRef.current = true;
        return;
      }
      if (event.key.toLowerCase() === "m") {
        if (!room) { event.preventDefault(); setMapOpen(open => !open); }
        return;
      }
      if (event.key.toLowerCase() === "e") {
        if (selectedRoom) return;
        if (room) {
          const object = closestRoomObject(room, playerRef.current);
          if (object && object.kind !== "exit") {
            event.preventDefault();
            setSelectedRoom(object);
          }
          return;
        }
        if (seated) { event.preventDefault(); standUp(); return; }
        const place = closestFeature(playerRef.current);
        if (place) { event.preventDefault(); selectPlace(place); }
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
      keysRef.current.clear();
      touchRef.current.clear();
      sprintKeyRef.current = false;
      sprintTouchRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", stop);
    const hide = () => { if (document.visibilityState !== "visible") stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      // Keep held directions across room changes; blur/visibility still release them.
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [selectPlace, seated, standUp, room, selectedRoom, enterRoom, exitRoom]);

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
    const observer = new ResizeObserver(resizeCanvas);
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
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      lastTime = time;
      const held = (dir: Direction) => Number(keysRef.current.has(dir) || touchRef.current.has(dir));
      const x = held("right") - held("left");
      const y = held("down") - held("up");
      let walking = false;
      const sprinting = sprintKeyRef.current || sprintTouchRef.current;

      if ((x !== 0 || y !== 0) && !selectedRef.current && !selectedRoom && !seated) {
        const previous = playerRef.current;
        const next = movePlayer(previous, x, y, dt, sprinting,
          room ? (px, py) => isRoomWalkable(room, px, py) : undefined);
        const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
        playerRef.current = next;
        directionRef.current = x !== 0 ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up");
        walking = distance > 0.0001;
        if (walking) traveled += distance;
        // The door is a spatial threshold: walking into it changes scenes directly.
        // The room entry is placed behind its exit, so holding a direction is safe.
        if (room ? roomExitAt(room, next, y) : outdoorDoorAt(next, y)) {
          if (room) exitRoom();
          else {
            const door = outdoorDoorAt(next, y);
            if (door) enterRoom(door.id);
          }
          frame = requestAnimationFrame(tick);
          return;
        }
      }
      const target = cameraAt(playerRef.current, canvas.width, canvas.height,
        (room?.width ?? WORLD_WIDTH) * TILE, (room?.height ?? WORLD_HEIGHT) * TILE);
      const follow = 1 - Math.exp(-(sprinting ? 8 : 6) * dt);
      cameraRef.current.x += (target.x - cameraRef.current.x) * follow;
      cameraRef.current.y += (target.y - cameraRef.current.y) * follow;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      if (room && roomTerrain) {
        renderRoomScene(ctx, roomTerrain, room, character, playerRef.current,
          directionRef.current, walking, traveled, cameraRef.current);
      } else {
        renderScene(ctx, terrain, atlas, sprites, props, character,
          playerRef.current, directionRef.current, walking, traveled, cameraRef.current, Boolean(seated));
        if (climate?.night) {
          ctx.fillStyle = `rgba(13, 29, 55, ${climate.night})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }

      if (reducedMotion.matches || room) {
        particles.length = 0;
      } else {
        if (walking && sprinting && time - lastDust > 110) {
          const foot = playerRef.current;
          let surface = 0;
          for (let index = GROUND_AREAS.length - 1; index >= 0; index--) {
            const area = GROUND_AREAS[index];
            if (foot.x >= area.x && foot.x < area.x + area.width &&
                foot.y >= area.y && foot.y < area.y + area.height) {
              surface = area.kind;
              break;
            }
          }
          emit({ x: foot.x * TILE + (Math.random() - 0.5) * 12, y: foot.y * TILE - 3,
            vx: (Math.random() - 0.5) * 14, vy: -8, age: 0, ttl: 0.38,
            color: surface === 0 ? "#c4d69c" : "#e5d9bd", size: 2 });
          lastDust = time;
        }
        if (time - lastFountain > 220 &&
            Math.hypot(playerRef.current.x - FOUNTAIN.x, playerRef.current.y - FOUNTAIN.y) < 19) {
          emit({ x: FOUNTAIN.x * TILE + (Math.random() - 0.5) * 32,
            y: (FOUNTAIN.y - 1.25) * TILE, vx: (Math.random() - 0.5) * 14,
            vy: -14, age: 0, ttl: 0.58, color: "#a8effa", size: 2 });
          lastFountain = time;
        }
        if (time - lastPetal > 560) {
          lastPetal = time;
          const tree = cherryTrees.find((item) =>
            Math.hypot(playerRef.current.x - item.x, playerRef.current.y - item.y) < 16);
          if (tree) {
            emit({ x: tree.x * TILE + (Math.random() - 0.5) * 48,
              y: tree.y * TILE - 68, vx: 9, vy: 12,
              age: 0, ttl: 2.1, color: "#f7b6ce", size: 3 });
          }
        }
        if (climate && (climate.weather === "rain" || climate.weather === "snow") &&
            time - lastWeather > (climate.weather === "rain" ? 65 : 150)) {
          const snow = climate.weather === "snow";
          emit({ x: cameraRef.current.x + Math.random() * canvas.width,
            y: cameraRef.current.y - 6, vx: snow ? 4 : -20,
            vy: snow ? 24 : 140, age: 0, ttl: snow ? 4 : 1.4,
            color: snow ? "#f4f7ed" : "#a3d3e0", size: snow ? 3 : 2 });
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

      const nextNearby = seated || room ? null : closestFeature(playerRef.current);
      const object = room && !selectedRoom ? closestRoomObject(room, playerRef.current) : null;
      const nextRoom = object?.kind === "exit" ? null : object;
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
      canvas.dataset.seated = String(Boolean(seated));
      canvas.dataset.walkFrame = walking ? String(Math.floor(traveled / 0.5) % 4) : "0";

      if (!room && miniCtx && time - lastMini > 100) {
        renderNavigationMap(miniCtx, preview, playerRef.current, directionRef.current,
          cameraRef.current, canvas.width, canvas.height, mapOpen);
        lastMini = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [assetState, resizeCanvas, setMapZoom, seated, mapOpen, room, selectedRoom,
    climate?.season, climate?.weather, climate?.night, enterRoom, exitRoom]);

  const handleMapClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const camera = snapCamera(cameraRef.current);
    const x = ((event.clientX - rect.left) / rect.width * canvas.width + camera.x) / TILE;
    const y = ((event.clientY - rect.top) / rect.height * canvas.height + camera.y) / TILE;
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
      const object = closestRoomObject(room, { x, y });
      if (object && object.kind !== "exit") setSelectedRoom(object);
      return;
    }
    const place = PLACES.find((p) => x >= p.x && x < p.x + p.width && y >= p.y - 5 && y < p.y + p.height);
    if (place) selectPlace(place);
    else {
      const story = closestStory({ x, y });
      if (story) selectPlace(story);
    }
  };

  const handleNavigationClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mapOpen) { setMapOpen(true); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * WORLD_WIDTH;
    const y = (event.clientY - rect.top) / rect.height * WORLD_HEIGHT;
    const story = SCENERY.find(p => p.story && Math.hypot(x - p.x, y - p.y) < 2.8);
    const place = PLACES.find(p => x >= p.x && x <= p.x + p.width &&
      y >= p.y && y <= p.y + p.height);
    if (story || place) {
      selectPlace(story ?? place ?? null);
      setMapOpen(false);
    }
  };

  return (
    <main className="pixel-world">
      <div className="pixel-world-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="pixel-world-canvas"
          role="application"
          tabIndex={0}
          aria-label="像素吉甲小镇。WASD 或方向键连续移动，靠近建筑按 E，点击建筑查看介绍。"
          onClick={handleMapClick}
        />
        {assetState !== "ready" && (
          <div className="pixel-world-load" role="status">
            {assetState === "loading" ? "正在进入吉甲小镇…" : "地图加载失败，请刷新重试"}
          </div>
        )}
      </div>

      <header className="pixel-world-header">
        <div className="pixel-world-top-actions">
          {room ? (
            <button type="button" className="pixel-world-tool" onClick={exitRoom}>返回户外</button>
          ) : (
            <>
              <button type="button" className="pixel-world-tool" onClick={() => void openStudy()}>我的研究室</button>
              <button type="button" className="pixel-world-tool" aria-controls="pixel-world-map-panel"
                aria-expanded={mapOpen} onClick={() => setMapOpen(open => !open)}>地图 <kbd>M</kbd></button>
            </>
          )}
          <button type="button" className="pixel-world-tool" aria-expanded={showHelp}
            onClick={() => setShowHelp(open => !open)} aria-label="操作帮助">?</button>
          <Link to="/" className="pixel-world-return">返回官网</Link>
        </div>
      </header>

      {!room && <aside id="pixel-world-map-panel" className={`pixel-world-map-panel ${mapOpen ? "is-open" : ""}`}
        aria-label="小镇导航地图">
        <div className="pixel-world-map-caption"><span>吉甲地图</span><span>6 个区域 · {SCENERY.filter(p => p.story).length} 处发现</span></div>
        <canvas ref={miniRef} width={432} height={288} onClick={handleNavigationClick}
          aria-label="小镇真实世界缩略图，点击可展开查看或选择地标" role="img" />
        <div className="pixel-world-map-destinations" aria-label="建筑目的地">
          {PLACES.map(place => (
            <button type="button" key={place.id} onClick={() => { selectPlace(place); setMapOpen(false); }}>
              {place.title}
            </button>
          ))}
        </div>
        <details className="pixel-world-map-discoveries">
          <summary>探索发现 · {SCENERY.filter(p => p.story).length}</summary>
          <div className="pixel-world-map-discovery-list">
            {SCENERY.filter(p => p.story).map(item => (
              <button type="button" key={item.story!.title}
                onClick={() => { selectPlace(item); setMapOpen(false); }}>{item.story!.title}</button>
            ))}
          </div>
        </details>
        <div className="pixel-world-zoom">
          <button type="button" aria-label="缩小地图" onClick={() => setMapZoom(zoomRef.current - 0.1)}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="放大地图" onClick={() => setMapZoom(zoomRef.current + 0.1)}>+</button>
        </div>
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
      {climate && <div className="pixel-world-climate" role="status" aria-label="长春时间与游戏模拟天气">
        <span>{SEASON_LABEL[climate.season]}</span>
        <time>{String(climate.hour).padStart(2, "0")}:{String(climate.minute).padStart(2, "0")}</time>
        {!room && <span>{WEATHER_LABEL[climate.weather]} · 模拟</span>}
      </div>}
      {showHelp && <div className="pixel-world-guide" role="note">
        WASD / 方向键移动 · Shift 疾跑 · E 探索 · 滚轮缩放 · M 地图
      </div>}
      {!selectedRoom && room && nearbyRoom && (
        <button type="button" className="pixel-world-interact"
          onClick={() => setSelectedRoom(nearbyRoom)}>
          <kbd>E</kbd> {nearbyRoom.title}
        </button>
      )}
      {!selected && seated && (
        <button type="button" className="pixel-world-interact" onClick={standUp}><kbd>E</kbd> 起身</button>
      )}
      {!room && !selected && !seated && nearby && !("href" in nearby) && (
        <button type="button" className="pixel-world-interact" onClick={() => selectPlace(nearby)}>
          <kbd>E</kbd> 探索{featureTitle(nearby)} <span aria-hidden="true">↗</span>
        </button>
      )}

      <div className="pixel-world-dpad" role="group" aria-label="移动方向">
        {(["up", "left", "down", "right"] as Direction[]).map((direction) => (
          <button
            key={direction}
            type="button"
            aria-label={{ up: "向上走", down: "向下走", left: "向左走", right: "向右走" }[direction]}
            className={`pixel-world-dir pixel-world-dir--${direction}`}
            onPointerDown={(event) => {
              event.preventDefault();
              if (selectedRef.current || selectedRoom) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              touchRef.current.add(direction);
            }}
            onPointerUp={() => touchRef.current.delete(direction)}
            onPointerCancel={() => touchRef.current.delete(direction)}
            onLostPointerCapture={() => touchRef.current.delete(direction)}
            onClick={(event) => {
              if (event.detail !== 0 || selectedRef.current || selectedRoom) return;
              playerRef.current = movePlayer(playerRef.current,
                Number(direction === "right") - Number(direction === "left"),
                Number(direction === "down") - Number(direction === "up"), 0.05,
                sprintKeyRef.current || sprintTouchRef.current,
                room ? (x, y) => isRoomWalkable(room, x, y) : undefined);
            }}
          >{({ up: "▲", left: "◀", down: "▼", right: "▶" } as const)[direction]}</button>
        ))}
        <button type="button" className="pixel-world-sprint" aria-label="按住疾跑"
          onPointerDown={(event) => {
            event.preventDefault();
            if (selectedRef.current) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            sprintTouchRef.current = true;
          }}
          onPointerUp={() => { sprintTouchRef.current = false; }}
          onPointerCancel={() => { sprintTouchRef.current = false; }}
          onLostPointerCapture={() => { sprintTouchRef.current = false; }}
        >跑</button>
      </div>

      {selected && (
        <section className="pixel-world-detail" role="dialog" aria-label={featureTitle(selected)} aria-modal="false">
          <button ref={closeRef} className="pixel-world-detail-close" type="button" aria-label="关闭介绍" onClick={() => selectPlace(null)}>×</button>
          <span className="pixel-world-detail-eyebrow">{"href" in selected ? selected.caption : selected.story?.caption}</span>
          <h1>{featureTitle(selected)}</h1>
          <p>{"href" in selected ? selected.description : selected.story?.description ?? "坐在这里，看看周围的风景。"}</p>
          {"sprite" in selected && selected.sprite === "bench" && !seated && (
            <button type="button" className="pixel-world-detail-link"
              disabled={Math.hypot(playerRef.current.x - selected.x, playerRef.current.y - selected.y) >= 2.5 || !benchExit(selected)}
              onClick={() => sitDown(selected)}>坐下</button>
          )}
          {"href" in selected && <Link to={selected.href} className="pixel-world-detail-link">{selected.action}<span aria-hidden="true">↗</span></Link>}
          {"href" in selected && selected.id === "ai" && <Link to="/about" className="pixel-world-detail-secondary-link">认识 AI 组</Link>}
          {"story" in selected && selected.sprite !== "bench" && selected.story?.action && !storyActivated && (
            <button type="button" className="pixel-world-detail-link"
              onClick={() => setStoryActivated(true)}>{selected.story.action}</button>
          )}
          {"story" in selected && selected.story?.result && storyActivated && (
            <p className="pixel-world-story-result" role="status">{selected.story.result}</p>
          )}
        </section>
      )}
      {selectedRoom && <section className="pixel-world-detail" role="dialog"
        aria-label={selectedRoom.title} aria-modal="false">
        <button type="button" className="pixel-world-detail-close" aria-label="关闭介绍"
          onClick={() => setSelectedRoom(null)}>×</button>
        <span className="pixel-world-detail-eyebrow">{room?.title ?? "INDOOR SPACE"}</span>
        <h1>{selectedRoom.title}</h1>
        <p>{selectedRoom.description}</p>
        {selectedRoom.href && <Link to={selectedRoom.href} className="pixel-world-detail-link">
          {selectedRoom.action ?? "查看详情"}<span aria-hidden="true">↗</span>
        </Link>}
      </section>}
    </main>
  );
}
