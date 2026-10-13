import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
} from "react-router";
import { useEffect, useState } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import NotFound, { StatusPage } from "./routes/not-found";
import faviconHref from "../public/favicon.ico";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: faviconHref, type: "image/x-icon" },
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
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
  const navigationPath = navigation.location?.pathname ?? null;
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    if (navigation.state === "idle" || !navigationPath) {
      setPendingPath(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingPath(navigationPath);
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [navigation.state, navigationPath]);

  const showRouteProgress = navigation.state !== "idle" && pendingPath === navigationPath;

  return (
    <>
      {showRouteProgress && navigationPath ? (
        <div className="route-progress" role="status" aria-live="polite">
          <span className="sr-only">{getNavigationMessage(navigationPath)}</span>
          <span className="route-progress__bar" aria-hidden="true" />
        </div>
      ) : null}
      <Outlet />
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
      <span className="sr-only">正在验证登录并打开工作台…</span>
      <div aria-hidden="true" className="mx-auto max-w-7xl motion-safe:animate-pulse motion-reduce:animate-none">
        <div className="flex items-center justify-between border-b border-[#D0AD69]/15 pb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl border border-[#D0AD69]/20 bg-[#D0AD69]/10" />
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-[#D0AD69]/20" />
              <div className="h-3 w-36 rounded bg-white/10" />
            </div>
          </div>
          <div className="hidden h-9 w-24 rounded-full bg-white/5 sm:block" />
        </div>
        <div className="space-y-6 py-8 sm:py-10">
          <div className="space-y-3">
            <div className="h-3 w-28 rounded bg-[#D0AD69]/20" />
            <div className="h-8 w-52 rounded bg-white/10" />
            <div className="h-4 w-72 max-w-full rounded bg-white/5" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-36 rounded-2xl border border-white/5 bg-white/[0.03] sm:h-40" />
            <div className="h-36 rounded-2xl border border-white/5 bg-white/[0.03] sm:h-40" />
          </div>
          <div className="h-48 rounded-2xl border border-white/5 bg-white/[0.03] sm:h-56" />
        </div>
      </div>
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
