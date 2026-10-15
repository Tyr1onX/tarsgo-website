import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Link, NavLink, Outlet, redirect, useLocation, useNavigate, useRevalidator } from "react-router";

import type { Route } from "./+types/layout";
import { SiteLogo } from "~/components/site-logo";
import { ThemeControl } from "~/components/theme-control";
import { ApiError } from "~/lib/api-client";
import { getAuthUserRoleLabel, getBootstrapStatus, getCachedCurrentUser, getCurrentUser, logout, type AuthUser } from "~/lib/auth-client";
import { resolveDashboardAuth } from "~/lib/dashboard-auth-flow";
import { confirmUserGroup, getUserGroupConfirmationState, type UserGroupConfirmationState } from "~/lib/user-group-client";
import {
  canAccessDashboardAdminPath,
  getDefaultDashboardPath,
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

const CONTENT_TRANSITION_MS = 180;
const DESKTOP_DASHBOARD_MEDIA = "(min-width: 1024px)";
const SUPER_ADMIN_SETUP_PATH = "/dashboard/setup/super-admin";
const SIDEBAR_DEFAULT_WIDTH = 200;
const SIDEBAR_MIN_WIDTH = 160;
const SIDEBAR_MAX_WIDTH = 420;
const HIGH_PRIORITY_RENDER_PREFETCH_KEYS = new Set(["admin-panel"]);

function getSidebarMaxWidth(viewportWidth: number) {
  return Math.max(SIDEBAR_DEFAULT_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.floor(viewportWidth * 0.4)));
}

function clampSidebarWidth(width: number, viewportWidth: number) {
  return Math.min(getSidebarMaxWidth(viewportWidth), Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function getIsDesktopDashboardViewport() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.matchMedia(DESKTOP_DASHBOARD_MEDIA).matches;
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const currentPath = new URL(request.url);
  const auth = await resolveDashboardAuth({
    cachedUser: getCachedCurrentUser(),
    getCurrentUser: () => getCurrentUser({ force: true }),
    getBootstrapStatus,
    isUnauthorized: (error) => error instanceof ApiError && error.status === 401,
  });

  if (auth.type === "setup-required") {
    throw redirect(SUPER_ADMIN_SETUP_PATH);
  }
  if (auth.type === "unauthenticated") {
    const redirectTarget = `${currentPath.pathname}${currentPath.search}`;
    throw redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
  }
  const currentUser = auth.user;

  const pathname = currentPath.pathname;
  if (
    pathname.startsWith("/dashboard/admin") &&
    !canAccessDashboardAdminPath(currentUser, pathname)
  ) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }

  let groupResolution: UserGroupConfirmationState | null = null;
  let groupResolutionError = "";
  try {
    groupResolution = await getUserGroupConfirmationState();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const redirectTarget = `${currentPath.pathname}${currentPath.search}`;
      throw redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
    }
    groupResolutionError = error instanceof Error ? error.message : "所属组别暂时无法读取。";
  }

  return { currentUser, groupResolution, groupResolutionError };
}

clientLoader.hydrate = true;

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
    case "settings":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1 1 15 0 7.5 7.5 0 0 1-15 0Zm7.5-9v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.122-2.122M7.757 7.757 5.636 5.636m12.728 0-2.122 2.121M7.757 16.243l-2.121 2.121" />
        </svg>
      );
    case "analytics":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5V12m5 7.5V4.5m5 15v-5m5 5V8.25M3 19.5h18" />
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
}: {
  item: DashboardMenuLink | VisibleDashboardAdminMenuItem;
  onNavigate: () => void;
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
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors ${
            isActive
              ? "dashboard-nav-link dashboard-nav-link--active"
              : "dashboard-nav-link"
          }`}
        >
          <span className={isActive ? "dashboard-shell__accent" : ""}>
            <MenuIcon iconKey={item.iconKey} />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          <svg
            className={`w-4 h-4 transition-transform duration-300 ease-out ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <div
          className={`grid transition-all duration-300 ease-out ${
            expanded ? "grid-rows-[1fr] opacity-100 mt-1" : "grid-rows-[0fr] opacity-0 mt-0"
          }`}
          aria-hidden={!expanded}
        >
          <div className="overflow-hidden">
            <div className="ml-8 space-y-1">
              {item.children.map((child) => (
                <NavLink
                  key={child.href}
                  to={child.href}
                  prefetch={expanded ? "render" : "intent"}
                  onClick={onNavigate}
                  tabIndex={expanded ? 0 : -1}
                  className={({ isActive }) =>
                    `block truncate px-3 py-2 text-sm rounded-xl transition-colors ${
                      isActive
                      ? "dashboard-nav-link dashboard-nav-link--active"
                      : "dashboard-nav-link"
                    }`
                  }
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <NavLink
      to={item.href}
      end
      prefetch={HIGH_PRIORITY_RENDER_PREFETCH_KEYS.has(item.key) ? "render" : "intent"}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex min-w-0 items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors ${
          isActive
          ? "dashboard-nav-link dashboard-nav-link--active"
          : "dashboard-nav-link"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? "dashboard-shell__accent" : ""}>
            <MenuIcon iconKey={item.iconKey} />
          </span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [isDesktopViewport, setIsDesktopViewport] = useState(getIsDesktopDashboardViewport);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const contentPanelRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarResizeStartXRef = useRef(0);
  const sidebarResizeStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
  const { currentUser, groupResolution, groupResolutionError } = loaderData;
  const userMenuItems = getUserDashboardMenu(currentUser);
  const adminMenuItems = getVisibleAdminDashboardMenu(currentUser);
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

    const syncSidebarWidth = () => {
      setSidebarWidth((current) => clampSidebarWidth(current, window.innerWidth));
    };

    syncSidebarWidth();
    window.addEventListener("resize", syncSidebarWidth);

    return () => {
      window.removeEventListener("resize", syncSidebarWidth);
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
          transform: "translateY(10px)",
        },
        {
          opacity: 1,
          transform: "translateY(0)",
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

  useEffect(() => {
    if (!isDesktopViewport) {
      setIsResizingSidebar(false);
    }
  }, [isDesktopViewport]);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || !isDesktopViewport || !isResizingSidebar) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = sidebarResizeStartWidthRef.current + event.clientX - sidebarResizeStartXRef.current;
      setSidebarWidth(clampSidebarWidth(nextWidth, window.innerWidth));
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.setProperty("cursor", "col-resize");
    document.body.style.setProperty("user-select", "none");

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, [isDesktopViewport, isResizingSidebar]);

  function handleSidebarNavigate() {
    if (!isDesktopViewport) {
      setSidebarOpen(false);
    }
  }

  function handleSidebarResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isDesktopViewport) {
      return;
    }

    event.preventDefault();
    sidebarResizeStartXRef.current = event.clientX;
    sidebarResizeStartWidthRef.current = sidebarWidth;
    setIsResizingSidebar(true);
  }

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    try {
      setLoggingOut(true);
      await logout();
      setUserMenuOpen(false);
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  if (!groupResolution || groupResolution.state === "pending") {
    return (
      <GroupConfirmationGate
        resolution={groupResolution}
        loadError={groupResolutionError}
        onConfirm={async (groupID) => {
          try {
            await confirmUserGroup(groupID);
            await revalidator.revalidate();
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              navigate("/login", { replace: true });
              return error.message;
            }
            if (error instanceof ApiError && error.status === 409) {
              await revalidator.revalidate();
            }
            return error instanceof Error ? error.message : "确认失败，请重试。";
          }
          return "";
        }}
        onRefresh={() => revalidator.revalidate()}
        refreshing={revalidator.state !== "idle"}
      />
    );
  }

  return (
    <div className="dashboard-shell admin-design min-h-screen text-white">
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`dashboard-shell__sidebar group/sidebar fixed top-0 left-0 z-50 flex h-full flex-col border-r transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center gap-3 px-5 h-16 shrink-0">
          <Link to="/" className="flex min-w-0 flex-1 items-center">
            <SiteLogo className="h-10 max-w-full" />
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

        <div className="dashboard-shell__divider mx-4 shrink-0" aria-hidden="true" />

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {userMenuItems.length > 0 ? (
            <div className="space-y-1">
              {userMenuItems.map((item) => (
                <SidebarItem
                  key={item.key}
                  item={item}
                  onNavigate={handleSidebarNavigate}
                />
              ))}
            </div>
          ) : null}

          {showAdminSection ? (
            <div className="mt-6 pt-5 border-t border-white/[0.06]">
              <div className="space-y-1">
                {adminMenuItems.map((item) => (
                  <SidebarItem
                    key={item.key}
                    item={item}
                    onNavigate={handleSidebarNavigate}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div ref={userMenuRef} className="relative px-3 py-3 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            className={`dashboard-shell__profile group w-full flex items-center gap-3 rounded-lg p-2 transition-colors ${
              userMenuOpen ? "dashboard-shell__profile--open" : ""
            }`}
          >
            <div className="dashboard-shell__avatar w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-semibold">{userInitial}</span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium text-white truncate">
                {currentUser.nickname || getAuthUserRoleLabel(currentUser)}
              </div>
              <div className="text-xs text-gray-500 truncate">{currentUser.email}</div>
            </div>
            <svg
              className={`w-4 h-4 shrink-0 transition-all duration-200 ${
                userMenuOpen
                  ? "rotate-180 dashboard-shell__accent"
                  : "text-gray-500 group-hover:text-gray-300"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.75}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
            </svg>
          </button>

          {userMenuOpen ? (
            <div
              role="menu"
              className="dashboard-shell__user-menu absolute left-3 right-3 bottom-full mb-2 overflow-hidden rounded-lg shadow-xl"
            >
              <div className="dashboard-shell__user-menu-role px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500">
                  {getAuthUserRoleLabel(currentUser)}
                </div>
              </div>
              <div className="p-1.5">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  role="menuitem"
                  className="group/item flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg
                    className="w-4 h-4 text-rose-400/70 transition-colors group-hover/item:text-rose-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.75}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                  </svg>
                  {loggingOut ? "退出中..." : "登出"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div
          aria-hidden="true"
          className="absolute inset-y-0 -right-2 hidden w-4 cursor-col-resize lg:flex lg:items-center lg:justify-center"
          onMouseDown={handleSidebarResizeStart}
        >
          <span
            className={`h-20 w-px rounded-full transition-colors ${
                  isResizingSidebar ? "bg-amber-300" : "bg-transparent group-hover/sidebar:bg-gray-600"
            }`}
          />
        </div>
      </aside>

      <div className="relative z-10" style={isDesktopViewport ? { paddingLeft: sidebarWidth } : undefined}>
        <header className="dashboard-shell__topbar sticky top-0 z-30 flex items-center gap-4 h-16 px-4 sm:px-6 border-b">
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

          <ThemeControl className="ml-auto" />
          <Link
            to="/"
            className="dashboard-shell__site-link inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            返回官网
          </Link>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div ref={contentPanelRef} className="relative">
            <Outlet context={{ currentUser } satisfies DashboardLayoutOutletContext} />
          </div>
        </main>
      </div>
    </div>
  );
}

function GroupConfirmationGate({
  resolution,
  loadError,
  onConfirm,
  onRefresh,
  refreshing,
}: {
  resolution: UserGroupConfirmationState | null;
  loadError: string;
  onConfirm: (groupID: number) => Promise<string>;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [selectedGroupID, setSelectedGroupID] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const currentSelection = resolution?.groups.some((group) => group.groupId === selectedGroupID)
    ? selectedGroupID
    : resolution?.groups[0]?.groupId ?? null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentSelection) return;
    setSaving(true);
    setError("");
    const message = await onConfirm(currentSelection);
    if (message) setError(message);
    setSaving(false);
  }

  return (
    <main className="admin-design dashboard-group-confirmation min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <section className="admin-panel mx-auto w-full max-w-xl space-y-5 p-5 sm:p-7" aria-labelledby="group-confirmation-title">
        <div>
          <div className="admin-eyebrow">账号信息</div>
          <h1 id="group-confirmation-title" className="admin-page-title mt-2">确认你的所属组别</h1>
        </div>
        {loadError ? (
          <div role="alert" className="admin-notice admin-notice--error">所属组别暂时无法读取，请刷新状态后重试。</div>
        ) : resolution?.canSelfConfirm ? (
          <>
            <p className="text-sm leading-6 text-[var(--admin-muted)]">系统检测到你的账号存在多个组别记录，请选择目前所属的组别。</p>
            <p className="text-sm leading-6 text-[var(--admin-muted)]">确认后，账号将仅保留所选组别，不影响历史报名记录。</p>
            <form onSubmit={submit} className="space-y-4">
              <fieldset className="space-y-2" aria-label="选择所属组别">
                {resolution.groups.map((group) => (
                  <label key={group.groupId} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-[var(--admin-border-subtle)] px-4 py-3 text-sm text-[var(--admin-text)]">
                    <input
                      type="radio"
                      name="user-group"
                      value={group.groupId}
                      checked={currentSelection === group.groupId}
                      onChange={() => setSelectedGroupID(group.groupId)}
                    />
                    <span>{group.name}</span>
                  </label>
                ))}
              </fieldset>
              {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
              <button type="submit" disabled={saving || currentSelection == null} className="admin-button admin-button--primary w-full sm:w-auto">
                {saving ? "正在确认…" : "确认所属组别"}
              </button>
            </form>
          </>
        ) : resolution?.state === "pending" ? (
          <>
            <p className="text-sm leading-6 text-[var(--admin-muted)]">该账号存在需要保留的组内管理身份，不能自行移除组别关系。请联系管理员处理。</p>
            <ul className="space-y-2" aria-label="当前有效组别">
              {resolution.groups.map((group) => <li key={group.groupId} className="rounded-lg border border-[var(--admin-border-subtle)] px-4 py-3 text-sm text-[var(--admin-text)]">{group.name}</li>)}
            </ul>
          </>
        ) : null}
        {error && !resolution?.canSelfConfirm ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
        <button type="button" onClick={() => { setError(""); onRefresh(); }} disabled={refreshing} className="admin-button admin-button--secondary w-full sm:w-auto">
          {refreshing ? "正在刷新…" : "刷新状态"}
        </button>
      </section>
    </main>
  );
}
