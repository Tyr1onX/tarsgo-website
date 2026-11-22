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

function FrameGraphic({
  frameId,
  tier,
  badgeLevel,
}: {
  frameId: AvatarFrameId;
  tier: AvatarFrameTier;
  badgeLevel?: "none" | "bronze" | "silver" | "gold";
}) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, "");
  const isCompact = tier === "compact";
  const isHero = tier === "hero";

  // Compact mode (<=36px comment avatars): crisp high-recognition signature ring only, never cluttered.
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
            strokeWidth={frameId === "rm_national" ? "6" : "5"}
          />
        ) : frameId === "hawkeye" || frameId === "rm_league" ? (
          <path
            d="M26 6 H10 Q6 6 6 10 V26 M74 6 H90 Q94 6 94 10 V26 M26 94 H10 Q6 94 6 90 V74 M74 94 H90 Q94 94 94 90 V74"
            fill="none"
            stroke={stroke}
            strokeWidth="6"
            strokeLinecap="round"
          />
        ) : (
          <circle cx="50" cy="50" r="46" fill="none" stroke={stroke} strokeWidth="5" />
        )}
      </svg>
    );
  }

  const laurelPalette =
    badgeLevel === "bronze"
      ? ["#F0C7A8", "#C48458", "#6B3F22"]
      : badgeLevel === "silver"
        ? ["#F6F8FA", "#BCC6CC", "#5F6B72"]
        : ["#FFF4CC", "#DFBC72", "#7B5C21"];

  const commonDefs = (
    <defs>
      <linearGradient id={`gold-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF4CC" />
        <stop offset="28%" stopColor="#DFBC72" />
        <stop offset="62%" stopColor="#9A722B" />
        <stop offset="88%" stopColor="#F1D58E" />
        <stop offset="100%" stopColor="#6F4E17" />
      </linearGradient>
      <linearGradient id={`armor-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#374441" />
        <stop offset="50%" stopColor="#1B2322" />
        <stop offset="100%" stopColor="#0D1211" />
      </linearGradient>
      <linearGradient id={`laurel-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={laurelPalette[0]} />
        <stop offset="50%" stopColor={laurelPalette[1]} />
        <stop offset="100%" stopColor={laurelPalette[2]} />
      </linearGradient>
      <linearGradient id={`plasma-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7CF7E4" />
        <stop offset="55%" stopColor="#FFE8A3" />
        <stop offset="100%" stopColor="#D0AD69" />
      </linearGradient>
      <linearGradient id={`fire-${uid}`} x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#FF7A2F" />
        <stop offset="55%" stopColor="#F6D07A" />
        <stop offset="100%" stopColor="#FFF5D4" />
      </linearGradient>
      <linearGradient id={`rmred-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF6B6B" />
        <stop offset="50%" stopColor="#F0B95B" />
        <stop offset="100%" stopColor="#B82D32" />
      </linearGradient>
      <linearGradient id={`rmdual-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4DA3FF" />
        <stop offset="50%" stopColor="#F6D481" />
        <stop offset="100%" stopColor="#FF5A5F" />
      </linearGradient>
      <linearGradient id={`sweep-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#D0AD69" stopOpacity="0" />
        <stop offset="100%" stopColor="#FFF2C9" stopOpacity="0.42" />
      </linearGradient>
    </defs>
  );

  // ===== Track A =====
  if (frameId === "calibration") {
    return (
      <svg className="tarsgo-av-frame__front" viewBox="0 0 160 160" aria-hidden="true">
        {commonDefs}
        <circle cx="80" cy="80" r="56" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="2.8" opacity="0.92" />
        <circle className="avf-spin-cw" cx="80" cy="80" r="63" fill="none" stroke="var(--admin-accent)" strokeWidth="1.8" strokeDasharray="3.5 7.5" opacity="0.72" />
        <path d="M80 9v10M80 141v10M9 80h10M141 80h10" stroke="#FFF4CC" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (frameId === "titan") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <path d="M22 64 L5 46 L9 68 L2 80 L9 92 L5 114 L22 96 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.2" />
          <path d="M138 64 L155 46 L151 68 L158 80 L151 92 L155 114 L138 96 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.2" />
          <path d="M13 62 L20 70 M13 98 L20 90 M147 62 L140 70 M147 98 L140 90" stroke="#FFF2C9" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="80" cy="80" r="61" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.5" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <polygon points="56,22 104,22 138,56 138,104 104,138 56,138 22,104 22,56" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="3.6" />
          <circle cx="80" cy="80" r="53.5" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="2.2" />
          <path d="M58 26 L66 10 L75 18 L80 4 L85 18 L94 10 L102 26 L92 30 L80 24 L68 30 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.2" strokeLinejoin="round" />
          <polygon className="avf-pulse" points="80,10 84,18 80,23 76,18" fill="#FFF4CC" />
          <path d="M52 132 L80 148 L108 132 L100 124 L80 135 L60 124 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M68 134 L80 141 L92 134" fill="none" stroke="#FFF4CC" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="17" y="72" width="7" height="16" rx="2" fill={`url(#gold-${uid})`} />
          <rect x="136" y="72" width="7" height="16" rx="2" fill={`url(#gold-${uid})`} />
        </svg>
      </>
    );
  }

  if (frameId === "reactor") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <circle className="avf-spin-cw" cx="80" cy="80" r="65" fill="none" stroke={`url(#armor-${uid})`} strokeWidth="9" strokeDasharray="14 6.4" />
          <circle className="avf-spin-cw" cx="80" cy="80" r="65" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="1.6" strokeDasharray="14 6.4" opacity="0.85" />
          <circle cx="80" cy="80" r="56" fill="none" stroke="#5CE6D0" strokeWidth="3.2" opacity="0.45" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <circle className="avf-spin-fast" cx="80" cy="80" r="57" fill="none" stroke={`url(#plasma-${uid})`} strokeWidth="4" strokeDasharray="78 280" strokeLinecap="round" />
          <g className="avf-spin-ccw">
            <circle cx="80" cy="80" r="62" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="2.2" strokeDasharray="48 147" strokeLinecap="round" />
            <circle cx="80" cy="18" r="4" fill="#7CF7E4" />
            <circle cx="80" cy="142" r="3.5" fill="#FFF2C9" />
          </g>
          <g fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2">
            <path d="M32 38 L44 26 L51 33 L39 45 Z" />
            <path d="M128 38 L116 26 L109 33 L121 45 Z" />
            <path d="M32 122 L44 134 L51 127 L39 115 Z" />
            <path d="M128 122 L116 134 L109 127 L121 115 Z" />
          </g>
          <circle cx="80" cy="80" r="52.5" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="2" />
        </svg>
      </>
    );
  }

  // ===== Track B =====
  if (frameId === "hawkeye") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          {isHero ? (
            <g className="avf-radar">
              <path d="M80 80 L80 14 A66 66 0 0 1 132 40 Z" fill={`url(#sweep-${uid})`} />
              <line x1="80" y1="80" x2="80" y2="14" stroke="#FFF2C9" strokeWidth="1.6" opacity="0.8" />
            </g>
          ) : null}
          <circle cx="80" cy="80" r="63" fill="none" stroke="var(--admin-border)" strokeWidth="1.2" strokeDasharray="3 5" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <g fill="none" stroke={`url(#gold-${uid})`} strokeWidth="4" strokeLinecap="square">
            <path d="M18 46 V20 H46" />
            <path d="M142 46 V20 H114" />
            <path d="M18 114 V140 H46" />
            <path d="M142 114 V140 H114" />
          </g>
          <circle cx="80" cy="80" r="53" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="2" strokeDasharray="28 8 4 8" />
          <path d="M8 66 h10 M8 74 h7 M8 80 h13 M8 86 h7 M8 94 h10" stroke="#D0AD69" strokeWidth="2" strokeLinecap="round" />
          <path d="M152 66 h-10 M152 74 h-7 M152 80 h-13 M152 86 h-7 M152 94 h-10" stroke="#D0AD69" strokeWidth="2" strokeLinecap="round" />
          <polygon className="avf-pulse" points="80,8 87,16 80,24 73,16" fill={`url(#armor-${uid})`} stroke="#FFF2C9" strokeWidth="2" />
          <rect x="64" y="138" width="32" height="10" rx="3" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.8" />
          <rect className="avf-pulse" x="70" y="141.5" width="20" height="3" rx="1.5" fill="#5CE6D0" />
        </svg>
      </>
    );
  }

  if (frameId === "laurel") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <g fill={`url(#laurel-${uid})`} stroke="#5C4112" strokeWidth="1">
            <path d="M44 134 C22 122 12 102 10 80 C18 86 24 94 28 104 C26 90 16 74 16 54 C24 62 30 72 32 82 C30 66 24 46 32 30 C38 42 40 54 39 64 C40 50 42 36 52 24 C50 38 47 50 44 58" />
            <path d="M116 134 C138 122 148 102 150 80 C142 86 136 94 132 104 C134 90 144 74 144 54 C136 62 130 72 128 82 C130 66 136 46 128 30 C122 42 120 54 121 64 C120 50 118 36 108 24 C110 38 113 50 116 58" />
          </g>
          <circle cx="80" cy="80" r="57" fill={`url(#armor-${uid})`} stroke={`url(#laurel-${uid})`} strokeWidth="2.4" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <circle cx="80" cy="80" r="53.5" fill="none" stroke={`url(#laurel-${uid})`} strokeWidth="3.2" />
          <polygon points="80,122 96,136 80,152 64,136" fill={`url(#armor-${uid})`} stroke={`url(#laurel-${uid})`} strokeWidth="2.6" />
          <polygon className="avf-pulse" points="80,128 88,136 80,144 72,136" fill={laurelPalette[0]} />
          <path className="avf-pulse" d="M80 10 L83.5 19.5 L93 23 L83.5 26.5 L80 36 L76.5 26.5 L67 23 L76.5 19.5 Z" fill={laurelPalette[0]} />
          {isHero ? (
            <>
              <circle className="avf-spark-1" cx="28" cy="48" r="2.3" fill={laurelPalette[0]} />
              <circle className="avf-spark-2" cx="132" cy="52" r="2" fill={laurelPalette[0]} />
            </>
          ) : null}
        </svg>
      </>
    );
  }

  if (frameId === "overclock") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <circle className="avf-pulse" cx="80" cy="80" r="59" fill="none" stroke={`url(#fire-${uid})`} strokeWidth="5" opacity="0.72" />
          <path d="M24 54 L6 30 L18 68 L3 84 L20 96 L12 126 L36 112" fill={`url(#armor-${uid})`} stroke={`url(#fire-${uid})`} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M136 54 L154 30 L142 68 L157 84 L140 96 L148 126 L124 112" fill={`url(#armor-${uid})`} stroke={`url(#fire-${uid})`} strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <circle cx="80" cy="80" r="53.5" fill="none" stroke={`url(#fire-${uid})`} strokeWidth="3.2" />
          <circle className="avf-spin-fast" cx="80" cy="80" r="58" fill="none" stroke="#FFF2B8" strokeWidth="2.4" strokeDasharray="42 140" strokeLinecap="round" />
          <path d="M58 28 L52 8 L72 22 L80 6 L88 22 L108 8 L102 28 L80 22 Z" fill={`url(#armor-${uid})`} stroke={`url(#fire-${uid})`} strokeWidth="2.2" strokeLinejoin="round" />
          <polygon points="62,132 80,148 98,132 80,126" fill={`url(#fire-${uid})`} />
          {isHero ? (
            <>
              <circle className="avf-spark-1" cx="34" cy="40" r="2.5" fill="#FFB94E" />
              <circle className="avf-spark-2" cx="128" cy="44" r="2.1" fill="#FFF2B8" />
            </>
          ) : null}
        </svg>
      </>
    );
  }

  // ===== 赛事限定轨: RoboMaster =====
  if (frameId === "rm_league") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <path d="M24 58 L6 44 L14 78 L6 108 L26 98 Z" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M136 58 L154 44 L146 78 L154 108 L134 98 Z" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="2.2" strokeLinejoin="round" />
          <circle cx="80" cy="80" r="60" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="2.2" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <circle cx="80" cy="80" r="53.5" fill="none" stroke={`url(#rmred-${uid})`} strokeWidth="3.2" />
          <path d="M60 22 L80 8 L100 22 L92 28 L80 19 L68 28 Z" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="2" strokeLinejoin="round" />
          <path className="avf-pulse" d="M72 20 L80 14 L88 20" fill="none" stroke="#FFF4CC" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="58" y="132" width="44" height="13" rx="3" fill={`url(#armor-${uid})`} stroke={`url(#rmred-${uid})`} strokeWidth="1.8" />
          <text x="80" y="141.5" textAnchor="middle" fill="#FFF4CC" fontSize="8" fontWeight="700" fontFamily="ui-monospace, monospace" letterSpacing="0.8">RMUL</text>
        </svg>
      </>
    );
  }

  if (frameId === "rm_regional") {
    return (
      <>
        <svg className="tarsgo-av-frame__back" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <path d="M24 54 L4 36 L12 68 L2 82 L14 96 L8 122 L30 106 Z" fill={`url(#armor-${uid})`} stroke="#4DA3FF" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M136 54 L156 36 L148 68 L158 82 L146 96 L152 122 L130 106 Z" fill={`url(#armor-${uid})`} stroke="#FF5A5F" strokeWidth="2.2" strokeLinejoin="round" />
          <polygon points="54,18 106,18 142,54 142,106 106,142 54,142 18,106 18,54" fill={`url(#armor-${uid})`} stroke={`url(#rmdual-${uid})`} strokeWidth="2.6" />
        </svg>
        <svg className="tarsgo-av-frame__front" viewBox="0 0 160 160" aria-hidden="true">
          {commonDefs}
          <circle cx="80" cy="80" r="53.5" fill="none" stroke={`url(#rmdual-${uid})`} strokeWidth="3.2" />
          <circle className="avf-spin-fast" cx="80" cy="80" r="58.5" fill="none" stroke={`url(#rmdual-${uid})`} strokeWidth="2.2" strokeDasharray="52 132" strokeLinecap="round" />
          <path d="M62 24 L80 6 L98 24 L88 28 L80 20 L72 28 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.2" strokeLinejoin="round" />
          <polygon className="avf-pulse" points="80,12 84,18 80,23 76,18" fill="#FFF4CC" />
          <rect x="54" y="132" width="52" height="14" rx="3.5" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="1.8" />
          <text x="80" y="142" textAnchor="middle" fill="#FFF4CC" fontSize="8" fontWeight="700" fontFamily="ui-monospace, monospace" letterSpacing="0.6">区域赛</text>
        </svg>
      </>
    );
  }

  // rm_national (最高赛事荣耀限定框)
  return (
    <>
      <svg className="tarsgo-av-frame__back" viewBox="0 0 160 160" aria-hidden="true">
        {commonDefs}
        <path d="M26 50 L2 24 L14 58 L0 76 L14 90 L4 118 L28 106 L34 126 L48 118" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M134 50 L158 24 L146 58 L160 76 L146 90 L156 118 L132 106 L126 126 L112 118" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M10 48 L22 60 M10 104 L22 94 M150 48 L138 60 M150 104 L138 94" stroke="#FFF4CC" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="80" cy="80" r="62" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="3" />
      </svg>
      <svg className="tarsgo-av-frame__front" viewBox="0 0 160 160" aria-hidden="true">
        {commonDefs}
        <polygon points="54,20 106,20 140,54 140,106 106,140 54,140 20,106 20,54" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="3.6" />
        <circle cx="80" cy="80" r="53.5" fill="none" stroke="#FFF4CC" strokeWidth="2.2" />
        <circle className="avf-spin-fast" cx="80" cy="80" r="58" fill="none" stroke={`url(#plasma-${uid})`} strokeWidth="2.6" strokeDasharray="64 290" strokeLinecap="round" />
        <path d="M52 28 L60 8 L72 19 L80 2 L88 19 L100 8 L108 28 L94 31 L80 23 L66 31 Z" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2.4" strokeLinejoin="round" />
        <polygon className="avf-pulse" points="80,9 85,18 80,24 75,18" fill="#7CF7E4" />
        <rect x="50" y="131" width="60" height="15" rx="4" fill={`url(#armor-${uid})`} stroke={`url(#gold-${uid})`} strokeWidth="2" />
        <text x="80" y="141.5" textAnchor="middle" fill="#FFF4CC" fontSize="8.2" fontWeight="750" fontFamily="ui-monospace, monospace" letterSpacing="0.9">RMUC</text>
        {isHero ? (
          <>
            <circle className="avf-spark-1" cx="24" cy="34" r="2.6" fill="#FFF4CC" />
            <circle className="avf-spark-2" cx="136" cy="36" r="2.4" fill="#7CF7E4" />
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
      <FrameGraphic frameId={activeFrame} tier={tier} badgeLevel={context.featuredBadge?.levelCode} />
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
