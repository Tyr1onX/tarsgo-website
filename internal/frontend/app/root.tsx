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
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#F3F1EB" : "#0B0E0E");
  try {
    if (
      window.location.pathname === "/" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      window.sessionStorage.getItem("tarsgo-opening-seen") !== "1"
    ) {
      root.dataset.homeOpening = "pending";
    }
  } catch {}
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as Window & { __tarsgoConsoleGreeted?: boolean };
    if (win.__tarsgoConsoleGreeted) return;
    win.__tarsgoConsoleGreeted = true;
    console.log(
      "%c TARSGO %c 吉林大学吉甲大师机器人战队 · 如果你正在看这里，欢迎来 /join 加入我们一起造机器人与共建官网 ",
      "background:#D0AD69;color:#171915;font-weight:700;padding:3px 8px;border-radius:4px 0 0 4px;",
      "background:#131918;color:#DDC48F;padding:3px 8px;border-radius:0 4px 4px 0;border:1px solid #2E3835;",
    );
  }, []);

  return (
    <>
      {isNavigating ? (
        <div className="route-feedback" role="status" aria-label={getNavigationMessage(navigationPath ?? location.pathname)} />
      ) : null}
      <NetworkStatusBanner />
      <ThemeProvider>
        <Outlet />
      </ThemeProvider>
    </>
  );
}

function NetworkStatusBanner() {
  const [status, setStatus] = useState<"online" | "offline" | "recovered">("online");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer = 0;
    if (!window.navigator.onLine) setStatus("offline");
    const handleOffline = () => {
      window.clearTimeout(timer);
      setStatus("offline");
    };
    const handleOnline = () => {
      setStatus("recovered");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setStatus("online"), 2400);
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (status === "online") return null;
  return (
    <div
      className={`network-status-banner${status === "recovered" ? " is-recovered" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="network-status-banner__dot" aria-hidden="true" />
      <span>{status === "offline" ? "当前网络连接已断开" : "网络已恢复"}</span>
    </div>
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
