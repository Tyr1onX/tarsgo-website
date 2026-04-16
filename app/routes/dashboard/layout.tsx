import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, redirect, useLocation, useNavigate } from "react-router";

import type { Route } from "./+types/layout";
import type { ApiEnvelope } from "~/lib/api-client";
import { ApiError, buildApiUrl } from "~/lib/api-client";
import { logout, type AuthUser } from "~/lib/auth-client";
import {
  canAccessDashboardAdminPath,
  getUserDashboardMenu,
  getVisibleAdminDashboardMenu,
  hasDashboardAdminAccess,
  type DashboardMenuIconKey,
  type DashboardMenuLink,
  type VisibleDashboardAdminMenuItem,
} from "~/lib/dashboard-navigation";

export interface DashboardLayoutOutletContext {
  currentUser: AuthUser;
}

const CONTENT_TRANSITION_MS = 280;
const DESKTOP_DASHBOARD_MEDIA = "(min-width: 1024px)";

function getIsDesktopDashboardViewport() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.matchMedia(DESKTOP_DASHBOARD_MEDIA).matches;
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentPath = new URL(request.url);

  try {
    const currentUser = await fetchCurrentUser(request);
    const pathname = currentPath.pathname;

    if (
      pathname.startsWith("/dashboard/admin") &&
      !canAccessDashboardAdminPath(currentUser.role.name, pathname)
    ) {
      throw redirect("/dashboard/users");
    }

    return { currentUser };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const redirectTarget = `${currentPath.pathname}${currentPath.search}`;
      throw redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
    }
    throw error;
  }
}

function MenuIcon({ iconKey }: { iconKey: DashboardMenuIconKey }) {
  switch (iconKey) {
    case "people":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      );
    case "registration":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </svg>
      );
    case "dashboard":
    default:
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      );
  }
}

function SidebarItem({
  item,
  onNavigate,
  viewTransition,
}: {
  item: DashboardMenuLink | VisibleDashboardAdminMenuItem;
  onNavigate: () => void;
  viewTransition: boolean;
}) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(() => {
    if (!("children" in item)) {
      return false;
    }
    return item.children.some((child) => location.pathname === child.href);
  });

  useEffect(() => {
    if (!("children" in item)) {
      return;
    }
    if (item.children.some((child) => location.pathname === child.href)) {
      setExpanded(true);
    }
  }, [item, location.pathname]);

  if ("children" in item) {
    const isActive = item.children.some((child) => location.pathname === child.href);

    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${
            isActive
              ? "text-white bg-white/5"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <span className={isActive ? "text-primary-400" : ""}>
            <MenuIcon iconKey={item.iconKey} />
          </span>
          <span className="flex-1 text-left">{item.label}</span>
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {expanded ? (
          <div className="mt-1 ml-8 space-y-1">
            {item.children.map((child) => (
              <NavLink
                key={child.href}
                to={child.href}
                onClick={onNavigate}
                viewTransition={viewTransition}
                className={({ isActive }) =>
                  `block px-3 py-2 text-sm rounded-lg transition-colors ${
                    isActive
                      ? "text-primary-400 bg-primary-500/10"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <NavLink
      to={item.href}
      end
      onClick={onNavigate}
      viewTransition={viewTransition}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${
          isActive
            ? "text-primary-400 bg-primary-500/10"
            : "text-gray-400 hover:text-white hover:bg-white/5"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? "text-primary-400" : ""}>
            <MenuIcon iconKey={item.iconKey} />
          </span>
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isDesktopViewport, setIsDesktopViewport] = useState(getIsDesktopDashboardViewport);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const contentPanelRef = useRef<HTMLDivElement | null>(null);
  const { currentUser } = loaderData;
  const userMenuItems = getUserDashboardMenu(currentUser);
  const adminMenuItems = getVisibleAdminDashboardMenu(currentUser.role.name);
  const showAdminSection = hasDashboardAdminAccess(currentUser.role.name) && adminMenuItems.length > 0;
  const userInitial = (currentUser.nickname?.trim() || currentUser.email.trim() || "U")
    .charAt(0)
    .toUpperCase();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(DESKTOP_DASHBOARD_MEDIA);
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!isDesktopViewport) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const panel = contentPanelRef.current;
    if (!panel) {
      return;
    }

    const animation = panel.animate(
      [
        {
          opacity: 0,
          transform: "translateY(18px) scale(0.985)",
          filter: "blur(8px)",
        },
        {
          opacity: 1,
          transform: "translateY(0) scale(1)",
          filter: "blur(0)",
        },
      ],
      {
        duration: CONTENT_TRANSITION_MS,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "both",
      },
    );

    return () => {
      animation.cancel();
    };
  }, [isDesktopViewport, location.pathname]);

  function handleSidebarNavigate() {
    if (!isDesktopViewport) {
      setSidebarOpen(false);
    }
  }

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 h-16 border-b border-gray-800 shrink-0">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm tracking-wide">TARS-GO</div>
              <div className="text-[11px] text-gray-500">统一工作台</div>
            </div>
          </Link>
          <button
            type="button"
            className="lg:hidden ml-auto p-1 text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div>
            <p className="px-3 text-[11px] uppercase tracking-[0.28em] text-gray-500">用户功能</p>
            <div className="mt-3 space-y-1">
              {userMenuItems.map((item) => (
                <SidebarItem
                  key={item.key}
                  item={item}
                  onNavigate={handleSidebarNavigate}
                  viewTransition={isDesktopViewport}
                />
              ))}
            </div>
          </div>

          {showAdminSection ? (
            <div className="mt-6 pt-5 border-t border-gray-800">
              <p className="px-3 text-[11px] uppercase tracking-[0.28em] text-gray-500">管理功能</p>
              <div className="mt-3 space-y-1">
                {adminMenuItems.map((item) => (
                  <SidebarItem
                    key={item.key}
                    item={item}
                    onNavigate={handleSidebarNavigate}
                    viewTransition={isDesktopViewport}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div className="px-4 py-4 border-t border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center">
              <span className="text-primary-400 text-xs font-medium">{userInitial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {currentUser.nickname || currentUser.role.displayName}
              </div>
              <div className="text-xs text-gray-500 truncate">{currentUser.email}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-4 h-16 px-4 sm:px-6 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
          <button
            type="button"
            className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开侧边栏"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              {currentUser.role.displayName}
            </div>
            <div className="text-xs text-gray-500 truncate">{currentUser.email}</div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-300 border border-gray-700 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            {loggingOut ? "退出中..." : "登出"}
          </button>

          <Link
            to="/"
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            返回官网
          </Link>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div
            ref={contentPanelRef}
            className="relative will-change-transform"
            style={{ viewTransitionName: "dashboard-content" }}
          >
            <Outlet context={{ currentUser } satisfies DashboardLayoutOutletContext} />
          </div>
        </main>
      </div>
    </div>
  );
}

async function fetchCurrentUser(request: Request): Promise<AuthUser> {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (typeof window === "undefined") {
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.set("Cookie", cookie);
    }
  }

  const response = await fetch(buildApiUrl("/api/me"), {
    method: "GET",
    credentials: "include",
    headers,
  });

  let payload: ApiEnvelope<{ user: AuthUser }> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<{ user: AuthUser }>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.code >= 400) {
    throw new ApiError(
      payload?.message ?? "请求失败，请稍后重试",
      payload?.code ?? response.status,
    );
  }

  return payload.data.user;
}
