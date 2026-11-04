import { useTheme } from "./theme-provider";

export function ThemeControl() {
  const { resolvedTheme, setPreference } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const nextThemeLabel = nextTheme === "light" ? "日间白金" : "夜间黑金";

  return (
    <button
      type="button"
      className="theme-control__toggle"
      onClick={() => setPreference(nextTheme)}
      aria-label={`切换到${nextThemeLabel}模式`}
      title={`切换到${nextThemeLabel}模式`}
      data-theme={resolvedTheme}
    >
        <svg className="theme-control__sun" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3.7" />
          <path d="M12 2.5v2.1m0 14.8v2.1M4.93 4.93l1.49 1.49m11.16 11.16 1.49 1.49M2.5 12h2.1m14.8 0h2.1M4.93 19.07l1.49-1.49M17.58 6.42l1.49-1.49" />
        </svg>
        <svg className="theme-control__moon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20.4 15.2A8.35 8.35 0 0 1 8.8 3.6 8.4 8.4 0 1 0 20.4 15.2Z" />
          <path d="M16.5 3.2v3.2m-1.6-1.6h3.2" />
        </svg>
    </button>
  );
}
