import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia";
import { buildPublicMeta } from "~/lib/social-meta";
import {
  PLACES, SPAWN, TILE, WORLD_HEIGHT, WORLD_WIDTH, cameraAt, closestPlace, movePlayer,
  type Direction, type Place, type Position,
} from "~/lib/pixel-jijia-world";
import { renderExplorer, renderTown, type SpriteIndex } from "~/lib/pixel-jijia-scene";
import groundTilesUrl from "../assets/pixel-jijia/ground-tiles.png?url";
import "./pixel-jijia.css";

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
  const selectedRef = useRef<Place | null>(null);
  const townRef = useRef<HTMLCanvasElement | null>(null);
  const characterRef = useRef<HTMLImageElement | null>(null);
  const nearIdRef = useRef<string | null>(null);
  const zoomRef = useRef(1.9);
  const [zoom, setZoom] = useState(1.9);
  const [assetState, setAssetState] = useState<"loading" | "ready" | "error">("loading");
  const [nearby, setNearby] = useState<Place | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const selectPlace = useCallback((place: Place | null) => {
    selectedRef.current = place;
    keysRef.current.clear();
    touchRef.current.clear();
    setSelected(place);
  }, []);

  useEffect(() => {
    let active = true;
    const atlas = new Image();
    const character = new Image();
    const groundTiles = new Image();
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
      fetch("/assets/pixel-jijia/actual-imagegen-atlas.json")
        .then((response) => {
          if (!response.ok) throw new Error("像素素材索引加载失败");
          return response.json() as Promise<{ sprites: SpriteIndex }>;
        }),
    ])
      .then(([image, explorer, ground, metadata]) => {
        if (!active) return;
        if (ground.naturalWidth !== 384 || ground.naturalHeight !== 528) {
          throw new Error("地面图集与场景版本不匹配");
        }
        characterRef.current = explorer;
        townRef.current = renderTown(image, metadata.sprites, ground);
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
    };
  }, []);

  useEffect(() => {
    if (selected) closeRef.current?.focus();
  }, [selected]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable=true]")) return;
      if (event.key === "Escape") { selectPlace(null); return; }
      if (event.key.toLowerCase() === "e") {
        const place = closestPlace(playerRef.current);
        if (place) { event.preventDefault(); selectPlace(place); }
        return;
      }
      const dir = KEY_DIRECTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!dir || selectedRef.current) return;
      event.preventDefault();
      keysRef.current.add(dir);
    };
    const up = (event: KeyboardEvent) => {
      const dir = KEY_DIRECTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (dir) keysRef.current.delete(dir);
    };
    const stop = () => { keysRef.current.clear(); touchRef.current.clear(); };
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
    const minimap = miniRef.current, town = townRef.current;
    const character = characterRef.current;
    if (!stage || !canvas || !town || !character) return;
    const ctx = canvas.getContext("2d");
    const miniCtx = minimap?.getContext("2d");
    if (!ctx) return;
    let frame = 0, lastTime = 0, traveled = 0, lastMini = 0;

    const resize = () => {
      const scale = zoomRef.current;
      canvas.width = Math.max(1, Math.round(stage.clientWidth / scale));
      canvas.height = Math.max(1, Math.round(stage.clientHeight / scale));
      ctx.imageSmoothingEnabled = false;
      // Keep the player centered at the current position when the viewport changes.
      cameraRef.current = cameraAt(playerRef.current, canvas.width, canvas.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    cameraRef.current = cameraAt(playerRef.current, canvas.width, canvas.height);

    const tick = (time: number) => {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      lastTime = time;
      const held = (dir: Direction) => Number(keysRef.current.has(dir) || touchRef.current.has(dir));
      const x = held("right") - held("left");
      const y = held("down") - held("up");
      let walking = false;

      if ((x !== 0 || y !== 0) && !selectedRef.current) {
        const previous = playerRef.current;
        const next = movePlayer(previous, x, y, dt);
        const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
        playerRef.current = next;
        directionRef.current = x !== 0 ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up");
        walking = distance > 0.0001;
        if (walking) traveled += distance;
      }
      const target = cameraAt(playerRef.current, canvas.width, canvas.height);
      const follow = 1 - Math.exp(-6 * dt);
      cameraRef.current.x += (target.x - cameraRef.current.x) * follow;
      cameraRef.current.y += (target.y - cameraRef.current.y) * follow;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(town, -Math.round(cameraRef.current.x), -Math.round(cameraRef.current.y));
      renderExplorer(ctx, character, playerRef.current, directionRef.current, walking, traveled, cameraRef.current);

      const nextNearby = closestPlace(playerRef.current);
      if (nearIdRef.current !== (nextNearby?.id ?? null)) {
        nearIdRef.current = nextNearby?.id ?? null;
        setNearby(nextNearby);
      }
      canvas.dataset.playerX = playerRef.current.x.toFixed(3);
      canvas.dataset.playerY = playerRef.current.y.toFixed(3);
      canvas.dataset.cameraX = cameraRef.current.x.toFixed(2);
      canvas.dataset.facing = directionRef.current;
      canvas.dataset.walkFrame = walking ? String(Math.floor(traveled / 0.5) % 4) : "0";

      if (miniCtx && minimap && time - lastMini > 100) {
        miniCtx.imageSmoothingEnabled = true;
        miniCtx.clearRect(0, 0, minimap.width, minimap.height);
        miniCtx.drawImage(town, 0, 0, minimap.width, minimap.height);
        miniCtx.fillStyle = "#fff4c6";
        const tx = playerRef.current.x / WORLD_WIDTH * minimap.width;
        const ty = playerRef.current.y / WORLD_HEIGHT * minimap.height;
        miniCtx.fillRect(tx - 3, ty - 3, 7, 7);
        miniCtx.fillStyle = "#2a5549";
        miniCtx.fillRect(tx - 1, ty - 1, 3, 3);
        lastMini = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [assetState, zoom]);

  const setMapZoom = (next: number) => {
    const value = Math.min(3.2, Math.max(1.65, Math.round(next * 20) / 20));
    zoomRef.current = value;
    setZoom(value);
  };

  const handleMapClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width * canvas.width + cameraRef.current.x) / TILE;
    const y = ((event.clientY - rect.top) / rect.height * canvas.height + cameraRef.current.y) / TILE;
    const place = PLACES.find((p) => x >= p.x && x < p.x + p.width && y >= p.y - 5 && y < p.y + p.height);
    if (place) selectPlace(place);
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
        <Link to="/" className="pixel-world-brand" aria-label="返回吉甲大师官网">
          <img src="/assets/images/Logo/tarsgo-robot-v5.svg" alt="" aria-hidden="true" />
          <span><strong>像素吉甲</strong><small>TARSGO · PIXEL WORLD</small></span>
        </Link>
        <span className="pixel-world-header-location">吉甲小镇 / 探索模式</span>
        <Link to="/" className="pixel-world-return">返回官网 <span aria-hidden="true">↗</span></Link>
      </header>

      <aside className="pixel-world-map-panel" aria-label="小镇地图">
        <div className="pixel-world-map-caption"><span>吉甲地图</span><span>MAP · 01</span></div>
        <canvas ref={miniRef} width={196} height={130} aria-label="小镇鸟瞰地图，黄色光点表示你的当前位置" role="img" />
        <div className="pixel-world-zoom">
          <button type="button" aria-label="缩小地图" onClick={() => setMapZoom(zoom - 0.25)}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="放大地图" onClick={() => setMapZoom(zoom + 0.25)}>+</button>
        </div>
      </aside>

      <div className="pixel-world-hud" role="status" aria-live="polite">
        <span className="pixel-world-hud-sun" aria-hidden="true">✦</span>
        <div><strong>{nearby?.title ?? "吉甲中央广场"}</strong><span>{nearby?.caption ?? "WELCOME TO TARSGO"}</span></div>
      </div>
      {!selected && nearby && (
        <button type="button" className="pixel-world-interact" onClick={() => selectPlace(nearby)}>
          <kbd>E</kbd> 探索{nearby.title} <span aria-hidden="true">↗</span>
        </button>
      )}
      <div className="pixel-world-help">WASD / 方向键移动 · 靠近建筑按 E 或点击建筑</div>

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
                Number(direction === "down") - Number(direction === "up"), 0.05);
            }}
          >{({ up: "▲", left: "◀", down: "▼", right: "▶" } as const)[direction]}</button>
        ))}
      </div>

      {selected && (
        <section className="pixel-world-detail" role="dialog" aria-label={selected.title} aria-modal="false">
          <button ref={closeRef} className="pixel-world-detail-close" type="button" aria-label="关闭介绍" onClick={() => selectPlace(null)}>×</button>
          <span className="pixel-world-detail-eyebrow">{selected.caption}</span>
          <h1>{selected.title}</h1>
          <p>{selected.description}</p>
          <Link to={selected.href} className="pixel-world-detail-link">{selected.action}<span aria-hidden="true">↗</span></Link>
        </section>
      )}
    </main>
  );
}
