import { useId, useState, type ReactNode } from "react";
import {
  AVATAR_FRAMES,
  isAvatarFrameUnlocked,
  resolveEquippedAvatarFrame,
  type AvatarFrameChoice,
  type AvatarFrameContext,
  type AvatarFrameId,
  type AvatarFrameTrack,
} from "~/lib/avatar-frames";
import "./avatar-frame.css";

export type AvatarFrameTier = "hero" | "card" | "compact";

/* ===== Precision CNC SVG Micro-Primitives (200x200 coordinate space, avatar r=66.67) ===== */

function RadialTicks({
  count,
  r1,
  r2,
  majorEvery = 0,
  majorR1,
  stroke,
  majorStroke,
  opacity = 0.72,
}: {
  count: number;
  r1: number;
  r2: number;
  majorEvery?: number;
  majorR1?: number;
  stroke: string;
  majorStroke?: string;
  opacity?: number;
}) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const angle = (i * 360) / count;
    const isMajor = majorEvery > 0 && i % majorEvery === 0;
    const rad = ((angle - 90) * Math.PI) / 180;
    const inner = isMajor && majorR1 !== undefined ? majorR1 : r1;
    const x1 = +(100 + Math.cos(rad) * inner).toFixed(2);
    const y1 = +(100 + Math.sin(rad) * inner).toFixed(2);
    const x2 = +(100 + Math.cos(rad) * r2).toFixed(2);
    const y2 = +(100 + Math.sin(rad) * r2).toFixed(2);
    items.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={isMajor && majorStroke ? majorStroke : stroke}
        strokeWidth={isMajor ? 1.35 : 0.75}
        strokeLinecap="round"
        opacity={isMajor ? Math.min(1, opacity + 0.25) : opacity}
      />,
    );
  }
  return <g>{items}</g>;
}

function MicroRivet({ cx, cy, gold = true }: { cx: number; cy: number; gold?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="2.2" fill="#0A0E0D" stroke={gold ? "#9A722B" : "#4A5956"} strokeWidth="0.65" />
      <circle cx={cx} cy={cy} r="1.1" fill={gold ? "#E8C87A" : "#9BA8A5"} />
      <circle cx={cx - 0.35} cy={cy - 0.35} r="0.4" fill="#FFFBF0" />
    </g>
  );
}

function FacetedGem({
  cx,
  cy,
  rx,
  ry,
  light,
  mid,
  dark,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  light: string;
  mid: string;
  dark: string;
}) {
  return (
    <g>
      <polygon points={`${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy}`} fill={light} />
      <polygon points={`${cx},${cy - ry} ${cx - rx},${cy} ${cx},${cy}`} fill={mid} />
      <polygon points={`${cx},${cy + ry} ${cx + rx},${cy} ${cx},${cy}`} fill={mid} />
      <polygon points={`${cx},${cy + ry} ${cx - rx},${cy} ${cx},${cy}`} fill={dark} />
      <polygon
        points={`${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}`}
        fill="none"
        stroke="#FFF8DC"
        strokeWidth="0.7"
        opacity="0.9"
      />
    </g>
  );
}

function PrecisionInnerBezel({ strokeUrl }: { strokeUrl: string }) {
  return (
    <g>
      {/* Recessed dark shadow ring immediately around avatar */}
      <circle cx="100" cy="100" r="65.8" fill="none" stroke="#060908" strokeWidth="1.6" opacity="0.85" />
      {/* Raised metallic inner lip */}
      <circle cx="100" cy="100" r="67.2" fill="none" stroke={strokeUrl} strokeWidth="2.1" />
      {/* Hairline upper-left specular glint */}
      <path
        d="M52.5 52.5 A67.2 67.2 0 0 1 147.5 52.5"
        fill="none"
        stroke="#FFFBF0"
        strokeWidth="0.75"
        opacity="0.78"
      />
    </g>
  );
}

function FrameGraphic({
  frameId,
  tier,
  badgeLevel,
  seasonYear = 2026,
}: {
  frameId: AvatarFrameId;
  tier: AvatarFrameTier;
  badgeLevel?: "none" | "bronze" | "silver" | "gold";
  seasonYear?: number;
}) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, "");
  const isCompact = tier === "compact";
  const isHero = tier === "hero";

  // Compact mode (<=36px comment avatars): ultra-clean signature ring only
  if (isCompact) {
    const stroke =
      frameId === "reactor"
        ? "var(--frame-cyan)"
        : frameId === "overclock"
          ? "var(--frame-amber)"
          : frameId === "rm_league"
            ? "#ff5a5f"
            : frameId === "rm_regional"
              ? "#4da3ff"
              : "var(--admin-accent)";
    return (
      <svg className="tarsgo-av-frame__front" viewBox="0 0 100 100" aria-hidden="true">
        {frameId === "titan" || frameId === "laurel" || frameId === "rm_regional" || frameId === "rm_national" ? (
          <polygon
            points="30,4 70,4 96,30 96,70 70,96 30,96 4,70 4,30"
            fill="none"
            stroke={stroke}
            strokeWidth={frameId === "rm_national" ? "5.2" : "4.2"}
          />
        ) : frameId === "hawkeye" || frameId === "rm_league" ? (
          <path
            d="M27 6 H10 Q6 6 6 10 V27 M73 6 H90 Q94 6 94 10 V27 M27 94 H10 Q6 94 6 90 V73 M73 94 H90 Q94 94 94 90 V73"
            fill="none"
            stroke={stroke}
            strokeWidth="5.2"
            strokeLinecap="round"
          />
        ) : (
          <circle cx="50" cy="50" r="46" fill="none" stroke={stroke} strokeWidth="4.4" />
        )}
      </svg>
    );
  }

  const lp =
    badgeLevel === "bronze"
      ? ["#FFE1C8", "#D69160", "#7D4924", "#F5BC93"]
      : badgeLevel === "silver"
        ? ["#FFFFFF", "#C8D2D9", "#5C6870", "#E8EEF2"]
        : ["#FFF9E0", "#E5C170", "#7A581B", "#F6DA92"];

  const commonDefs = (
    <defs>
      {/* Brushed champagne gold (multi-stop specular) */}
      <linearGradient id={`gold-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF9E2" />
        <stop offset="22%" stopColor="#EED089" />
        <stop offset="48%" stopColor="#B48735" />
        <stop offset="70%" stopColor="#725117" />
        <stop offset="88%" stopColor="#EAC97D" />
        <stop offset="100%" stopColor="#FFF3C9" />
      </linearGradient>
      {/* Reverse brushed gold for counter-bevel contrast */}
      <linearGradient id={`gold2-${uid}`} x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#7A571A" />
        <stop offset="45%" stopColor="#E6C374" />
        <stop offset="100%" stopColor="#FFF7D6" />
      </linearGradient>
      {/* CNC anodized dark titanium chassis */}
      <linearGradient id={`armor-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#43524F" />
        <stop offset="32%" stopColor="#232D2B" />
        <stop offset="68%" stopColor="#121817" />
        <stop offset="100%" stopColor="#293432" />
      </linearGradient>
      <linearGradient id={`laurel-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={lp[0]} />
        <stop offset="36%" stopColor={lp[1]} />
        <stop offset="70%" stopColor={lp[2]} />
        <stop offset="100%" stopColor={lp[3]} />
      </linearGradient>
      <linearGradient id={`plasma-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#94FFF0" />
        <stop offset="45%" stopColor="#5CE6D0" />
        <stop offset="80%" stopColor="#F4D78B" />
        <stop offset="100%" stopColor="#FFF9E0" />
      </linearGradient>
      <linearGradient id={`fire-${uid}`} x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#FF5E2B" />
        <stop offset="48%" stopColor="#FFAE42" />
        <stop offset="82%" stopColor="#F6D585" />
        <stop offset="100%" stopColor="#FFF8DC" />
      </linearGradient>
      <linearGradient id={`ai-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#DDD6FE" />
        <stop offset="38%" stopColor="#A78BFA" />
        <stop offset="72%" stopColor="#6CECD8" />
        <stop offset="100%" stopColor="#F0D084" />
      </linearGradient>
      <linearGradient id={`rmred-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF8585" />
        <stop offset="35%" stopColor="#E63946" />
        <stop offset="72%" stopColor="#F0C066" />
        <stop offset="100%" stopColor="#9C1D24" />
      </linearGradient>
      <linearGradient id={`rmdual-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#4DA3FF" />
        <stop offset="44%" stopColor="#9BD1FF" />
        <stop offset="50%" stopColor="#FFF6D6" />
        <stop offset="56%" stopColor="#FF9699" />
        <stop offset="100%" stopColor="#FF4757" />
      </linearGradient>
      <linearGradient id={`sweep-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#D0AD69" stopOpacity="0" />
        <stop offset="100%" stopColor="#FFF4CC" stopOpacity="0.34" />
      </linearGradient>
    </defs>
  );

  // ===== Track A · Lv.2 校准刻度环 =====
  if (frameId === "calibration") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <circle cx="100" cy="100" r="76" fill="none" stroke={`url(#armor-${uid})`} strokeWidth="5.5" />
          <circle cx="100" cy="100" r="78.8" fill="none" stroke={`url(#gold2-${uid})`} strokeWidth="0.9" opacity="0.82" />
          <RadialTicks count={36} r1={72} r2={76.5} majorEvery={3} majorR1={70} stroke="#D0AD69" majorStroke="#FFF6D6" opacity={0.62} />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <PrecisionInnerBezel strokeUrl={`url(#gold-${uid})`} />
          <circle className="avf-spin-slow" cx="100" cy="100" r="82.5" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1" strokeDasharray="3 8.5" opacity="0.72" />
          {/* 4 machined cardinal vernier index markers */}
          <g fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.15">
            <path d="M95.5 16 H104.5 L102 25.5 H98 Z" />
            <path d="M95.5 184 H104.5 L102 174.5 H98 Z" />
            <path d="M16 95.5 V104.5 L25.5 102 V98 Z" />
            <path d="M184 95.5 V104.5 L174.5 102 V98 Z" />
          </g>
          <path d="M100 13.5 V22 M100 178 V186.5 M13.5 100 H22 M178 100 H186.5" stroke="#FFF9E2" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </>
    );
  }

  // ===== Track A · Lv.4 星核轨道反应堆 =====
  if (frameId === "reactor") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <circle cx="100" cy="100" r="78" fill="none" stroke={`url(#armor-${uid})`} strokeWidth="10" />
          <circle className="avf-spin-slow" cx="100" cy="100" r="83.5" fill="none" stroke={`url(#armor-${uid})`} strokeWidth="5.5" strokeDasharray="10 6.5" />
          <circle className="avf-spin-slow" cx="100" cy="100" r="83.5" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1.05" strokeDasharray="10 6.5" opacity="0.88" />
          <circle cx="100" cy="100" r="71.5" fill="none" stroke="#5CE6D0" strokeWidth="2.4" opacity="0.36" />
          <RadialTicks count={24} r1={73} r2={77.5} majorEvery={6} majorR1={71.5} stroke="#7CF7E4" majorStroke="#FFF6D6" opacity={0.5} />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <PrecisionInnerBezel strokeUrl={`url(#gold-${uid})`} />
          <circle className="avf-spin-fast" cx="100" cy="100" r="71.5" fill="none" stroke={`url(#plasma-${uid})`} strokeWidth="2.4" strokeDasharray="76 374" strokeLinecap="round" />
          <g className="avf-spin-ccw">
            <circle cx="100" cy="100" r="79" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1.35" strokeDasharray="58 190" strokeLinecap="round" />
            <circle cx="100" cy="21" r="3.2" fill="#7CF7E4" stroke="#FFFBF0" strokeWidth="0.9" />
            <circle cx="100" cy="179" r="2.8" fill="#FFF4CC" stroke="#9A722B" strokeWidth="0.8" />
          </g>
          {/* 4 diagonal CNC coolant clamps with micro-rivets */}
          {[45, 135, 225, 315].map((deg) => (
            <g key={deg} transform={`rotate(${deg} 100 100)`}>
              <path d="M91 18.5 H109 L106 31 H94 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.2" />
              <line x1="96" y1="24.5" x2="104" y2="24.5" stroke="#7CF7E4" strokeWidth="1.3" strokeLinecap="round" />
              <MicroRivet cx={95} cy={21.5} />
              <MicroRivet cx={105} cy={21.5} />
            </g>
          ))}
        </svg>
      </>
    );
  }

  // ===== Track A · Lv.6 泰坦机甲皇冠 =====
  if (frameId === "titan") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          {/* Layered dual-blade mecha wings */}
          <path d="M29 74 L7 52 L14 81 L4 100 L14 119 L7 148 L29 126 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M26 83 L12 72 L17 95 L10 100 L17 105 L12 128 L26 117" fill="none" stroke={`url(#gold2-${uid})`} strokeWidth="1.05" opacity="0.9" />
          <path d="M171 74 L193 52 L186 81 L196 100 L186 119 L193 148 L171 126 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M174 83 L188 72 L183 95 L190 100 L183 105 L188 128 L174 117" fill="none" stroke={`url(#gold2-${uid})`} strokeWidth="1.05" opacity="0.9" />
          <path d="M16 74 L26 85 M16 126 L26 115 M184 74 L174 85 M184 126 L174 115" stroke="#FFF9E2" strokeWidth="1.35" strokeLinecap="round" />
          {/* Heavy beveled titanium chassis */}
          <polygon points="69,24 131,24 176,69 176,131 131,176 69,176 24,131 24,69" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.1" />
          <polygon points="71.5,28 128.5,28 172,71.5 172,128.5 128.5,172 71.5,172 28,128.5 28,71.5" fill="none" stroke="#FFF6D6" strokeWidth="0.65" opacity="0.45" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <PrecisionInnerBezel strokeUrl={`url(#gold-${uid})`} />
          <RadialTicks count={32} r1={70.5} r2={74} majorEvery={4} majorR1={69.5} stroke="#B48735" majorStroke="#FFF4CC" opacity={0.55} />
          {/* Sculpted 3-spire sovereign crown */}
          <path d="M71 31 L81 11 L93 21 L100 4 L107 21 L119 11 L129 31 L115 36 L100 28.5 L85 36 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.55" strokeLinejoin="round" />
          <path d="M77 29 L83 17 L93 24.5 L100 10 L107 24.5 L117 17 L123 29" fill="none" stroke="#FFF9E2" strokeWidth="0.8" opacity="0.78" />
          <g className="avf-pulse">
            <FacetedGem cx={100} cy={21} rx={4.5} ry={6.5} light="#FFFDF0" mid="#EED089" dark="#8D641C" />
          </g>
          {/* Interlocking chin-guard */}
          <path d="M66 167 L100 186 L134 167 L124 158 L100 171 L76 158 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.55" strokeLinejoin="round" />
          <path d="M84 169 L100 178 L116 169" fill="none" stroke="#FFF9E2" strokeWidth="1.4" strokeLinecap="round" />
          {/* Side armor locks + 4 corner micro-rivets */}
          <rect x="20.5" y="90" width="7" height="20" rx="2" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.2" />
          <rect x="172.5" y="90" width="7" height="20" rx="2" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.2" />
          <MicroRivet cx={69} cy={29} />
          <MicroRivet cx={131} cy={29} />
          <MicroRivet cx={69} cy={171} />
          <MicroRivet cx={131} cy={171} />
        </svg>
      </>
    );
  }

  // ===== Track B · 鹰眼火控瞄准框 =====
  if (frameId === "hawkeye") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          {isHero ? (
            <g className="avf-radar">
              <path d="M100 100 L100 19 A81 81 0 0 1 162 49 Z" fill={`url(#sweep-${uid})`} />
              <line x1="100" y1="100" x2="100" y2="19" stroke="#FFF6D6" strokeWidth="1.15" opacity="0.85" />
            </g>
          ) : null}
          <circle cx="100" cy="100" r="78" fill="none" stroke="var(--admin-border)" strokeWidth="1" strokeDasharray="2.5 5.5" />
          <RadialTicks count={48} r1={73} r2={77} majorEvery={6} majorR1={71} stroke="#B48735" majorStroke="#FFF4CC" opacity={0.5} />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <PrecisionInnerBezel strokeUrl={`url(#gold-${uid})`} />
          {/* Dual-layer precision HUD corner brackets */}
          <g fill="none" stroke={`url(#gold-${uid})`} strokeWidth="2.8" strokeLinecap="square">
            <path d="M22 56 V22 H56" />
            <path d="M178 56 V22 H144" />
            <path d="M22 144 V178 H56" />
            <path d="M178 144 V178 H144" />
          </g>
          <g fill="none" stroke="#FFF9E2" strokeWidth="0.8" opacity="0.65">
            <path d="M27 51 V27 H51" />
            <path d="M173 51 V27 H149" />
            <path d="M27 149 V173 H51" />
            <path d="M173 149 V173 H149" />
          </g>
          {/* Side ballistic elevation ladders */}
          <path d="M11 82 h10 M13 88 h7 M9 94 h12 M13 100 h9 M9 106 h12 M13 112 h7 M11 118 h10" stroke="#D0AD69" strokeWidth="1.25" strokeLinecap="round" />
          <path d="M189 82 h-10 M187 88 h-7 M191 94 h-12 M187 100 h-9 M191 106 h-12 M187 112 h-7 M189 118 h-10" stroke="#D0AD69" strokeWidth="1.25" strokeLinecap="round" />
          {/* Top lock diamond & bottom lock-status housing */}
          <g className="avf-pulse">
            <polygon points="100,10 108,19 100,28 92,19" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.4" />
            <FacetedGem cx={100} cy={19} rx={3.4} ry={4.6} light="#94FFF0" mid="#5CE6D0" dark="#1F7A6D" />
          </g>
          <rect x="75" y="172" width="50" height="13" rx="3" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.3" />
          <rect className="avf-pulse" x="85" y="176.8" width="30" height="3.4" rx="1.7" fill="#5CE6D0" />
          <MicroRivet cx={80} cy={178.5} />
          <MicroRivet cx={120} cy={178.5} />
        </svg>
      </>
    );
  }

  // ===== Track B · 共建者荣耀桂冠（细雕多层叶片） =====
  if (frameId === "laurel") {
    const leftLeaves = [
      { cx: 36, cy: 146, rot: -42, sx: 1.05 },
      { cx: 25, cy: 130, rot: -62, sx: 1.0 },
      { cx: 19, cy: 112, rot: -78, sx: 0.96 },
      { cx: 18, cy: 93, rot: -92, sx: 0.95 },
      { cx: 22, cy: 74, rot: -108, sx: 0.92 },
      { cx: 31, cy: 56, rot: -126, sx: 0.88 },
      { cx: 44, cy: 41, rot: -144, sx: 0.82 },
    ];
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          {/* Forged curved laurel stems */}
          <path d="M62 169 C28 152 14 122 16 86 C18 62 32 42 52 30" fill="none" stroke={`url(#laurel-${uid})`} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M138 169 C172 152 186 122 184 86 C182 62 168 42 148 30" fill="none" stroke={`url(#laurel-${uid})`} strokeWidth="2.2" strokeLinecap="round" />
          {/* Individual sculpted laurel leaves with fine central veins */}
          {leftLeaves.map((lf, idx) => (
            <g key={idx}>
              <g transform={`translate(${lf.cx} ${lf.cy}) rotate(${lf.rot}) scale(${lf.sx})`}>
                <path d="M0 -13 C5.5 -6 5.5 6 0 13 C-5.5 6 -5.5 -6 0 -13 Z" fill={`url(#laurel-${uid})`} stroke="#3B2B0E" strokeWidth="0.8" />
                <line x1="0" y1="-10" x2="0" y2="10" stroke={lp[0]} strokeWidth="0.7" opacity="0.85" />
              </g>
              <g transform={`translate(${200 - lf.cx} ${lf.cy}) rotate(${-lf.rot}) scale(${lf.sx})`}>
                <path d="M0 -13 C5.5 -6 5.5 6 0 13 C-5.5 6 -5.5 -6 0 -13 Z" fill={`url(#laurel-${uid})`} stroke="#3B2B0E" strokeWidth="0.8" />
                <line x1="0" y1="-10" x2="0" y2="10" stroke={lp[0]} strokeWidth="0.7" opacity="0.85" />
              </g>
            </g>
          ))}
          <circle cx="100" cy="100" r="72" fill={`url(#armor-${uid})`} stroke={`url(#laurel-${uid})`} strokeWidth="1.8" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <PrecisionInnerBezel strokeUrl={`url(#laurel-${uid})`} />
          {/* Top 8-point compass star */}
          <g className="avf-pulse">
            <path d="M100 10 L103.5 22 L115.5 25.5 L103.5 29 L100 41 L96.5 29 L84.5 25.5 L96.5 22 Z" fill={`url(#laurel-${uid})`} stroke="#3B2B0E" strokeWidth="0.7" />
            <circle cx="100" cy="25.5" r="2.2" fill={lp[0]} />
          </g>
          {/* Bottom heraldic diamond crest */}
          <polygon points="100,153 121,170 100,188 79,170" fill={`url(#armor-${uid})`} stroke={`url(#laurel-${uid})`} strokeWidth="1.8" />
          <g className="avf-pulse">
            <FacetedGem cx={100} cy={170} rx={8.5} ry={10.5} light={lp[0]} mid={lp[1]} dark={lp[2]} />
          </g>
          <MicroRivet cx={72} cy={166} />
          <MicroRivet cx={128} cy={166} />
          {isHero ? (
            <>
              <circle className="avf-spark-1" cx="30" cy="54" r="2.1" fill={lp[0]} />
              <circle className="avf-spark-2" cx="170" cy="58" r="1.9" fill={lp[0]} />
            </>
          ) : null}
        </svg>
      </>
    );
  }

  // ===== Track B · 赛场烈焰超频核心 =====
  if (frameId === "overclock") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <circle className="avf-pulse" cx="100" cy="100" r="74" fill="none" stroke={`url(#fire-${uid})`} strokeWidth="4.2" opacity="0.6" />
          {/* Layered swept thermal exhaust fins */}
          <path d="M30 68 L7 38 L22 84 L4 104 L24 120 L14 156 L44 139 Z" fill={`url(#armor-${uid})`} stroke={`url(#fire-${uid})`} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M27 78 L15 62 L23 94 L14 105 L26 116 L21 138 L37 128" fill="none" stroke="#FFF2B8" strokeWidth="0.9" opacity="0.72" />
          <path d="M170 68 L193 38 L178 84 L196 104 L176 120 L186 156 L156 139 Z" fill={`url(#armor-${uid})`} stroke={`url(#fire-${uid})`} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M173 78 L185 62 L177 94 L186 105 L174 116 L179 138 L163 128" fill="none" stroke="#FFF2B8" strokeWidth="0.9" opacity="0.72" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <PrecisionInnerBezel strokeUrl={`url(#fire-${uid})`} />
          <circle className="avf-spin-fast" cx="100" cy="100" r="72.5" fill="none" stroke="#FFF2B8" strokeWidth="1.9" strokeDasharray="52 176" strokeLinecap="round" />
          {/* Tri-blade overclock heat-sink crown */}
          <path d="M72 34 L65 10 L89 27 L100 7 L111 27 L135 10 L128 34 L100 26 Z" fill={`url(#armor-${uid})`} stroke={`url(#fire-${uid})`} strokeWidth="1.5" strokeLinejoin="round" />
          <g className="avf-pulse">
            <FacetedGem cx={100} cy={22} rx={4.5} ry={6} light="#FFFDF0" mid="#FFB94E" dark="#B83B14" />
          </g>
          {/* Bottom thruster vent */}
          <path d="M74 166 L100 186 L126 166 L116 159 L100 171 L84 159 Z" fill={`url(#armor-${uid})`} stroke={`url(#fire-${uid})`} strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points="88,167 100,177 112,167 100,164" fill={`url(#fire-${uid})`} />
          {isHero ? (
            <>
              <circle className="avf-spark-1" cx="40" cy="48" r="2.3" fill="#FFB94E" />
              <circle className="avf-spark-2" cx="160" cy="52" r="2" fill="#FFF4CC" />
            </>
          ) : null}
        </svg>
      </>
    );
  }



  // ===== 赛事限定 · RMUL 联盟赛 · 破阵先锋框 =====
  if (frameId === "rm_league") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <path d="M30 72 L7 54 L17 98 L7 136 L32 123 Z" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M26 83 L14 74 L21 100 L15 122 L28 115" fill="none" stroke="#FFF4CC" strokeWidth="0.9" opacity="0.65" />
          <path d="M170 72 L193 54 L183 98 L193 136 L168 123 Z" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M174 83 L186 74 L179 100 L185 122 L172 115" fill="none" stroke="#FFF4CC" strokeWidth="0.9" opacity="0.65" />
          <circle cx="100" cy="100" r="75" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="1.9" />
          <RadialTicks count={24} r1={70.5} r2={74} majorEvery={6} majorR1={69.5} stroke="#FF8585" majorStroke="#FFF4CC" opacity={0.55} />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <PrecisionInnerBezel strokeUrl={`url(#rmred-${uid})`} />
          {/* Top twin-chevron vanguard crest */}
          <path d="M74 28 L100 10 L126 28 L116 35 L100 24 L84 35 Z" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="1.5" strokeLinejoin="round" />
          <path className="avf-pulse" d="M88 25 L100 16.5 L112 25" fill="none" stroke="#FFF9E2" strokeWidth="1.65" strokeLinecap="round" />
          {/* Micro-screwed RMUL + year nameplate */}
          <rect x="55" y="165.5" width="90" height="18" rx="3.5" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="1.45" />
          <MicroRivet cx={61} cy={174.5} />
          <MicroRivet cx={139} cy={174.5} />
          <text x="100" y="177.8" textAnchor="middle" fill="#FFF6D6" fontSize="8.8" fontWeight="760" fontFamily="ui-monospace, monospace" letterSpacing="0.8">RMUL {seasonYear}</text>
        </svg>
      </>
    );
  }

  // ===== 赛事限定 · RMUC 区域赛 · 赛区突围框 =====
  if (frameId === "rm_regional") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          {/* RoboMaster Blue vs Red split armored wings */}
          <path d="M30 66 L5 44 L15 84 L3 102 L17 120 L10 152 L37 132 Z" fill={`url(#armor-${uid})`} stroke="#4DA3FF" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M27 78 L13 66 L20 96 L12 103 L21 114 L16 135 L33 123" fill="none" stroke="#9BD1FF" strokeWidth="0.9" opacity="0.72" />
          <path d="M170 66 L195 44 L185 84 L197 102 L183 120 L190 152 L163 132 Z" fill={`url(#armor-${uid})`} stroke="#FF4757" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M173 78 L187 66 L180 96 L188 103 L179 114 L184 135 L167 123" fill="none" stroke="#FF9699" strokeWidth="0.9" opacity="0.72" />
          <polygon points="67,22 133,22 178,67 178,133 133,178 67,178 22,133 22,67" fill={`url(#armor-${uid})`} stroke={`url(#rmdual-${uid})`} strokeWidth="2.1" />
          <polygon points="70,26.5 130,26.5 173.5,70 173.5,130 130,173.5 70,173.5 26.5,130 26.5,70" fill="none" stroke="#FFF6D6" strokeWidth="0.65" opacity="0.45" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 200 200" aria-hidden="true">
          {commonDefs}
          <PrecisionInnerBezel strokeUrl={`url(#rmdual-${uid})`} />
          <circle className="avf-spin-fast" cx="100" cy="100" r="73" fill="none" stroke={`url(#rmdual-${uid})`} strokeWidth="1.8" strokeDasharray="62 167" strokeLinecap="round" />
          <path d="M77 30 L100 8 L123 30 L110 35 L100 25 L90 35 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.55" strokeLinejoin="round" />
          <g className="avf-pulse">
            <FacetedGem cx={100} cy={22} rx={4.2} ry={5.8} light="#FFFDF2" mid="#F0D084" dark="#8A6118" />
          </g>
          <rect x="53" y="165" width="94" height="18.5" rx="4" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.5" />
          <MicroRivet cx={59.5} cy={174.2} />
          <MicroRivet cx={140.5} cy={174.2} />
          <text x="100" y="177.5" textAnchor="middle" fill="#FFF6D6" fontSize="8.6" fontWeight="740" fontFamily="ui-monospace, monospace" letterSpacing="0.6">{seasonYear} 区域赛</text>
        </svg>
      </>
    );
  }

  // ===== 赛事限定 · RMUC 全国赛 · 殿堂远征框（最高精工旗舰款） =====
  return (
    <>
      <svg className="tarsgo-av-frame__back" viewBox="0 0 200 200" aria-hidden="true">
        {commonDefs}
        {/* Sculpted 3-tier golden victory wings */}
        <path d="M33 62 L3 30 L18 73 L1 95 L18 113 L5 148 L35 133 L43 158 L60 148" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.85" strokeLinejoin="round" />
        <path d="M29 73 L12 56 L22 88 L10 98 L23 110 L14 134 L34 123" fill="none" stroke="#FFF6D6" strokeWidth="0.95" opacity="0.76" />
        <path d="M167 62 L197 30 L182 73 L199 95 L182 113 L195 148 L165 133 L157 158 L140 148" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.85" strokeLinejoin="round" />
        <path d="M171 73 L188 56 L178 88 L190 98 L177 110 L186 134 L166 123" fill="none" stroke="#FFF6D6" strokeWidth="0.95" opacity="0.76" />
        {/* Beveled octagonal obsidian-gold sovereign chassis */}
        <polygon points="67,22 133,22 178,67 178,133 133,178 67,178 22,133 22,67" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.3" />
        <polygon points="70,26.5 130,26.5 173.5,70 173.5,130 130,173.5 70,173.5 26.5,130 26.5,70" fill="none" stroke="#FFF9E2" strokeWidth="0.75" opacity="0.52" />
        <RadialTicks count={36} r1={70.5} r2={74.5} majorEvery={3} majorR1={69} stroke="#B48735" majorStroke="#FFF9E2" opacity={0.62} />
      </svg>
      <svg className="tarsgo-av-frame__front" viewBox="0 0 200 200" aria-hidden="true">
        {commonDefs}
        <PrecisionInnerBezel strokeUrl={`url(#gold-${uid})`} />
        <circle className="avf-spin-fast" cx="100" cy="100" r="72.5" fill="none" stroke={`url(#plasma-${uid})`} strokeWidth="2" strokeDasharray="76 378" strokeLinecap="round" />
        {/* 5-spire sovereign championship crown + 4-facet emerald-cyan prism gem */}
        <path d="M64 35 L74 10 L89 24 L100 3 L111 24 L126 10 L136 35 L118 39 L100 29 L82 39 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M71 33 L77 17 L89 27.5 L100 10 L111 27.5 L123 17 L129 33" fill="none" stroke="#FFF9E2" strokeWidth="0.85" opacity="0.82" />
        <g className="avf-pulse">
          <FacetedGem cx={100} cy={22} rx={5.2} ry={7.4} light="#C2FFF6" mid="#5CE6D0" dark="#1A6E61" />
        </g>
        {/* 4 corner CNC bolts */}
        <MicroRivet cx={68} cy={28} />
        <MicroRivet cx={132} cy={28} />
        <MicroRivet cx={28} cy={68} />
        <MicroRivet cx={172} cy={68} />
        {/* Engraved RMUC + year championship plaque */}
        <path d="M48 165 H152 L146 184.5 H54 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.65" strokeLinejoin="round" />
        <line x1="57" y1="168.5" x2="143" y2="168.5" stroke="#FFF9E2" strokeWidth="0.6" opacity="0.55" />
        <MicroRivet cx={57.5} cy={174.8} />
        <MicroRivet cx={142.5} cy={174.8} />
        <text x="100" y="178" textAnchor="middle" fill="#FFF9E2" fontSize="9.2" fontWeight="780" fontFamily="ui-monospace, monospace" letterSpacing="1.1">RMUC {seasonYear}</text>
        {isHero ? (
          <>
            <circle className="avf-spark-1" cx="28" cy="40" r="2.3" fill="#FFF9E2" />
            <circle className="avf-spark-2" cx="172" cy="44" r="2.1" fill="#7CF7E4" />
          </>
        ) : null}
      </svg>
    </>
  );
}

export function AvatarFrame({
  context,
  forcedFrameId,
  tier = "card",
  children,
}: {
  context: AvatarFrameContext;
  forcedFrameId?: AvatarFrameId | null;
  tier?: AvatarFrameTier;
  children: ReactNode;
}) {
  const activeFrame = forcedFrameId !== undefined ? forcedFrameId : resolveEquippedAvatarFrame(context);

  if (!activeFrame) {
    return <span className={`tarsgo-av-frame tarsgo-av-frame--plain tarsgo-av-frame--${tier}`}>{children}</span>;
  }

  return (
    <span className={`tarsgo-av-frame tarsgo-av-frame--${tier} tarsgo-av-frame--id-${activeFrame}`}>
      <FrameGraphic frameId={activeFrame} tier={tier} badgeLevel={context.featuredBadge?.levelCode} seasonYear={context.seasonYear} />
      <span className="tarsgo-av-frame__core">{children}</span>
    </span>
  );
}

const TRACK_FILTERS: readonly { id: "all" | AvatarFrameTrack; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "level", label: "轨道 A · 等级" },
  { id: "honor", label: "轨道 B · 荣誉" },
  { id: "event", label: "赛事限定" },
];

export function AvatarFrameGallery({
  context,
  displayName,
  avatarUrl,
  isSelf,
  previewFrameId = null,
  onPreview,
  onChoose,
  saving = false,
  error = "",
}: {
  context: AvatarFrameContext;
  displayName: string;
  avatarUrl?: string;
  isSelf: boolean;
  previewFrameId?: AvatarFrameId | null;
  onPreview?: (frameId: AvatarFrameId | null) => void;
  onChoose?: (choice: AvatarFrameChoice) => void;
  saving?: boolean;
  error?: string;
}) {
  const pref = context.avatarFrameKey ?? "auto";
  const [trackFilter, setTrackFilter] = useState<"all" | AvatarFrameTrack>("all");

  const equipped = resolveEquippedAvatarFrame(context);
  const initial = Array.from(displayName.trim())[0] ?? "吉";
  const visibleFrames = trackFilter === "all" ? AVATAR_FRAMES : AVATAR_FRAMES.filter((f) => f.track === trackFilter);

  function choose(next: AvatarFrameChoice) {
    if (!isSelf || saving || !onChoose) return;
    onChoose(next);
  }

  return (
    <section className="avatar-frame-gallery" aria-labelledby="avatar-frame-gallery-title">
      <div className="avatar-frame-gallery__head">
        <div>
          <h2 id="avatar-frame-gallery-title">机甲头像框图鉴</h2>
        </div>
        {isSelf ? (
          <div className="avatar-frame-gallery__controls">
            <button
              type="button"
              className={`avatar-frame-gallery__chip${pref === "auto" ? " is-active" : ""}`}
              onClick={() => choose("auto")} disabled={saving}
            >
              自动佩戴最高阶
            </button>
            <button
              type="button"
              className={`avatar-frame-gallery__chip${pref === "none" ? " is-active" : ""}`}
              onClick={() => choose("none")} disabled={saving}
            >
              关闭头像框
            </button>
          </div>
        ) : null}
      </div>

      <div className="avatar-frame-gallery__tracks" role="tablist" aria-label="头像框轨道筛选">
        {TRACK_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={trackFilter === item.id}
            className={`avatar-frame-gallery__track-tab${trackFilter === item.id ? " is-active" : ""}`}
            onClick={() => setTrackFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="avatar-frame-gallery__grid">
        {visibleFrames.map((frame) => {
          const unlocked = isAvatarFrameUnlocked(frame.id, context);
          const isEquipped = equipped === frame.id;
          const isPreviewed = previewFrameId === frame.id;
          return (
            <article
              key={frame.id}
              className={`avatar-frame-card${unlocked ? " is-unlocked" : " is-locked"}${isEquipped ? " is-equipped" : ""}`}
            >
              <div className="avatar-frame-card__preview">
                <AvatarFrame context={context} forcedFrameId={frame.id} tier="hero">
                  <span className="avatar-frame-card__sample">
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : initial}
                  </span>
                </AvatarFrame>
              </div>
              <span className="avatar-frame-card__tier">{frame.tierLabel}</span>
              <h3>{frame.name}</h3>
              <span className="avatar-frame-card__hint">{frame.unlockHint}</span>
              {isSelf ? (
                <div className="avatar-frame-card__actions">
                  <button
                    type="button"
                    className={`avatar-frame-card__action avatar-frame-card__action--preview${isPreviewed ? " is-previewing" : ""}`}
                    aria-pressed={isPreviewed}
                    disabled={saving}
                    onClick={() => onPreview?.(isPreviewed ? null : frame.id)}
                  >
                    {isPreviewed ? "取消预览" : "预览"}
                  </button>
                  <button
                    type="button"
                    className={`avatar-frame-card__action${isEquipped ? " is-equipped" : ""}`}
                    disabled={!unlocked || saving}
                    onClick={() => choose(frame.id)}
                  >
                    {!unlocked ? "未解锁" : isEquipped ? "当前佩戴中" : "佩戴此框"}
                  </button>
                </div>
              ) : (
                <span className="avatar-frame-card__state">{unlocked ? (isEquipped ? "佩戴中" : "已解锁") : "未解锁"}</span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
