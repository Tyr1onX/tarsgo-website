import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

const THEME_STORAGE_KEY = "jijia-theme-preference";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolvedTheme = preference === "system" ? getSystemTheme() : preference;
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolvedTheme === "light" ? "#F3F1EB" : "#0B0E0E");
  return resolvedTheme;
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const preferenceRef = useRef<ThemePreference>("system");
  const transitionTimer = useRef<number | undefined>(undefined);

  const clearThemeTransition = useCallback(() => {
    window.clearTimeout(transitionTimer.current);
    transitionTimer.current = undefined;
    delete document.documentElement.dataset.themeTransition;
  }, []);

  const beginThemeTransition = useCallback(() => {
    window.clearTimeout(transitionTimer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearThemeTransition();
      return;
    }
    document.documentElement.dataset.themeTransition = "true";
    transitionTimer.current = window.setTimeout(clearThemeTransition, 240);
  }, [clearThemeTransition]);

  useEffect(() => {
    const storedPreference = readStoredPreference();
    preferenceRef.current = storedPreference;
    setPreferenceState(storedPreference);
    setResolvedTheme(applyTheme(storedPreference));

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if (preferenceRef.current !== "system") return;
      beginThemeTransition();
      setResolvedTheme(applyTheme("system"));
    };
    const syncOtherTabPreference = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      const nextPreference = isThemePreference(event.newValue) ? event.newValue : "system";
      preferenceRef.current = nextPreference;
      beginThemeTransition();
      setPreferenceState(nextPreference);
      setResolvedTheme(applyTheme(nextPreference));
    };

    mediaQuery.addEventListener("change", syncSystemTheme);
    window.addEventListener("storage", syncOtherTabPreference);
    return () => {
      mediaQuery.removeEventListener("change", syncSystemTheme);
      window.removeEventListener("storage", syncOtherTabPreference);
      clearThemeTransition();
    };
  }, [beginThemeTransition, clearThemeTransition]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    preferenceRef.current = nextPreference;
    beginThemeTransition();
    setPreferenceState(nextPreference);
    setResolvedTheme(applyTheme(nextPreference));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // Keep the current tab usable when storage is unavailable.
    }
  }, [beginThemeTransition]);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
