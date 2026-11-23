import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/pixel-jijia-battle";
import { buildPublicMeta } from "~/lib/social-meta";
import { FIELD_HEIGHT, FIELD_WIDTH, MATCH_SECONDS, ROBOT_RADIUS,
  createBattle, orderMove, selectRobots, tickBattle, type Battle, type Point,
} from "~/lib/pixel-jijia-battle";
import { renderBattle } from "~/lib/pixel-jijia-battle-render";
import "./pixel-jijia-battle.css";

const PLAYER_IDS = ["tarsgo-infantry-1", "tarsgo-infantry-2"];
const LABELS: Record<string, string> = {
  "tarsgo-infantry-1": "步兵 1",
  "tarsgo-infantry-2": "步兵 2",
  "opponent-infantry-1": "敌方步兵 1",
  "opponent-infantry-2": "敌方步兵 2",
};

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "战术演练 | TARSGO",
    description: "在像素吉甲的战术演练场，指挥两台步兵进行 RoboMaster 2v2 战斗。",
    path: "/pixel-jijia/battle",
    image: "/assets/images/Social/home.jpg",
  });
}

export default function PixelJijiaBattlePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const battleRef = useRef<Battle>(createBattle());
  const [, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    let frame = 0, lastTime = 0, accumulated = 0, lastHud = 0;
    const loop = (time: number) => {
      if (document.visibilityState === "visible" && battleRef.current.phase === "playing") {
        accumulated += Math.min(0.12, lastTime ? (time - lastTime) / 1000 : 0);
        while (accumulated >= 1 / 60) {
          tickBattle(battleRef.current, 1 / 60);
          accumulated -= 1 / 60;
        }
      } else {
        accumulated = 0;
      }
      lastTime = time;
      renderBattle(ctx, battleRef.current);
      if (time - lastHud > 120) {
        lastHud = time;
        setRevision((value) => value + 1);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement &&
        event.target.closest("button, a, input, textarea, select")) return;
      if (event.key.toLowerCase() === "r") {
        battleRef.current = createBattle();
        refresh();
      } else if (event.key === "1" || event.key === "2") {
        selectRobots(battleRef.current, [PLAYER_IDS[Number(event.key) - 1]]);
        refresh();
      } else if (event.key.toLowerCase() === "a") {
        selectRobots(battleRef.current, PLAYER_IDS);
        refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * FIELD_WIDTH,
      y: (event.clientY - rect.top) / rect.height * FIELD_HEIGHT,
    };
  };

  const interact = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (battleRef.current.phase !== "playing") return;
    const point = pointAt(event);
    const hitRadius = event.pointerType === "touch" ? 40 : ROBOT_RADIUS + 12;
    const robot = battleRef.current.robots.find((unit) =>
      unit.team === "red" && unit.hp > 0 &&
      Math.hypot(unit.x - point.x, unit.y - point.y) < hitRadius);
    if (robot && event.button !== 2) {
      const next = event.shiftKey
        ? battleRef.current.selected.includes(robot.id)
          ? battleRef.current.selected.filter((id) => id !== robot.id)
          : [...battleRef.current.selected, robot.id]
        : [robot.id];
      selectRobots(battleRef.current, next);
    } else {
      orderMove(battleRef.current, point);
    }
    refresh();
  };

  const choose = (ids: string[]) => {
    selectRobots(battleRef.current, ids);
    refresh();
  };
  const reset = () => {
    battleRef.current = createBattle();
    refresh();
  };
  const current = battleRef.current;
  const ended = current.phase === "victory" || current.phase === "defeat" || current.phase === "draw";
  const result = current.phase === "victory" ? "演练胜利"
    : current.phase === "defeat" ? "演练失败" : "平局";
  const totalHp = (team: "red" | "blue") => current.robots
    .filter((robot) => robot.team === team).reduce((sum, robot) => sum + robot.hp, 0);

  return (
    <main className="pixel-battle">
      <header className="pixel-battle-header">
        <Link to="/pixel-jijia" className="pixel-battle-back">← 返回像素吉甲</Link>
        <span className="pixel-battle-title">战术演练 <small>TACTICAL TRAINING / 01</small></span>
        <span className="pixel-battle-mode">2 VS 2 · TRAINING V0</span>
      </header>

      <div className="pixel-battle-layout">
        <div className="pixel-battle-stage">
          <div className="pixel-battle-score">
            <div><span>吉甲战队</span><strong>{totalHp("red")} <small>/ 200 HP</small></strong></div>
            <div className="pixel-battle-clock">{Math.ceil(MATCH_SECONDS - current.seconds)}<small>秒</small></div>
            <div><span>训练对手</span><strong>{totalHp("blue")} <small>/ 200 HP</small></strong></div>
          </div>
          <canvas
            ref={canvasRef}
            width={FIELD_WIDTH}
            height={FIELD_HEIGHT}
            tabIndex={0}
            role="application"
            aria-label="2v2 像素战场。选择己方步兵后点击或触摸地面移动，桌面端支持右键移动与 Shift 多选。"
            onPointerDown={interact}
            onContextMenu={(event) => event.preventDefault()}
          />
          {current.phase === "ready" && (
            <div className="pixel-battle-overlay">
              <div className="pixel-battle-dialog">
                <small>TRAINING 01</small>
                <h1>步兵战术演练</h1>
                <p>指挥两台吉甲步兵，利用障碍绕行并自动攻击对手。消灭敌方全部单位即可获胜。</p>
                <button type="button" onClick={() => { current.phase = "playing"; refresh(); }}>
                  开始演练
                </button>
              </div>
            </div>
          )}
          {ended && (
            <div className="pixel-battle-overlay" role="status" aria-live="polite">
              <div className="pixel-battle-dialog">
                <small>MATCH COMPLETE</small>
                <h1>{result}</h1>
                <p>吉甲剩余 {totalHp("red")} HP · 对手剩余 {totalHp("blue")} HP · 用时 {Math.ceil(current.seconds)} 秒</p>
                <div className="pixel-battle-dialog-actions">
                  <button type="button" onClick={reset}>再战一次</button>
                  <Link to="/pixel-jijia">返回小镇</Link>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="pixel-battle-panel">
          <div className="pixel-battle-panel-heading">
            <small>YOUR SQUAD</small>
            <h2>吉甲作战单位</h2>
          </div>
          <div className="pixel-battle-units" role="group" aria-label="选择作战单位">
            {current.robots.filter((robot) => robot.team === "red").map((robot) => (
              <button
                type="button"
                key={robot.id}
                className={current.selected.includes(robot.id) ? "is-selected" : ""}
                disabled={robot.hp === 0 || ended}
                aria-pressed={current.selected.includes(robot.id)}
                onClick={() => choose([robot.id])}
              >
                <span className="pixel-battle-unit-icon" aria-hidden="true">▣</span>
                <span><strong>{LABELS[robot.id]}</strong><small>{robot.hp > 0 ? "可行动" : "已失效"}</small></span>
                <b>{robot.hp} HP</b>
              </button>
            ))}
          </div>
          <button type="button" className="pixel-battle-select-all" disabled={ended}
            onClick={() => choose(PLAYER_IDS)}>全选己方步兵</button>
          <div className="pixel-battle-instructions">
            <strong>操作方式</strong>
            <p>点击单位选择；点击战场空地移动。靠近敌方后会自动攻击。</p>
            <p>电脑可用右键下令、Shift 多选；按 1 / 2 选择步兵，A 全选。</p>
          </div>
          {current.phase === "playing" && (
            <button type="button" className="pixel-battle-restart" onClick={reset}>重新开始</button>
          )}
        </aside>
      </div>
      <p className="pixel-battle-footnote">改编自 TARS-Go Simulator 的 synthetic training-v0，非官方 RMUC 竞赛规则模拟。</p>
    </main>
  );
}
