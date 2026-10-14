import { useEffect, useRef, useState } from "react";

import { useTheme, type ThemePreference } from "./theme-provider";

const preferenceOptions: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "日间白金" },
  { value: "dark", label: "夜间黑金" },
  { value: "system", label: "跟随系统" },
];

const preferenceLabels: Record<ThemePreference, string> = {
  light: "日间白金",
  dark: "夜间黑金",
  system: "跟随系统",
};

export function ThemeControl({ className = "", systemOnly = false }: { className?: string; systemOnly?: boolean }) {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const visiblePreferenceOptions = systemOnly
    ? preferenceOptions.filter((option) => option.value === "system")
    : preferenceOptions;

  useEffect(() => {
    if (!optionsOpen) return;

    function handleOutsidePointer(event: PointerEvent) {
      if (controlRef.current && !controlRef.current.contains(event.target as Node)) {
        setOptionsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOptionsOpen(false);
        controlRef.current?.querySelector<HTMLButtonElement>(".theme-control__menu-toggle")?.focus();
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [optionsOpen]);

  return (
    <div ref={controlRef} className={`theme-control ${className}`.trim()}>
      <button
        type="button"
        className="theme-control__toggle"
        onClick={() => setPreference(nextTheme)}
        aria-label={`切换到${nextTheme === "light" ? "日间白金" : "夜间黑金"}模式`}
        aria-pressed={resolvedTheme === "dark"}
        title={`切换到${nextTheme === "light" ? "日间白金" : "夜间黑金"}模式`}
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
      <button
        type="button"
        className="theme-control__menu-toggle"
        aria-label={`主题偏好：${preferenceLabels[preference]}，打开主题选项`}
        aria-expanded={optionsOpen}
        onClick={() => setOptionsOpen((open) => !open)}
        title="主题选项"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      <div className="theme-control__options" role="group" aria-label="主题偏好" hidden={!optionsOpen}>
        {visiblePreferenceOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className="theme-control__option"
            aria-pressed={preference === option.value}
            onClick={() => {
              setPreference(option.value);
              setOptionsOpen(false);
              controlRef.current?.querySelector<HTMLButtonElement>(".theme-control__menu-toggle")?.focus();
            }}
          >
            <span>{option.label}</span>
            {preference === option.value ? <span aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        当前主题：{preferenceLabels[preference]}，显示{resolvedTheme === "dark" ? "夜间黑金" : "日间白金"}。
      </span>
    </div>
  );
}
