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
import NotFound from "./routes/not-found";
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

  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = `${error.status}`;
    details = error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="min-h-screen bg-surface-primary flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-display font-bold text-fg-primary mb-4">
          {message}
        </h1>
        <p className="text-fg-muted mb-6">{details}</p>
        {stack && (
          <pre className="w-full p-4 overflow-x-auto text-left text-xs text-fg-dim bg-surface-light rounded-xl border border-border-subtle">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
