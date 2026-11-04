import { BrandLoader } from "~/components/brand-loader";
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
import { useLayoutEffect, useRef } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import NotFound, { StatusPage } from "./routes/not-found";
import fallbackFaviconHref from "../public/favicon.ico";
import { ThemeProvider } from "./components/theme-provider";
import { startPublicPageTransition } from "./lib/public-page-transition";
import { communityScrollRestorationStorageKey } from "./lib/community-scroll-restoration";

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
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
  { rel: "manifest", href: "/site.webmanifest" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#101516" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="吉甲大师" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration storageKey={communityScrollRestorationStorageKey} />
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
        <div className="route-feedback" role="status" aria-label={getNavigationMessage(navigationPath ?? location.pathname)} />
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
      className="grid min-h-screen place-items-center bg-surface-primary px-5 py-8 text-fg-primary sm:px-8 sm:py-10"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <BrandLoader label="正在打开工作台" />
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
