import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia";
import { Navbar } from "~/components/navbar";
import { PublicFooter } from "~/components/public-footer";
import { buildPublicMeta } from "~/lib/social-meta";
import {
  PLACES, TREES, WORLD_HEIGHT, WORLD_WIDTH,
  cameraAt, closestPlace, isPath, isWalkable,
  type Direction, type Place, type Position,
} from "~/lib/pixel-jijia-world";
import "./pixel-jijia.css";

const TILE = 16;
const SPRITE_PATH = "/assets/pixel-jijia/tiles.png";

type Player = Position & { direction: Direction; step: number };
type View = { columns: number; rows: number };

const initialPlayer: Player = { x: 20, y: 15, direction: "down", step: 0 };

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "像素吉甲 | TARSGO",
    description: "探索吉甲大师的像素小镇：机械工坊、电控实验室、视觉观测站、AI 研究所、荣誉殿堂和冒险者公会。",
    path: "/pixel-jijia",
    image: "/assets/images/Social/home.jpg",
  });
}

function drawTile(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement,
  col: number, row: number, x: number, y: number,
) {
  ctx.drawImage(atlas, col * TILE, row * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, x: number, y: number) {
  const px = x * TILE;
  const py = y * TILE;
  const sway = player.step % 2;
  // A small custom explorer avatar in the same 16-pixel grid as the CC0 tiles.
  ctx.fillStyle = "rgba(30,55,34,.28)";
  ctx.fillRect(px + 3, py + 13, 11, 3);
  ctx.fillStyle = "#273345";
  ctx.fillRect(px + 4, py + 0, 8, 4);
  ctx.fillRect(px + 3, py + 3, 10, 3);
  ctx.fillStyle = "#efc08a";
  ctx.fillRect(px + 5, py + 4, 6, 5);
  ctx.fillStyle = "#26323d";
  if (player.direction !== "up") {
    ctx.fillRect(px + (player.direction === "left" ? 5 : 9), py + 6, 1, 1);
  }
  ctx.fillStyle = "#c6994c";
  ctx.fillRect(px + 4, py + 9, 8, 4);
  ctx.fillStyle = "#37546b";
  ctx.fillRect(px + 5, py + 12, 3, 2 + sway);
  ctx.fillRect(px + 9, py + 12, 3, 3 - sway);
  ctx.fillStyle = "#2d2827";
  ctx.fillRect(px + 5, py + 14 + sway, 3, 2 - sway);
  ctx.fillRect(px + 9, py + 15 - sway, 3, 1 + sway);
}

function drawPlace(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, place: Place, camera: Position) {
  const x = place.x - camera.x;
  const y = place.y - camera.y;

  for (let row = 0; row < place.height; row++) {
    for (let col = 0; col < place.width; col++) {
      if (place.building === "castle") {
        // Stretch a single stone-roofed hall rather than joining unrelated atlas wall fragments.
        const sourceCol = col === 0 ? 0 : col === place.width - 1 ? 3 : row === 2 && col === 3 ? 2 : 1;
        drawTile(ctx, atlas, sourceCol, row < 2 ? 4 + row : 6, x + col, y + row);
      } else {
        const base = place.building === "red" ? 4 : 0;
        const sourceRow = row < 2 ? 4 + row : 6;
        drawTile(ctx, atlas, base + col, sourceRow, x + col, y + row);
      }
    }
  }

  const labelWidth = Math.max(70, place.title.length * 12 + 12);
  const labelX = Math.round((x + place.width / 2) * TILE - labelWidth / 2);
  const labelY = Math.round((y + place.height) * TILE + 4);
  ctx.fillStyle = "#203c35";
  ctx.fillRect(labelX, labelY, labelWidth, 18);
  ctx.fillStyle = "#e1c58c";
  ctx.fillRect(labelX + 2, labelY + 2, labelWidth - 4, 1);
  ctx.fillStyle = "#fff5db";
  ctx.textAlign = "center";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillText(place.title, labelX + labelWidth / 2, labelY + 13);
  ctx.textAlign = "start";
}

function paintWorld(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, player: Player, view: View) {
  const camera = cameraAt(player, view.columns, view.rows);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#82bf6c";
  ctx.fillRect(0, 0, view.columns * TILE, view.rows * TILE);

  for (let y = 0; y < view.rows; y++) {
    for (let x = 0; x < view.columns; x++) {
      const wx = x + camera.x;
      const wy = y + camera.y;
      const scatter = (wx * 47 + wy * 29 + wx * wy * 13) % 23;
      drawTile(ctx, atlas, scatter === 0 ? 2 : scatter < 6 ? 1 : 0, 0, x, y);
      if (isPath(wx, wy)) {
        const col = !isPath(wx - 1, wy) ? 0 : !isPath(wx + 1, wy) ? 2 : 1;
        const row = !isPath(wx, wy - 1) ? 1 : !isPath(wx, wy + 1) ? 3 : 2;
        drawTile(ctx, atlas, col, row, x, y);
      }
    }
  }

  // Stone details make the central meeting square distinct from the sandy paths.
  for (let y = 11; y <= 16; y++) {
    for (let x = 17; x <= 22; x++) {
      if ((x + y) % 3 !== 0) continue;
      drawTile(ctx, atlas, 7, 3, x - camera.x, y - camera.y);
    }
  }

  for (const tree of TREES) {
    const c = (tree.x + tree.y) % 5 === 0 ? 3 : 4;
    for (let row = 0; row < 2; row++) {
      drawTile(ctx, atlas, c, row, tree.x - camera.x, tree.y + row - camera.y);
    }
  }

  for (const place of PLACES) drawPlace(ctx, atlas, place, camera);

  // The meeting square's little well.
  drawTile(ctx, atlas, 8, 8, 19 - camera.x, 12 - camera.y);
  drawPlayer(ctx, player, player.x - camera.x, player.y - camera.y);
}

const DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function getView(): View {
  if (typeof window !== "undefined" && window.innerWidth < 640) return { columns: 23, rows: 21 };
  if (typeof window !== "undefined" && window.innerWidth < 990) return { columns: 32, rows: 24 };
  return { columns: WORLD_WIDTH, rows: WORLD_HEIGHT };
}

export default function PixelJijiaPage() {
  const [player, setPlayer] = useState<Player>(initialPlayer);
  const [view, setView] = useState<View>({ columns: WORLD_WIDTH, rows: WORLD_HEIGHT });
  const [selected, setSelected] = useState<Place | null>(null);
  const [assetState, setAssetState] = useState<"loading" | "ready" | "error">("loading");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atlasRef = useRef<HTMLImageElement | null>(null);
  const repeatRef = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const nearby = closestPlace(player);

  useEffect(() => {
    const update = () => setView(getView());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const atlas = new Image();
    atlas.onload = () => { atlasRef.current = atlas; setAssetState("ready"); };
    atlas.onerror = () => setAssetState("error");
    atlas.src = SPRITE_PATH;
    return () => { atlas.onload = null; atlas.onerror = null; };
  }, []);

  useEffect(() => {
    if (assetState !== "ready" || !atlasRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = view.columns * TILE;
    canvas.height = view.rows * TILE;
    const ctx = canvas.getContext("2d");
    if (ctx) paintWorld(ctx, atlasRef.current, player, view);
  }, [assetState, player, view]);

  useEffect(() => {
    if (selected) closeRef.current?.focus();
  }, [selected]);

  const move = useCallback((direction: Direction) => {
    setPlayer((previous) => {
      const delta = DELTAS[direction];
      const x = previous.x + delta.x;
      const y = previous.y + delta.y;
      if (!isWalkable(x, y)) return { ...previous, direction };
      return { x, y, direction, step: previous.step + 1 };
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Escape") { setSelected(null); return; }
      if (event.key.toLowerCase() === "e" && nearby) { event.preventDefault(); setSelected(nearby); return; }
      const keys: Record<string, Direction> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
      };
      const direction = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!direction || selected) return;
      event.preventDefault();
      move(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, nearby, selected]);

  useEffect(() => () => { if (repeatRef.current !== null) window.clearInterval(repeatRef.current); }, []);

  const stopRepeating = () => {
    if (repeatRef.current !== null) window.clearInterval(repeatRef.current);
    repeatRef.current = null;
  };

  const startMoving = (direction: Direction) => {
    if (selected) return;
    stopRepeating();
    move(direction);
    repeatRef.current = window.setInterval(() => move(direction), 140);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const camera = cameraAt(player, view.columns, view.rows);
    const x = Math.floor((event.clientX - rect.left) / rect.width * view.columns) + camera.x;
    const y = Math.floor((event.clientY - rect.top) / rect.height * view.rows) + camera.y;
    const place = PLACES.find((item) => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height);
    if (place) setSelected(place);
  };

  return (
    <div className="pixel-town-page">
      <Navbar />
      <main className="pixel-town-shell">
        <header className="pixel-town-header">
          <div>
            <span className="pixel-town-eyebrow">TARSGO / PIXEL WORLD</span>
            <h1>像素吉甲<span className="pixel-town-title-dot">.</span></h1>
            <p>一座可以走进去的吉甲小镇。</p>
          </div>
          <Link to="/" className="pixel-town-home-link">返回官网 <span aria-hidden="true">↗</span></Link>
        </header>
        <section className="pixel-town-game" aria-label="像素吉甲互动地图">
          <div className="pixel-town-status">
            <span className="pixel-town-status-dot" />
            <span>{nearby ? `附近 · ${nearby.title}` : "中央广场"}</span>
            <span className="pixel-town-coordinate">{String(player.x).padStart(2, "0")} : {String(player.y).padStart(2, "0")}</span>
          </div>
          <div className="pixel-town-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="pixel-town-canvas"
              width={WORLD_WIDTH * TILE}
              height={WORLD_HEIGHT * TILE}
              role="application"
              aria-label="像素小镇地图。使用方向键或 WASD 移动，靠近建筑按 E 互动，也可点击建筑。"
              tabIndex={0}
              onClick={handleCanvasClick}
            />
            {assetState !== "ready" ? (
              <div className="pixel-town-loading" role="status">
                {assetState === "error" ? "地图素材加载失败，请刷新页面重试。" : "地图加载中…"}
              </div>
            ) : null}
            <div className="pixel-town-dpad" role="group" aria-label="移动方向">
              {(["up", "left", "down", "right"] as Direction[]).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  className={`pixel-town-direction pixel-town-direction--${direction}`}
                  aria-label={{ up: "向上走", left: "向左走", down: "向下走", right: "向右走" }[direction]}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    startMoving(direction);
                  }}
                  onPointerUp={stopRepeating}
                  onPointerCancel={stopRepeating}
                  onLostPointerCapture={stopRepeating}
                  onClick={(event) => { if (event.detail === 0) move(direction); }}
                >
                  {({ up: "▲", left: "◀", down: "▼", right: "▶" } as const)[direction]}
                </button>
              ))}
            </div>
            {selected ? (
              <div className="pixel-town-place" role="dialog" aria-modal="false" aria-label={selected.title}>
                <button ref={closeRef} type="button" className="pixel-town-place-close" onClick={() => setSelected(null)} aria-label="关闭介绍">×</button>
                <span>{selected.caption}</span>
                <h2>{selected.title}</h2>
                <p>{selected.description}</p>
                <Link to={selected.href} className="pixel-town-place-link">{selected.action} <span aria-hidden="true">↗</span></Link>
              </div>
            ) : null}
          </div>
          <div className="pixel-town-bottom">
            <span className="pixel-town-desktop-help">WASD / 方向键移动 · 靠近建筑按 E 进入</span>
            <span className="pixel-town-mobile-help">方向键移动 · 点按建筑查看</span>
            <span>{PLACES.length} 个地点可以探索</span>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
