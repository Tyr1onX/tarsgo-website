import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

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
  return <Outlet />;
}

export function HydrateFallback() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-12 w-12 rounded-2xl border border-primary-400/30 bg-primary-500/10 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-primary-300 border-t-transparent animate-spin" />
        </div>
        <div>
          <p className="text-sm font-medium tracking-[0.18em] text-primary-200 uppercase">
            TARS-GO
          </p>
          <p className="mt-2 text-sm text-gray-400">页面加载中...</p>
        </div>
      </div>
    </main>
  );
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
