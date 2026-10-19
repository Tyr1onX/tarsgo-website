import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigation,
} from "react-router";
import { useEffect, useLayoutEffect, useRef } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import NotFound, { StatusPage } from "./routes/not-found";
import fallbackFaviconHref from "../public/favicon.ico";
import { ThemeProvider } from "./components/theme-provider";
import { startPublicPageTransition } from "./lib/public-page-transition";

export function meta() {
  return [{ title: "吉甲大师战队官网 | TARSGO" }];
}

const themeBootstrapScript = `(() => {
  let preference = "system";
  try {
    const saved = window.localStorage.getItem("jijia-theme-preference");
    if (saved === "light" || saved === "dark" || saved === "system") preference = saved;
  } catch {}
  const resolved = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
})();`;

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: fallbackFaviconHref, type: "image/x-icon" },
  { rel: "icon", href: "/assets/images/Logo/tarsgo-robot-v5.svg", type: "image/svg+xml" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Anton&family=Geist+Mono:wght@400;500;600;700&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigation = useNavigation();
  const location = useLocation();
  const navigationPath = navigation.location?.pathname ?? null;
  const isNavigating = navigation.state !== "idle" && Boolean(navigationPath);
  const previousPathname = useRef(location.pathname);
  const pageAnimation = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    if (previousPathname.current === location.pathname) return;
    previousPathname.current = location.pathname;

    pageAnimation.current?.cancel();
    pageAnimation.current = null;

    const pageContent = document.querySelector<HTMLElement>(".public-route-content");
    if (!pageContent) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animation = startPublicPageTransition(pageContent, reducedMotion.matches);
    if (!animation) return;

    pageAnimation.current = animation;
    const cancelAnimation = () => {
      animation.cancel();
      if (pageAnimation.current === animation) pageAnimation.current = null;
    };
    const stopForReducedMotion = (event: MediaQueryListEvent) => {
      if (event.matches) cancelAnimation();
    };
    reducedMotion.addEventListener("change", stopForReducedMotion);
    animation.onfinish = () => {
      reducedMotion.removeEventListener("change", stopForReducedMotion);
      cancelAnimation();
    };

    return () => {
      reducedMotion.removeEventListener("change", stopForReducedMotion);
      cancelAnimation();
    };
  }, [location.pathname]);

  return (
    <>
      {isNavigating ? (
        <div className="route-progress" role="status" aria-live="polite">
          <span className="sr-only">{getNavigationMessage(navigationPath ?? location.pathname)}</span>
          <span className="route-progress__line" aria-hidden="true" />
        </div>
      ) : null}
      <ThemeProvider>
        <Outlet />
      </ThemeProvider>
    </>
  );
}

export function HydrateFallback() {
  return (
    <main
      className="min-h-screen bg-surface-primary px-5 py-8 text-fg-primary sm:px-8 sm:py-10"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="mx-auto max-w-7xl py-8">正在验证登录并打开工作台…</p>
    </main>
  );
}

function getNavigationMessage(pathname: string) {
  if (pathname === "/login") return "正在打开登录页…";
  if (pathname.startsWith("/dashboard")) return "正在打开工作台…";
  return "正在切换页面…";
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFound />;
  }

  const status = isRouteErrorResponse(error) ? error.status : 500;
  const title = status === 401 ? "请先登录" : status === 403 ? "无权访问" : "页面暂时无法访问";
  const description = status === 401
    ? "登录后再尝试访问该页面。"
    : status === 403
      ? "当前账号没有访问该页面的权限。"
      : "页面加载失败，请稍后再试。";

  return (
    <StatusPage
      status={status}
      title={title}
      description={description}
      debugDetails={import.meta.env.DEV && error instanceof Error ? error.stack ?? error.message : undefined}
    />
  );
}
