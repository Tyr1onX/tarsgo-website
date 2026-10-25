import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Link, NavLink, Outlet, redirect, useLocation, useNavigate, useRevalidator } from "react-router";

import type { Route } from "./+types/layout";
import { SiteLogo } from "~/components/site-logo";
import { ThemeControl } from "~/components/theme-control";
import { ApiError } from "~/lib/api-client";
import {
  getAuthUserRoleLabel,
  getBootstrapStatus,
  getCachedCurrentUser,
  getCurrentUser,
  getAccountSessions,
  initializeAccountSessions,
  logout,
  logoutAllAccounts,
  removeAccountSession,
  subscribeAccountSessionChange,
  switchAccountSession,
  type AccountSessionAccount,
  type AuthUser,
} from "~/lib/auth-client";
import { resolveDashboardAuth } from "~/lib/dashboard-auth-flow";
import { confirmUserGroup, getUserGroupConfirmationState, type UserGroupConfirmationState } from "~/lib/user-group-client";
import { getCandidateTodoCount } from "~/lib/admin-workbench";
import { getAdminWorkbenchSummary } from "~/lib/registrations-client";
import { leaveClient, subscribeLeaveSummaryChange } from "~/lib/leave-client";
import {
  canAccessDashboardAdminPath,
  canAccessExpedition,
  getCoreDashboardMenu,
  getDefaultDashboardPath,
  hasSkillGroupAccess,
  hasTechnicalGroupAccess,
  getUserDashboardMenu,
  getVisibleAdminDashboardMenu,
  hasDashboardAdminAccess,
  isDashboardMenuPathActive,
  type DashboardMenuIconKey,
  type DashboardMenuLink,
  type VisibleDashboardAdminMenuItem,
} from "~/lib/dashboard-navigation";

export interface DashboardLayoutOutletContext {
  currentUser: AuthUser;
  groupResolution: UserGroupConfirmationState | null;
  groupResolutionError: string;
  refreshCandidateTodoCount: (force?: boolean) => Promise<void>;
}

const DESKTOP_DASHBOARD_MEDIA = "(min-width: 1024px)";
const SUPER_ADMIN_SETUP_PATH = "/dashboard/setup/super-admin";
const SIDEBAR_DEFAULT_WIDTH = 200;
const SIDEBAR_COLLAPSED_WIDTH = 80;
const SIDEBAR_MIN_WIDTH = 160;
const SIDEBAR_MAX_WIDTH = 420;
const MAX_SAVED_ACCOUNT_SESSIONS = 5;
const HIGH_PRIORITY_RENDER_PREFETCH_KEYS = new Set(["admin-panel", "candidate-processing", "recruitment-analytics"]);

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
  const cachedUser = getCachedCurrentUser();
  const groupRequest = getUserGroupConfirmationState(cachedUser?.id)
    .then((state) => ({ state, error: null as unknown }))
    .catch((error: unknown) => ({ state: null, error }));
  const auth = await resolveDashboardAuth({
    getCurrentUser: () => getCurrentUser(),
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

  const groupResult = await groupRequest;
  const groupResolution: UserGroupConfirmationState | null = groupResult.state;
  let groupResolutionError = "";
  if (groupResult.error) {
    if (groupResult.error instanceof ApiError && groupResult.error.status === 401) {
      const redirectTarget = `${currentPath.pathname}${currentPath.search}`;
      throw redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
    }
    groupResolutionError = groupResult.error instanceof Error ? groupResult.error.message : "所属组别暂时无法读取。";
  }

  const pathname = currentPath.pathname;
  const hasTechnicalGroup = hasTechnicalGroupAccess(groupResolution?.groups);
  const hasSkillGroup = hasSkillGroupAccess(groupResolution?.groups);
  if (
    pathname.startsWith("/dashboard/admin") &&
    !canAccessDashboardAdminPath(currentUser, pathname, hasTechnicalGroup, hasSkillGroup)
  ) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/assignments" && !hasTechnicalGroup) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/questions" && !hasTechnicalGroup) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/skills" && !hasSkillGroup && currentUser.role.name !== "super_admin") {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/expedition" && !canAccessExpedition(currentUser, hasSkillGroup)) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/expedition/projects" && !canAccessExpedition(currentUser, hasSkillGroup)) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
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
    case "report":
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3.75h5.379c.398 0 .78.158 1.06.44l3.121 3.12c.281.282.44.663.44 1.061v10.004a1.875 1.875 0 0 1-1.875 1.875H8.25a1.875 1.875 0 0 1-1.875-1.875V5.625A1.875 1.875 0 0 1 8.25 3.75Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3.75v4.5H18m-8.25 4.5h4.5m-4.5 3h4.5" />
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
  onExpandSidebar,
  collapsed = false,
  badgeCount,
  leavePendingApprovalCount,
  leaveTodoCount,
  leaveActionableCount,
}: {
  item: DashboardMenuLink | VisibleDashboardAdminMenuItem;
  onNavigate: () => void;
  onExpandSidebar?: () => void;
  collapsed?: boolean;
  badgeCount?: number | null;
  leavePendingApprovalCount?: number | null;
  leaveTodoCount?: number | null;
  leaveActionableCount?: number | null;
}) {
  const location = useLocation();
  const isActive = "children" in item && item.children.some((child) => isDashboardMenuPathActive(location.pathname, child.href));
  const [expanded, setExpanded] = useState(() => isActive);

  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    }
  }, [isActive, location.pathname]);

  if ("children" in item) {
    const childrenId = `dashboard-menu-${item.key}`;
    const isExpanded = expanded && !collapsed;

    return (
      <div>
        <button
          type="button"
          onClick={() => {
            if (collapsed) {
              onExpandSidebar?.();
              setExpanded(true);
              return;
            }
            setExpanded((current) => !current);
          }}
          aria-label={item.label}
          aria-expanded={isExpanded}
          aria-controls={childrenId}
          title={collapsed ? item.label : undefined}
          className={`w-full flex items-center gap-3 rounded-xl py-2.5 text-sm transition-colors ${collapsed ? "justify-center px-2" : "px-3"} ${
            isActive
              ? "dashboard-nav-link dashboard-nav-link--active"
              : "dashboard-nav-link"
          }`}
        >
          <span className={isActive ? "dashboard-shell__accent" : ""}>
            <MenuIcon iconKey={item.iconKey} />
          </span>
          <span className={`min-w-0 flex-1 truncate text-left ${collapsed ? "sr-only" : ""}`}>{item.label}</span>
          <svg
            className={`w-4 h-4 transition-transform duration-300 ease-out ${collapsed ? "hidden" : ""} ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <div
          id={childrenId}
          className={`grid transition-all duration-300 ease-out ${
            isExpanded ? "grid-rows-[1fr] opacity-100 mt-1" : "grid-rows-[0fr] opacity-0 mt-0"
          }`}
          aria-hidden={!isExpanded}
        >
          <div className="overflow-hidden">
            <div className="ml-8 space-y-1">
              {item.children.map((child) => (
                <NavLink
                  key={child.href}
                  to={child.href}
                  end={child.href === "/dashboard/admin"}
                  prefetch={HIGH_PRIORITY_RENDER_PREFETCH_KEYS.has(child.key) ? "render" : "intent"}
                  onClick={onNavigate}
                  tabIndex={isExpanded ? 0 : -1}
                  className={({ isActive }) =>
                    `flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                      isActive
                      ? "dashboard-nav-link dashboard-nav-link--active"
                      : "dashboard-nav-link"
                    }`
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{child.label}</span>
                  {child.key === "candidate-processing" && (badgeCount ?? 0) > 0 ? (
                    <span className="dashboard-nav-badge" aria-label={`${badgeCount} 项待处理`}>{badgeCount}</span>
                  ) : null}
                  {child.key === "leave-management" && (leaveActionableCount ?? 0) > 0 ? (
                    <span className="dashboard-nav-badge" aria-label={`待审批 ${leavePendingApprovalCount ?? 0} 项，待处理 ${leaveTodoCount ?? 0} 项`}>{leaveActionableCount}</span>
                  ) : null}
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
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `relative flex min-w-0 items-center gap-3 rounded-xl py-2.5 text-sm transition-colors ${collapsed ? "justify-center px-2" : "px-3"} ${
          isActive
          ? "dashboard-nav-link dashboard-nav-link--active"
          : "dashboard-nav-link"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`relative ${isActive ? "dashboard-shell__accent" : ""}`}>
            <MenuIcon iconKey={item.iconKey} />
            {item.key === "candidate-processing" && collapsed && (badgeCount ?? 0) > 0 ? (
              <span className="dashboard-nav-badge dashboard-nav-badge--collapsed" aria-label={`${badgeCount} 项待处理`}>{badgeCount}</span>
            ) : null}
            {item.key === "leave-management" && collapsed && (leaveActionableCount ?? 0) > 0 ? (
              <span className="dashboard-nav-badge dashboard-nav-badge--collapsed" aria-label={`待审批 ${leavePendingApprovalCount ?? 0} 项，待处理 ${leaveTodoCount ?? 0} 项`}>{leaveActionableCount}</span>
            ) : null}
          </span>
          <span className={`min-w-0 flex-1 truncate ${collapsed ? "sr-only" : ""}`}>{item.label}</span>
          {item.key === "candidate-processing" && !collapsed && (badgeCount ?? 0) > 0 ? (
            <span className="dashboard-nav-badge" aria-label={`${badgeCount} 项待处理`}>{badgeCount}</span>
          ) : null}
          {item.key === "leave-management" && !collapsed && (leaveActionableCount ?? 0) > 0 ? (
            <span className="dashboard-nav-badge" aria-label={`待审批 ${leavePendingApprovalCount ?? 0} 项，待处理 ${leaveTodoCount ?? 0} 项`}>{leaveActionableCount}</span>
          ) : null}
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [accountModalMode, setAccountModalMode] = useState<"switch" | "manage" | null>(null);
  const [accountSessions, setAccountSessions] = useState<AccountSessionAccount[]>([]);
  const [accountSessionsLoading, setAccountSessionsLoading] = useState(false);
  const [accountSessionsError, setAccountSessionsError] = useState("");
  const [accountActionError, setAccountActionError] = useState("");
  const [candidateTodoState, setCandidateTodoState] = useState<{ userId: number; roleName: string; count: number | null } | null>(null);
  const [leaveActionableState, setLeaveActionableState] = useState<{ userId: number; roleName: string; pendingApprovalCount: number; todoCount: number; actionableCount: number } | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarTriggerRef = useRef<HTMLButtonElement | null>(null);
  const lastAuthRevalidationAtRef = useRef(Date.now());
  const sidebarResizeStartXRef = useRef(0);
  const sidebarResizeStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
  const { currentUser, groupResolution, groupResolutionError } = loaderData;
  const isImmersiveExpedition = location.pathname.replace(/\/$/, "") === "/dashboard/expedition";
  const isSidebarCollapsed = isDesktopViewport && sidebarCollapsed;
  const isOperationsMember = groupResolution?.groups.some((group) => group.name === "运营组") ?? false;
  const isTechnicalGroupMember = hasTechnicalGroupAccess(groupResolution?.groups);
  const hasSkillGroup = hasSkillGroupAccess(groupResolution?.groups);
  const coreMenuItems = getCoreDashboardMenu(isOperationsMember);
  const userMenuItems = getUserDashboardMenu(currentUser, isTechnicalGroupMember, hasSkillGroup);
  const adminMenuItems = getVisibleAdminDashboardMenu(currentUser, isTechnicalGroupMember, hasSkillGroup);
  const showAdminSection = hasDashboardAdminAccess(currentUser.role.name) && adminMenuItems.length > 0;
  const refreshCandidateTodoCount = useCallback(async (force = false) => {
    const userId = currentUser.id;
    if (!hasDashboardAdminAccess(currentUser.role.name)) {
      setCandidateTodoState(null);
      return;
    }

    try {
      const response = await getAdminWorkbenchSummary(userId, force);
      setCandidateTodoState({ userId, roleName: currentUser.role.name, count: getCandidateTodoCount(response.currentFormAvailable, response.summary) });
    } catch {
      setCandidateTodoState({ userId, roleName: currentUser.role.name, count: null });
    }
  }, [currentUser.id, currentUser.role.name]);
  const candidateTodoCount = candidateTodoState?.userId === currentUser.id && candidateTodoState.roleName === currentUser.role.name
    ? candidateTodoState.count
    : null;
  const refreshLeaveActionableCount = useCallback(async () => {
    if (!hasDashboardAdminAccess(currentUser.role.name)) {
      setLeaveActionableState(null);
      return;
    }
    try {
      const summary = await leaveClient.schoolSummary();
      setLeaveActionableState({ userId: currentUser.id, roleName: currentUser.role.name, pendingApprovalCount: summary.pendingApprovalCount, todoCount: summary.todoCount, actionableCount: summary.actionableCount });
    } catch {
      setLeaveActionableState(null);
    }
  }, [currentUser.id, currentUser.role.name]);
  const currentLeaveActionableState = leaveActionableState?.userId === currentUser.id && leaveActionableState.roleName === currentUser.role.name ? leaveActionableState : null;
  const userInitial = (currentUser.nickname?.trim() || currentUser.email.trim() || "U")
    .charAt(0)
    .toUpperCase();

  useEffect(() => {
    void refreshCandidateTodoCount();
  }, [refreshCandidateTodoCount]);

  useEffect(() => {
    void refreshLeaveActionableCount();
  }, [refreshLeaveActionableCount]);

  useEffect(() => {
    const revalidateAuthWhenResumed = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastAuthRevalidationAtRef.current < 30_000) return;

      lastAuthRevalidationAtRef.current = Date.now();
      void revalidator.revalidate();
    };

    window.addEventListener("focus", revalidateAuthWhenResumed);
    document.addEventListener("visibilitychange", revalidateAuthWhenResumed);
    return () => {
      window.removeEventListener("focus", revalidateAuthWhenResumed);
      document.removeEventListener("visibilitychange", revalidateAuthWhenResumed);
    };
  }, [revalidator]);

  useEffect(() => {
    if (!showAdminSection) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshCandidateTodoCount(true);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshCandidateTodoCount, showAdminSection]);

  useEffect(() => {
    if (!showAdminSection) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshLeaveActionableCount();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshLeaveActionableCount, showAdminSection]);
  useEffect(() => subscribeLeaveSummaryChange(() => { void refreshLeaveActionableCount(); }), [refreshLeaveActionableCount]);
  useEffect(() => subscribeAccountSessionChange(() => {
    window.location.assign("/dashboard");
  }), []);

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
    if (!sidebarOpen || isDesktopViewport) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSidebarOpen(false);
      sidebarTriggerRef.current?.focus();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isDesktopViewport, sidebarOpen]);

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

  function openMobileSidebar() {
    setSidebarOpen(true);
    requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLElement>("a, button")?.focus());
  }

  function closeMobileSidebar() {
    setSidebarOpen(false);
    requestAnimationFrame(() => sidebarTriggerRef.current?.focus());
  }

  function handleSidebarResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isDesktopViewport) {
      return;
    }

    event.preventDefault();
    setSidebarCollapsed(false);
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
    } catch (error) {
      setAccountActionError(getAccountActionError(error));
    } finally {
      setLoggingOut(false);
    }
  }

  async function openAccountModal(mode: "switch" | "manage") {
    setUserMenuOpen(false);
    setAccountModalMode(mode);
    setAccountSessionsError("");
    setAccountSessionsLoading(true);
    try {
      setAccountSessions(await initializeAccountSessions());
    } catch (error) {
      setAccountSessionsError(getAccountActionError(error));
    } finally {
      setAccountSessionsLoading(false);
    }
  }

  function handleAddAccount() {
    setUserMenuOpen(false);
    const redirectTarget = `${location.pathname}${location.search}`;
    const query = new URLSearchParams({ redirect: redirectTarget, addAccount: "1" });
    navigate(`/login?${query.toString()}`);
  }

  function handleReauthenticateAccount(email: string) {
    setAccountModalMode(null);
    const redirectTarget = `${location.pathname}${location.search}`;
    const query = new URLSearchParams({ email, redirect: redirectTarget, addAccount: "1", reauth: "1" });
    navigate(`/login?${query.toString()}`);
  }

  async function handleSwitchAccount(accountId: number) {
    setAccountActionError("");
    setLoggingOut(true);
    try {
      const { user } = await switchAccountSession(accountId);
      window.location.assign(getDefaultDashboardPath(user.role.name));
    } catch (error) {
      setAccountSessionsError(getAccountActionError(error));
      try { setAccountSessions(await getAccountSessions()); } catch { /* Keep the switch failure visible. */ }
      setLoggingOut(false);
    }
  }

  async function handleRemoveAccount(accountId: number) {
    const account = accountSessions.find((item) => item.id === accountId);
    if (!account) return;
    const accountLabel = account.user.nickname || account.user.email;
    const confirmation = account.status === "available"
      ? `确定移除「${accountLabel}」的已保存登录会话？这只会移除该账号，不会退出其他账号。`
      : `确定移除「${accountLabel}」的失效账号记录？`;
    if (!window.confirm(confirmation)) return;
    setAccountActionError("");
    setAccountSessionsError("");
    setLoggingOut(true);
    try {
      const result = await removeAccountSession(accountId);
      setAccountSessions(result.accounts);
      if (result.currentRemoved) {
        setAccountModalMode(null);
        navigate("/login", { replace: true });
      }
    } catch (error) {
      setAccountSessionsError(getAccountActionError(error));
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleLogoutAll() {
    setLoggingOut(true);
    setAccountActionError("");
    try {
      await logoutAllAccounts();
      setAccountModalMode(null);
      navigate("/login", { replace: true });
    } catch (error) {
      setAccountSessionsError(getAccountActionError(error));
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
    <div className="dashboard-shell admin-design min-h-screen text-white" data-immersive={isImmersiveExpedition ? "expedition" : undefined}>
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          aria-label="关闭侧边栏"
          onClick={closeMobileSidebar}
        />
      ) : null}

      <aside
        ref={sidebarRef}
        id="dashboard-sidebar"
        aria-label="统一工作台导航"
        aria-hidden={!isDesktopViewport && !sidebarOpen}
        inert={!isDesktopViewport && !sidebarOpen}
        className={`dashboard-shell__sidebar group/sidebar fixed top-0 left-0 z-50 flex h-full flex-col border-r transition-[transform,width] duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: isDesktopViewport ? (isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth) : "min(84vw, 320px)" }}
        data-collapsed={isSidebarCollapsed}
      >
        <div className={`flex shrink-0 items-center ${isSidebarCollapsed ? "h-20 flex-col justify-center gap-1 px-2" : "h-16 gap-3 px-5"}`}>
          <Link to="/" aria-label="返回 TARSGO 官网" title="返回 TARSGO 官网" className={`flex min-w-0 items-center ${isSidebarCollapsed ? "h-8 w-full flex-none justify-center" : "flex-1"}`}>
            <SiteLogo className={isSidebarCollapsed ? "h-7 max-w-[58px]" : "h-10 max-w-full"} />
          </Link>
          <button
            type="button"
            className={`dashboard-shell__sidebar-toggle hidden shrink-0 place-items-center rounded-md lg:grid ${isSidebarCollapsed ? "h-7 w-8" : "h-8 w-8"}`}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={!isSidebarCollapsed}
            title={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 20 20" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              {isSidebarCollapsed ? <path strokeLinecap="round" strokeLinejoin="round" d="m7 4 6 6-6 6M3 4v12" /> : <path strokeLinecap="round" strokeLinejoin="round" d="m13 4-6 6 6 6M17 4v12" />}
            </svg>
          </button>
          <button
            type="button"
            className="lg:hidden ml-auto p-1 text-gray-400 hover:text-white"
            onClick={closeMobileSidebar}
            aria-label="关闭侧边栏"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="dashboard-shell__divider mx-4 shrink-0" aria-hidden="true" />

        <nav className="dashboard-shell__sidebar-nav flex-1 overflow-y-auto px-3 py-4" aria-label="工作台功能">
          <div className="space-y-1">
            {coreMenuItems.map((item) => (
              <SidebarItem key={item.key} item={item} onNavigate={handleSidebarNavigate} collapsed={isSidebarCollapsed} />
            ))}
          </div>
          {userMenuItems.length > 0 ? (
            <div className={`${isSidebarCollapsed ? "mt-2 border-t border-white/[0.06] pt-2" : "mt-6 border-t border-white/[0.06] pt-5"}`}>
              <div className={`dashboard-shell__sidebar-section-title px-3 pb-2 text-[11px] uppercase tracking-[0.18em] text-gray-500 ${isSidebarCollapsed ? "sr-only" : ""}`}>个人事务</div>
              {userMenuItems.map((item) => (
                <SidebarItem
                  key={item.key}
                  item={item}
                  onNavigate={handleSidebarNavigate}
                  collapsed={isSidebarCollapsed}
                />
              ))}
            </div>
          ) : null}

          {showAdminSection ? (
            <div className={`${isSidebarCollapsed ? "mt-2 border-t border-white/[0.06] pt-2" : "mt-6 border-t border-white/[0.06] pt-5"}`}>
              <div className={`dashboard-shell__sidebar-section-title px-3 pb-2 text-[11px] uppercase tracking-[0.18em] text-gray-500 ${isSidebarCollapsed ? "sr-only" : ""}`}>管理事务</div>
              <div className="space-y-1">
                {adminMenuItems.map((item) => (
                  <SidebarItem
                    key={item.key}
                    item={item}
                    onNavigate={handleSidebarNavigate}
                    onExpandSidebar={() => setSidebarCollapsed(false)}
                    collapsed={isSidebarCollapsed}
                    badgeCount={"children" in item && item.children.some((child) => child.key === "candidate-processing") ? candidateTodoCount : undefined}
                    leavePendingApprovalCount={"children" in item && item.children.some((child) => child.key === "leave-management") ? currentLeaveActionableState?.pendingApprovalCount : undefined}
                    leaveTodoCount={"children" in item && item.children.some((child) => child.key === "leave-management") ? currentLeaveActionableState?.todoCount : undefined}
                    leaveActionableCount={"children" in item && item.children.some((child) => child.key === "leave-management") ? currentLeaveActionableState?.actionableCount : undefined}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div ref={userMenuRef} className={`dashboard-shell__profile-area relative border-t border-white/[0.06] py-3 ${isSidebarCollapsed ? "px-2" : "px-3"}`}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            aria-label={`${currentUser.nickname || currentUser.email}，打开账号菜单`}
            title={isSidebarCollapsed ? currentUser.nickname || currentUser.email : undefined}
            className={`dashboard-shell__profile group w-full flex items-center gap-3 rounded-lg p-2 transition-colors ${isSidebarCollapsed ? "justify-center" : ""} ${
              userMenuOpen ? "dashboard-shell__profile--open" : ""
            }`}
          >
            <div className="dashboard-shell__avatar w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-semibold">{userInitial}</span>
            </div>
            <div className={`flex-1 min-w-0 text-left ${isSidebarCollapsed ? "hidden" : ""}`}>
              <div className="text-sm font-medium text-white truncate">
                {currentUser.nickname || getAuthUserRoleLabel(currentUser)}
              </div>
              <div className="text-xs text-gray-500 truncate">{currentUser.email}</div>
            </div>
            <svg
              aria-hidden="true"
              className={`w-4 h-4 shrink-0 transition-all duration-200 ${isSidebarCollapsed ? "hidden" : ""} ${
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
                  onClick={() => void openAccountModal("switch")}
                  role="menuitem"
                  className="dashboard-shell__account-action"
                >切换账号</button>
                <button
                  type="button"
                  onClick={handleAddAccount}
                  role="menuitem"
                  className="dashboard-shell__account-action"
                >添加账号</button>
                <button
                  type="button"
                  onClick={() => void openAccountModal("manage")}
                  role="menuitem"
                  className="dashboard-shell__account-action"
                >管理账号</button>
                <div className="dashboard-shell__account-divider" />
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
                  {loggingOut ? "退出中..." : "退出当前账号"}
                </button>
                {accountActionError ? <p role="alert" className="dashboard-shell__account-error mx-2 mt-2">{accountActionError}</p> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div
          aria-hidden="true"
          className={`absolute inset-y-0 -right-2 hidden w-4 cursor-col-resize lg:items-center lg:justify-center ${isSidebarCollapsed ? "lg:hidden" : "lg:flex"}`}
          onMouseDown={handleSidebarResizeStart}
        >
          <span
            className={`h-20 w-px rounded-full transition-colors ${
                  isResizingSidebar ? "bg-amber-300" : "bg-transparent group-hover/sidebar:bg-gray-600"
            }`}
          />
        </div>
      </aside>

      <div className="dashboard-shell__main-frame relative z-10" style={isDesktopViewport ? { paddingLeft: isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth } : undefined}>
        <header className="dashboard-shell__topbar sticky top-0 z-30 flex items-center gap-4 h-16 px-4 sm:px-6 border-b">
          <button
            ref={sidebarTriggerRef}
            type="button"
            className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white"
            onClick={openMobileSidebar}
            aria-label="打开侧边栏"
            aria-controls="dashboard-sidebar"
            aria-expanded={sidebarOpen}
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
          <div className="relative">
            <Outlet context={{ currentUser, groupResolution, groupResolutionError, refreshCandidateTodoCount } satisfies DashboardLayoutOutletContext} />
          </div>
        </main>
      </div>
      {accountModalMode ? (
        <AccountSessionDialog
          mode={accountModalMode}
          accounts={accountSessions}
          loading={accountSessionsLoading}
          busy={loggingOut}
          error={accountSessionsError}
          currentUser={currentUser}
          onClose={() => setAccountModalMode(null)}
          onSwitch={handleSwitchAccount}
          onReauthenticate={handleReauthenticateAccount}
          onRemove={handleRemoveAccount}
          onManage={() => setAccountModalMode("manage")}
          onAdd={() => {
            setAccountModalMode(null);
            handleAddAccount();
          }}
          onLogoutCurrent={() => void handleLogout()}
          onLogoutAll={() => void handleLogoutAll()}
        />
      ) : null}
    </div>
  );
}

function AccountSessionDialog({
  mode,
  accounts,
  loading,
  busy,
  error,
  currentUser,
  onClose,
  onSwitch,
  onReauthenticate,
  onRemove,
  onManage,
  onAdd,
  onLogoutCurrent,
  onLogoutAll,
}: {
  mode: "switch" | "manage";
  accounts: AccountSessionAccount[];
  loading: boolean;
  busy: boolean;
  error: string;
  currentUser: AuthUser;
  onClose: () => void;
  onSwitch: (accountId: number) => void;
  onReauthenticate: (email: string) => void;
  onRemove: (accountId: number) => void;
  onManage: () => void;
  onAdd: () => void;
  onLogoutCurrent: () => void;
  onLogoutAll: () => void;
}) {
  const title = mode === "manage" ? "管理账号" : "切换账号";
  const atCapacity = accounts.length >= MAX_SAVED_ACCOUNT_SESSIONS;

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="dashboard-shell__account-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-session-dialog-title"
        className="dashboard-shell__account-modal"
      >
        <header className="dashboard-shell__account-modal-header">
          <div>
            <h2 id="account-session-dialog-title">{title}</h2>
            <p>当前账号：{currentUser.nickname || currentUser.email} · {accounts.length} / {MAX_SAVED_ACCOUNT_SESSIONS} 个</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="dashboard-shell__account-close">×</button>
        </header>
        {error ? <div role="alert" className="admin-notice admin-notice--error mb-3">{error}</div> : null}
        {!loading && atCapacity ? (
          <div className="dashboard-shell__account-capacity" role="status">
            <span>账号名额已满。过期、已撤销或停用的记录仍占用名额；可在此重新验证或移除指定账号。</span>
            {mode === "switch" ? <button type="button" onClick={onManage} className="admin-button admin-button--quiet admin-button--small">管理已保存账号</button> : null}
          </div>
        ) : null}
        <div className="dashboard-shell__account-list" aria-busy={loading}>
          {loading ? <div role="status" className="dashboard-shell__account-empty">正在读取账号…</div> : accounts.length === 0 ? (
            <div className="dashboard-shell__account-empty">当前没有可切换的账号。</div>
          ) : accounts.map((account) => (
            <div className="dashboard-shell__account-row" key={account.id}>
              <div className="dashboard-shell__account-avatar" aria-hidden="true">
                {(account.user.nickname?.trim() || account.user.email).charAt(0).toUpperCase()}
              </div>
              <div className="dashboard-shell__account-details">
                <strong>{account.user.nickname || account.user.email}</strong>
                <span>{account.user.email}</span>
                <small>{getAuthUserRoleLabel(account.user)}</small>
              </div>
              <div className="dashboard-shell__account-controls">
                {account.current || account.user.id === currentUser.id ? (
                  <span className="dashboard-shell__account-current">当前</span>
                ) : account.status === "available" ? (
                  <button type="button" disabled={busy} onClick={() => onSwitch(account.id)} className="admin-button admin-button--secondary admin-button--small">切换</button>
                ) : account.status === "disabled" ? (
                  <span className="dashboard-shell__account-unavailable">账号已停用</span>
                ) : (
                  <>
                    <span className="dashboard-shell__account-unavailable">{account.status === "expired" ? "会话已过期" : "会话已撤销"}</span>
                    <button type="button" disabled={busy} onClick={() => onReauthenticate(account.user.email)} className="admin-button admin-button--quiet admin-button--small">重新验证</button>
                  </>
                )}
                {mode === "manage" || account.status !== "available" ? (
                  <button type="button" disabled={busy} onClick={() => onRemove(account.id)} aria-label={`移除${account.user.nickname || account.user.email}`} className="dashboard-shell__account-remove">移除</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <footer className="dashboard-shell__account-modal-footer">
          <button type="button" disabled={atCapacity} onClick={onAdd} className="admin-button admin-button--primary">{atCapacity ? "释放名额后添加" : "添加账号"}</button>
          {mode === "manage" ? (
            <div className="dashboard-shell__account-signout-actions">
              <button type="button" disabled={busy} onClick={onLogoutCurrent} className="admin-button admin-button--quiet">退出当前账号</button>
              <button type="button" disabled={busy} onClick={onLogoutAll} className="dashboard-shell__account-signout-all">退出全部账号</button>
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function getAccountActionError(error: unknown) {
  return error instanceof Error ? error.message : "账号操作失败，请重试。";
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
