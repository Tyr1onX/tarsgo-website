import { useTheme } from "./theme-provider";

const SUN = [
  "00000100000",
  "00100100100",
  "00010101000",
  "00001110000",
  "00011111000",
  "11111111111",
  "00011111000",
  "00001110000",
  "00010101000",
  "00100100100",
  "00000100000",
];

const MOON = [
  "00000110000",
  "00011110000",
  "00111100000",
  "01111000000",
  "01110000000",
  "01110000000",
  "01111000000",
  "00111100000",
  "00011111000",
  "00000111000",
  "00000000000",
];

function pixelPath(rows: string[]) {
  return rows.flatMap((row, y) =>
    [...row].flatMap((pixel, x) => pixel === "1" ? [`M${x} ${y}h1v1h-1z`] : []),
  ).join("");
}

const sunPath = pixelPath(SUN);
const moonPath = pixelPath(MOON);

export function ThemeControl() {
  const { resolvedTheme, setPreference } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      className="theme-light-switch"
      role="switch"
      aria-label="深色模式"
      aria-checked={dark}
      title={dark ? "切换至白天" : "切换至夜晚"}
      onClick={() => setPreference(dark ? "light" : "dark")}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "Home") {
          event.preventDefault();
          setPreference("light");
        } else if (event.key === "ArrowRight" || event.key === "End") {
          event.preventDefault();
          setPreference("dark");
        }
      }}
    >
      <span className="theme-light-switch__track" aria-hidden="true">
        <span className="theme-light-switch__thumb">
          <svg className="theme-light-switch__glyph" viewBox="0 0 11 11" shapeRendering="crispEdges">
            <path className="theme-light-switch__sun" d={sunPath} />
            <path className="theme-light-switch__moon" d={moonPath} />
          </svg>
        </span>
      </span>
    </button>
  );
}
