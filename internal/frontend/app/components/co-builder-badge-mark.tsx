import { useId } from "react";

import type { CoBuilderBadgeSummary } from "~/lib/co-builder-badge-client";

type BadgeLevel = CoBuilderBadgeSummary["levelCode"];

const metal = {
  none: { shadow: "#30363a", low: "#646d72", mid: "#a6afb2", bright: "#e0e4e4" },
  bronze: { shadow: "#392517", low: "#80502f", mid: "#b8814c", bright: "#f0cf9b" },
  silver: { shadow: "#30383f", low: "#747f89", mid: "#b5c0c9", bright: "#f4f7f8" },
  gold: { shadow: "#3e2c12", low: "#98702b", mid: "#d2a34c", bright: "#ffedbd" },
} satisfies Record<BadgeLevel, { shadow: string; low: string; mid: string; bright: string }>;

const levelLabels: Record<BadgeLevel, string> = {
  none: "未获得",
  bronze: "青铜 I",
  silver: "白银 II",
  gold: "黄金 III",
};

export function CoBuilderBadgeMark({
  level,
  size = 48,
  className,
}: {
  level: BadgeLevel;
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const colors = metal[level];
  const inactive = level === "none";

  return (
    <svg
      aria-label={`吉甲共建者 ${levelLabels[level]}勋章`}
      className={className}
      height={size}
      role="img"
      viewBox="0 0 96 96"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`${id}-metal`} x1="8" y1="10" x2="87" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor={colors.bright} />
          <stop offset="0.38" stopColor={colors.mid} />
          <stop offset="0.72" stopColor={colors.low} />
          <stop offset="1" stopColor={colors.bright} />
        </linearGradient>
        <linearGradient id={`${id}-reverse`} x1="87" y1="10" x2="8" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor={colors.low} />
          <stop offset="0.48" stopColor={colors.bright} />
          <stop offset="1" stopColor={colors.mid} />
        </linearGradient>
      </defs>

      <path
        d="M25 5.5h46L90.5 25v46L71 90.5H25L5.5 71V25L25 5.5Z"
        fill={colors.shadow}
        stroke={colors.bright}
        strokeOpacity=".42"
        strokeWidth="1.5"
      />
      <path
        d="M26 10h44l16 16v44L70 86H26L10 70V26l16-16Z"
        fill={`url(#${id}-metal)`}
        stroke={colors.bright}
        strokeOpacity=".78"
        strokeWidth="1.2"
      />
      <path
        d="M28 16h40l12 12v40L68 80H28L16 68V28l12-12Z"
        fill="#202528"
        stroke={colors.shadow}
        strokeWidth="1.5"
      />
      <path
        d="M28 17h39l11 11M17 29v38l11 11"
        fill="none"
        stroke={colors.bright}
        strokeOpacity=".48"
        strokeWidth=".8"
      />

      {level !== "bronze" && level !== "none" ? (
        <>
          <path
            d="M33 23h30l10 10v30L63 73H33L23 63V33l10-10Z"
            fill="none"
            stroke={colors.mid}
            strokeOpacity=".84"
            strokeWidth="1.2"
          />
          <path
            d="M48 22v5m0 42v5M22 48h5m42 0h5"
            fill="none"
            stroke={colors.bright}
            strokeLinecap="square"
            strokeWidth="1.2"
          />
        </>
      ) : null}

      {level === "gold" ? (
        <>
          <path
            d="M38 29h20l9 9v20l-9 9H38l-9-9V38l9-9Z"
            fill="none"
            stroke={colors.bright}
            strokeOpacity=".64"
            strokeWidth=".9"
          />
          <path
            d="M20 33v-8h8m40 0h8v8M20 63v8h8m40 0h8v-8"
            fill="none"
            stroke={colors.bright}
            strokeLinecap="square"
            strokeWidth="1.4"
          />
          <path
            d="M48 18v3m0 54v3M18 48h3m54 0h3M27 27l2 2m38 38 2 2m0-42-2 2M29 67l-2 2"
            fill="none"
            stroke={colors.mid}
            strokeLinecap="square"
            strokeWidth="1.4"
          />
        </>
      ) : null}

      <g opacity={inactive ? 0.58 : 1}>
        <path
          d="m27 40 12-12h6l9 9v6l-7 7-6-6-6 6 7 7-6 6-12-12 7-7-4-4Z"
          fill={`url(#${id}-metal)`}
          stroke={colors.shadow}
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        <path
          d="m69 40-12-12h-6l-9 9v6l7 7 6-6 6 6-7 7 6 6 12-12-7-7 4-4Z"
          fill={`url(#${id}-reverse)`}
          stroke={colors.shadow}
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
        <path
          d="m48 37 10 5v12l-10 5-10-5V42l10-5Z"
          fill={colors.shadow}
          stroke={colors.bright}
          strokeOpacity=".84"
          strokeWidth="1.2"
        />
        <path
          d="m48 41 6 3v8l-6 3-6-3v-8l6-3Z"
          fill={colors.mid}
          stroke={colors.bright}
          strokeWidth=".8"
        />
        <path d="m48 44 3 2v4l-3 2-3-2v-4l3-2Z" fill="#202528" />
        <path
          d="m30 40 6-6m30 6-6-6M30 55l4 4m32-4-4 4"
          fill="none"
          stroke={colors.bright}
          strokeOpacity={level === "gold" ? ".92" : ".62"}
          strokeLinecap="square"
          strokeWidth="1.2"
        />
      </g>

      <g fill={colors.shadow} stroke={colors.bright} strokeOpacity=".86" strokeWidth=".8">
        <circle cx="24" cy="24" r="2.3" />
        <circle cx="72" cy="24" r="2.3" />
        <circle cx="24" cy="72" r="2.3" />
        <circle cx="72" cy="72" r="2.3" />
      </g>
      <g stroke={colors.bright} strokeLinecap="square" strokeWidth=".8">
        <path d="m22.8 24 2.4 0m45.6 0h2.4m-48.4 48 2.4 0m45.6 0h2.4" />
      </g>
    </svg>
  );
}
