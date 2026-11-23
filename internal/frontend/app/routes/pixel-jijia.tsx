import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia";
import { buildPublicMeta } from "~/lib/social-meta";
import {
  FOUNTAIN, GROUND_AREAS, PLACES, SCENERY, SPAWN, TILE, cameraAt, clampZoom, closestPlace, closestStory, movePlayer, snapCamera,
  type Direction, type Place, type Position, type Scenery,
} from "~/lib/pixel-jijia-world";
import { renderNavigationMap, renderParticles, renderScene, renderTerrain, type PixelParticle, type SpriteIndex } from "~/lib/pixel-jijia-scene";
import groundTilesUrl from "../assets/pixel-jijia/ground-tiles.png?url";
import plazaPropsUrl from "../assets/pixel-jijia/plaza-props.png?url";
import "./pixel-jijia.css";

const DEFAULT_ZOOM = 1.35;

type Feature = Place | Scenery;
const featureTitle = (feature: Feature) => "href" in feature ? feature.title : feature.story?.title ?? "发现";
const closestFeature = (position: Position): Feature | null => closestPlace(position) ?? closestStory(position);

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
  const characterRef = useRef<HTMLImageElement | null>(null);
  const artRef = useRef<HTMLImageElement | null>(null);
  const artIndexRef = useRef<SpriteIndex | null>(null);
  const propsRef = useRef<HTMLImageElement | null>(null);
  const nearIdRef = useRef<string | null>(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [mapOpen, setMapOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [assetState, setAssetState] = useState<"loading" | "ready" | "error">("loading");
  const [nearby, setNearby] = useState<Feature | null>(null);
  const [selected, setSelected] = useState<Feature | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const selectPlace = useCallback((place: Feature | null) => {
    selectedRef.current = place;
    keysRef.current.clear();
    touchRef.current.clear();
    sprintKeyRef.current = false;
    sprintTouchRef.current = false;
    setSelected(place);
  }, []);

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
    cameraRef.current = cameraAt(playerRef.current, width, height);
  }, []);

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
        terrainRef.current = renderTerrain(ground);
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
    if (selected) closeRef.current?.focus();
  }, [selected]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable=true]")) return;
      if (event.key === "Escape") {
        if (selectedRef.current) selectPlace(null);
        else { setMapOpen(false); setShowHelp(false); }
        return;
      }
      if (event.key === "Shift") {
        if (!selectedRef.current) sprintKeyRef.current = true;
        return;
      }
      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        setMapOpen(open => !open);
        return;
      }
      if (event.key.toLowerCase() === "e") {
        const place = closestFeature(playerRef.current);
        if (place) { event.preventDefault(); selectPlace(place); }
        return;
      }
      const dir = KEY_DIRECTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!dir || selectedRef.current) return;
      event.preventDefault();
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
      stop();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [selectPlace]);

  useEffect(() => {
    if (assetState !== "ready") return;
    const stage = stageRef.current, canvas = canvasRef.current;
    const minimap = miniRef.current, terrain = terrainRef.current;
    const character = characterRef.current;
    const atlas = artRef.current, sprites = artIndexRef.current, props = propsRef.current;
    if (!stage || !canvas || !terrain || !character || !atlas || !sprites || !props) return;
    const ctx = canvas.getContext("2d");
    const miniCtx = minimap?.getContext("2d");
    if (!ctx) return;
    let frame = 0, lastTime = 0, traveled = 0, lastMini = 0;
    let lastDust = 0, lastFountain = 0, lastPetal = 0;
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

      if ((x !== 0 || y !== 0) && !selectedRef.current) {
        const previous = playerRef.current;
        const next = movePlayer(previous, x, y, dt, sprinting);
        const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
        playerRef.current = next;
        directionRef.current = x !== 0 ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up");
        walking = distance > 0.0001;
        if (walking) traveled += distance;
      }
      const target = cameraAt(playerRef.current, canvas.width, canvas.height);
      const follow = 1 - Math.exp(-(sprinting ? 8 : 6) * dt);
      cameraRef.current.x += (target.x - cameraRef.current.x) * follow;
      cameraRef.current.y += (target.y - cameraRef.current.y) * follow;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      renderScene(ctx, terrain, atlas, sprites, props, character,
        playerRef.current, directionRef.current, walking, traveled, cameraRef.current);

      if (reducedMotion.matches) {
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
          const tree = cherryTrees.find((item) =>
            Math.hypot(playerRef.current.x - item.x, playerRef.current.y - item.y) < 16);
          if (tree) {
            emit({ x: tree.x * TILE + (Math.random() - 0.5) * 48,
              y: tree.y * TILE - 68, vx: 9, vy: 12,
              age: 0, ttl: 2.1, color: "#f7b6ce", size: 3 });
            lastPetal = time;
          }
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

      const nextNearby = closestFeature(playerRef.current);
      const nearId = nextNearby ? ("href" in nextNearby ? nextNearby.id : nextNearby.story?.title ?? null) : null;
      if (nearIdRef.current !== nearId) {
        nearIdRef.current = nearId;
        setNearby(nextNearby);
      }
      canvas.dataset.playerX = playerRef.current.x.toFixed(3);
      canvas.dataset.playerY = playerRef.current.y.toFixed(3);
      canvas.dataset.cameraX = cameraRef.current.x.toFixed(2);
      canvas.dataset.facing = directionRef.current;
      canvas.dataset.sprinting = String(sprinting && walking);
      canvas.dataset.walkFrame = walking ? String(Math.floor(traveled / 0.5) % 4) : "0";

      if (miniCtx && time - lastMini > 100) {
        renderNavigationMap(miniCtx, playerRef.current, directionRef.current,
          cameraRef.current, canvas.width, canvas.height);
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
  }, [assetState, resizeCanvas, setMapZoom]);

  const handleMapClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const camera = snapCamera(cameraRef.current);
    const x = ((event.clientX - rect.left) / rect.width * canvas.width + camera.x) / TILE;
    const y = ((event.clientY - rect.top) / rect.height * canvas.height + camera.y) / TILE;
    const place = PLACES.find((p) => x >= p.x && x < p.x + p.width && y >= p.y - 5 && y < p.y + p.height);
    if (place) selectPlace(place);
    else {
      const story = closestStory({ x, y });
      if (story) selectPlace(story);
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
        <div className="pixel-world-brand">
          <img src="/assets/images/Logo/tarsgo-robot-v5.svg" alt="" aria-hidden="true" />
          <span><strong>像素吉甲</strong><small>TARSGO · PIXEL WORLD</small></span>
        </div>
        <div className="pixel-world-top-actions">
          <button type="button" className="pixel-world-tool" aria-controls="pixel-world-map-panel"
            aria-expanded={mapOpen} onClick={() => setMapOpen(open => !open)}>地图 <kbd>M</kbd></button>
          <button type="button" className="pixel-world-tool" aria-expanded={showHelp}
            onClick={() => setShowHelp(open => !open)} aria-label="操作帮助">?</button>
          <Link to="/" className="pixel-world-return">返回官网</Link>
        </div>
      </header>

      <aside id="pixel-world-map-panel" className={`pixel-world-map-panel ${mapOpen ? "is-open" : ""}`}
        aria-label="小镇导航地图" aria-hidden={!mapOpen}>
        <div className="pixel-world-map-caption"><span>吉甲地图</span><span>建筑与发现</span></div>
        <canvas ref={miniRef} width={216} height={144}
          aria-label="小镇道路、建筑、故事地标、玩家朝向及当前视野" role="img" />
        <div className="pixel-world-zoom">
          <button type="button" aria-label="缩小地图" onClick={() => setMapZoom(zoomRef.current - 0.1)}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="放大地图" onClick={() => setMapZoom(zoomRef.current + 0.1)}>+</button>
        </div>
      </aside>
      {showHelp && <div className="pixel-world-guide" role="note">
        WASD / 方向键移动 · Shift 疾跑 · E 探索 · 滚轮缩放 · M 地图
      </div>}
      {!selected && nearby && (
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
              if (selectedRef.current) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              touchRef.current.add(direction);
            }}
            onPointerUp={() => touchRef.current.delete(direction)}
            onPointerCancel={() => touchRef.current.delete(direction)}
            onLostPointerCapture={() => touchRef.current.delete(direction)}
            onClick={(event) => {
              if (event.detail !== 0 || selectedRef.current) return;
              playerRef.current = movePlayer(playerRef.current,
                Number(direction === "right") - Number(direction === "left"),
                Number(direction === "down") - Number(direction === "up"), 0.05,
                sprintKeyRef.current || sprintTouchRef.current);
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
          <p>{"href" in selected ? selected.description : selected.story?.description}</p>
          {"href" in selected && <Link to={selected.href} className="pixel-world-detail-link">{selected.action}<span aria-hidden="true">↗</span></Link>}
        </section>
      )}
    </main>
  );
}
