import { BrandLoader } from "~/components/brand-loader";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, redirect, useLocation, useNavigate, useRevalidator } from "react-router";

import type { Route } from "./+types/layout";
import { SiteLogo } from "~/components/site-logo";
import { ThemeControl } from "~/components/theme-control";
import { DashboardSectionNavigation } from "~/components/dashboard-section-navigation";
import { CoBuilderBadgeUnlockToast } from "~/components/co-builder-badge-unlock-toast";
import { CommunityExperienceToastHost } from "~/components/community-experience-toast-host";
import type { CoBuilderBadgeLevel, CoBuilderBadgeReplayRequest } from "~/lib/co-builder-badge-client";
import { ApiError } from "~/lib/api-client";
import {
  getAuthUserRoleLabel,
  getAuthUserName,
  getBootstrapStatus,
  getCurrentUser,
  getAccountSessions,
  needsCurrentUserRevalidation,
  initializeAccountSessions,
  logout,
  logoutAllAccounts,
  removeAccountSession,
  subscribeAuthStateChange,
  subscribeAccountSessionChange,
  subscribePermissionChange,
  switchAccountSession,
  type AccountSessionAccount,
  type AuthUser,
} from "~/lib/auth-client";
import { resolveDashboardAuth } from "~/lib/dashboard-auth-flow";
import { clearPersonalWorkbenchSnapshots } from "~/lib/personal-workbench-cache";
import {
  getCachedUserGroupConfirmationState,
  getUserGroupConfirmationState,
  needsUserGroupConfirmationRefresh,
  refreshUserGroupConfirmationState,
  type UserGroupConfirmationState,
} from "~/lib/user-group-client";
import {
  hasWorkbenchAccess,
  isInternalDashboardPath,
  canAccessDashboardAdminPath,
  canAccessExpedition,
  getDashboardSectionKey,
  getDashboardSectionMenu,
  getDefaultDashboardPath,
  hasAssignmentGroupAccess,
  hasTechnicalGroupAccess,
  isDashboardSectionItemActive,
  isTemporarilyUnavailableDashboardPath,
  type DashboardMenuIconKey,
  type DashboardMenuLink,
} from "~/lib/dashboard-navigation";

export interface DashboardLayoutOutletContext {
  currentUser: AuthUser;
  setPageTitle: (title: string) => void;
  groupResolution: UserGroupConfirmationState | null;
  groupResolutionError: string;
  openMyProfile: (tab?: "overview" | "settings" | "badges") => void;
  refreshAccountProfile: () => void;
  requestBadgeReplay: (levelCode: CoBuilderBadgeLevel) => void;
  profileRevision: number;
}

const DESKTOP_DASHBOARD_MEDIA = "(min-width: 1024px)";
const SUPER_ADMIN_SETUP_PATH = "/dashboard/setup/super-admin";
const MAX_SAVED_ACCOUNT_SESSIONS = 5;
const HIGH_PRIORITY_RENDER_PREFETCH_KEYS = new Set(["management"]);

type UserMenuPosition = { left: number; top: number };

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const currentPath = new URL(request.url);
  const temporarilyUnavailable = isTemporarilyUnavailableDashboardPath(currentPath.pathname);
  const legacyTeamAlias = currentPath.pathname === "/dashboard/team" || currentPath.pathname === "/dashboard/admin/organization-preview";
  const legacyCommunityAlias = currentPath.pathname === "/dashboard/questions" || currentPath.pathname === "/dashboard/admin/training/questions";
  const legacyDashboardAlias = legacyTeamAlias || legacyCommunityAlias;
  const auth = await resolveDashboardAuth({
    getCurrentUser: () => getCurrentUser({ includeGroups: true }),
    getBootstrapStatus,
    isUnauthorized: (error) => error instanceof ApiError && (error.status === 401 || error.status === 403),
  });

  if (auth.type === "setup-required") {
    throw redirect(SUPER_ADMIN_SETUP_PATH);
  }
  if (auth.type === "unauthenticated") {
    const redirectTarget = `${currentPath.pathname}${currentPath.search}`;
    throw redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
  }
  const currentUser = auth.user;
  if (!hasWorkbenchAccess(currentUser) && isInternalDashboardPath(currentPath.pathname)) {
    throw redirect("/dashboard");
  }
  if (temporarilyUnavailable) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (legacyTeamAlias) {
    throw redirect("/dashboard/workbench/organization");
  }

  let groupResolution: UserGroupConfirmationState | null = null;
  let groupResolutionError = "";
  if (!legacyDashboardAlias) {
    try {
      groupResolution = await getUserGroupConfirmationState(currentUser.id);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        const redirectTarget = `${currentPath.pathname}${currentPath.search}`;
        throw redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
      }
      groupResolution = getCachedUserGroupConfirmationState(currentUser.id);
      groupResolutionError = error instanceof Error ? error.message : "所属组别暂时无法读取。";
    }
  }

  const pathname = currentPath.pathname;
  const hasAssignmentGroup = hasAssignmentGroupAccess(groupResolution?.groups);
  const hasTechnicalGroup = hasTechnicalGroupAccess(groupResolution?.groups);
  if (
    pathname.startsWith("/dashboard/admin") &&
    !canAccessDashboardAdminPath(currentUser, pathname, hasAssignmentGroup)
  ) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/assignments" && !hasAssignmentGroup) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/expedition" && !canAccessExpedition(currentUser, hasAssignmentGroup)) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/expedition/projects" && !canAccessExpedition(currentUser, hasAssignmentGroup)) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }

  return { currentUser, groupResolution, groupResolutionError };
}

clientLoader.hydrate = true;

function MenuIcon({ iconKey }: { iconKey: DashboardMenuIconKey }) {
  switch (iconKey) {
    case "community":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.25 18.25 4 20l.85-3.7A8.5 8.5 0 1 1 7.25 18.25Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 10.5h.01m3.74 0h.01m3.74 0h.01" />
        </svg>
      );
    case "transactions":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 4.75h8A2.25 2.25 0 0 1 18.25 7v12A2.25 2.25 0 0 1 16 21.25H8A2.25 2.25 0 0 1 5.75 19V7A2.25 2.25 0 0 1 8 4.75Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75h6m-5.5 8 1.5 1.5 3.5-3.5m-5 7h5" />
        </svg>
      );
    case "team":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 0H6m6 0h6m-12 0v4m12-4v4" />
          <rect x="9" y="3" width="6" height="5" rx="1.5" />
          <rect x="3" y="16" width="6" height="5" rx="1.5" />
          <rect x="15" y="16" width="6" height="5" rx="1.5" />
        </svg>
      );
    case "management":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 20 6v5.2c0 4.65-3.1 8.2-8 9.8-4.9-1.6-8-5.15-8-9.8V6l8-3Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 11.75 2.25 2.25 4.75-4.75" />
        </svg>
      );
    case "people":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      );
    case "user":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6.75a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.118a7.5 7.5 0 0 1 15 0A17.93 17.93 0 0 1 12 21.75a17.93 17.93 0 0 1-7.5-1.632Z" />
        </svg>
      );
    case "registration":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </svg>
      );
    case "settings":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1 1 15 0 7.5 7.5 0 0 1-15 0Zm7.5-9v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.122-2.122M7.757 7.757 5.636 5.636m12.728 0-2.122 2.121M7.757 16.243l-2.121 2.121" />
        </svg>
      );
    case "analytics":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5V12m5 7.5V4.5m5 15v-5m5 5V8.25M3 19.5h18" />
        </svg>
      );
    case "report":
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3.75h5.379c.398 0 .78.158 1.06.44l3.121 3.12c.281.282.44.663.44 1.061v10.004a1.875 1.875 0 0 1-1.875 1.875H8.25a1.875 1.875 0 0 1-1.875-1.875V5.625A1.875 1.875 0 0 1 8.25 3.75Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3.75v4.5H18m-8.25 4.5h4.5m-4.5 3h4.5" />
        </svg>
      );
    case "dashboard":
    default:
      return (
        <svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      );
  }
}

function SidebarSectionItem({
  item,
  active,
  onNavigate,
}: {
  item: DashboardMenuLink;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={item.href}
      prefetch={HIGH_PRIORITY_RENDER_PREFETCH_KEYS.has(item.key) ? "render" : "intent"}
      onClick={onNavigate}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm leading-5 transition-colors ${
        active ? "dashboard-nav-link dashboard-nav-link--active" : "dashboard-nav-link"
      }`}
    >
      <span className={`relative flex h-[18px] w-[18px] shrink-0 items-center justify-center ${active ? "dashboard-shell__accent" : ""}`}>
        <MenuIcon iconKey={item.iconKey ?? "dashboard"} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileRevision, setProfileRevision] = useState(0);
  const [pageTitle, setPageTitle] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [badgeReplayRequest, setBadgeReplayRequest] = useState<CoBuilderBadgeReplayRequest | null>(null);
  const [accountModalMode, setAccountModalMode] = useState<"switch" | "manage" | null>(null);
  const [accountSessions, setAccountSessions] = useState<AccountSessionAccount[]>([]);
  const [accountSessionsLoading, setAccountSessionsLoading] = useState(false);
  const [accountSessionsError, setAccountSessionsError] = useState("");
  const [accountActionError, setAccountActionError] = useState("");
  const [userMenuPosition, setUserMenuPosition] = useState<UserMenuPosition | null>(null);
  const [displayUser, setDisplayUser] = useState(loaderData.currentUser);
  const [accountSyncing, setAccountSyncing] = useState(false);
  const [accountSyncError, setAccountSyncError] = useState("");
  const [displayGroupResolution, setDisplayGroupResolution] = useState(loaderData.groupResolution);
  const [displayGroupResolutionError, setDisplayGroupResolutionError] = useState(loaderData.groupResolutionError);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const userMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const focusUserMenuItemRef = useRef(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarTriggerRef = useRef<HTMLButtonElement | null>(null);
  const badgeReplaySequenceRef = useRef(0);
  const currentUser = displayUser;
  const groupResolution = displayGroupResolution;
  const groupResolutionError = displayGroupResolutionError;
  const identitySyncSequenceRef = useRef(0);

  const refreshAccountIdentity = useCallback(async () => {
    const requestId = ++identitySyncSequenceRef.current;
    setAccountSyncing(true);
    setAccountSyncError("");
    try {
      const user = await getCurrentUser({ force: true });
      if (identitySyncSequenceRef.current !== requestId) return;
      setDisplayUser(user);
      const groups = await refreshUserGroupConfirmationState(user.id);
      if (identitySyncSequenceRef.current !== requestId) return;
      setDisplayGroupResolution(groups);
      setDisplayGroupResolutionError("");
      await revalidator.revalidate();
      if (identitySyncSequenceRef.current === requestId) setAccountSyncing(false);
    } catch (error) {
      if (identitySyncSequenceRef.current !== requestId) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        navigate("/login", { replace: true });
        return;
      }
      setAccountSyncError(error instanceof Error ? error.message : "账号状态暂时无法确认。");
    }
  }, [currentUser.id, navigate, revalidator]);

  useEffect(() => {
    setDisplayUser(loaderData.currentUser);
    setAccountSyncing(false);
    setAccountSyncError("");
    setDisplayGroupResolution(loaderData.groupResolution);
    setDisplayGroupResolutionError(loaderData.groupResolutionError);
  }, [loaderData.currentUser, loaderData.groupResolution, loaderData.groupResolutionError]);
  useEffect(() => {
    if (location.pathname === "/dashboard" && new URLSearchParams(location.search).get("profile") === "timetable") {
      navigate(`/dashboard/members/${currentUser.id}?tab=settings#timetable`, { replace: true });
    }
  }, [currentUser.id, location.pathname, location.search, navigate]);
  const requestBadgeReplay = useCallback((levelCode: CoBuilderBadgeLevel) => {
    badgeReplaySequenceRef.current += 1;
    setBadgeReplayRequest({ levelCode, requestId: badgeReplaySequenceRef.current, userId: currentUser.id });
  }, [currentUser.id]);
  const openMyProfile = useCallback((tab: "overview" | "settings" | "badges" = "overview") => {
    navigate(`/dashboard/members/${currentUser.id}${tab === "overview" ? "" : `?tab=${tab}`}`);
  }, [currentUser.id, navigate]);
  const refreshAccountProfile = useCallback(() => {
    setProfileRevision((revision) => revision + 1);
    void revalidator.revalidate();
  }, [revalidator]);
  const completeBadgeReplay = useCallback((requestId: number) => {
    setBadgeReplayRequest((current) => current?.requestId === requestId ? null : current);
  }, []);
  const updatePageTitle = useCallback((title: string) => setPageTitle(title), []);
  useEffect(() => { setBadgeReplayRequest(null); }, [currentUser.id]);
  const currentBadgeReplayRequest = badgeReplayRequest?.userId === currentUser.id ? badgeReplayRequest : null;
  const isImmersiveExpedition = location.pathname.replace(/\/$/, "") === "/dashboard/expedition";
  const isCommunityPostRoute = /^\/dashboard\/community\/\d+$/.test(location.pathname);
  const hasAssignmentGroup = hasAssignmentGroupAccess(groupResolution?.groups);
  const sectionMenuItems = getDashboardSectionMenu(currentUser);
  const activeSectionKey = getDashboardSectionKey(location.pathname, currentUser.role.name, currentUser.id);
  const currentUserName = getAuthUserName(currentUser);
  const userInitial = (currentUserName || "U")
    .charAt(0)
    .toUpperCase();

  useEffect(() => subscribeAuthStateChange((user) => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (user.id !== loaderData.currentUser.id) {
      setAccountSyncing(true);
    }
    setDisplayUser(user);
  }), [loaderData.currentUser.id, navigate]);

  useEffect(() => subscribeAccountSessionChange(() => {
    void refreshAccountIdentity();
  }), [refreshAccountIdentity]);

  useEffect(() => subscribePermissionChange((userId) => {
    if (userId !== null && userId !== currentUser.id) return;
    const affectedUserId = currentUser.id;
    const requestId = ++identitySyncSequenceRef.current;
    void Promise.all([
      getCurrentUser({ force: true }),
      refreshUserGroupConfirmationState(affectedUserId),
    ]).then(async ([user, groups]) => {
      if (identitySyncSequenceRef.current !== requestId) return;
      setDisplayUser(user);
      setDisplayGroupResolution(groups);
      setDisplayGroupResolutionError("");
      await revalidator.revalidate();
    }).catch((error: unknown) => {
      if (identitySyncSequenceRef.current !== requestId) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        navigate("/login", { replace: true });
        return;
      }
      setDisplayGroupResolutionError(error instanceof Error ? error.message : "所属组别暂时无法读取。");
    });
  }), [currentUser.id, navigate, revalidator]);

  useEffect(() => {
    let active = true;
    const revalidateOnResume = () => {
      if (document.visibilityState !== "visible") return;
      const recheckUser = needsCurrentUserRevalidation();
      const recheckGroups = needsUserGroupConfirmationRefresh(currentUser.id);
      if (!recheckUser && !recheckGroups) return;

      const previousGroups = getCachedUserGroupConfirmationState(currentUser.id);
      const userRequest = recheckUser ? getCurrentUser({ force: true }) : Promise.resolve(currentUser);
      const groupRequest = recheckGroups
        ? refreshUserGroupConfirmationState(currentUser.id)
        : Promise.resolve(previousGroups);
      void Promise.allSettled([userRequest, groupRequest]).then(([userResult, groupResult]) => {
        if (!active) return;
        if (userResult.status === "rejected" && userResult.reason instanceof ApiError && (userResult.reason.status === 401 || userResult.reason.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }
        if (groupResult.status === "rejected" && groupResult.reason instanceof ApiError && (groupResult.reason.status === 401 || groupResult.reason.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }

        let routeAuthorizationChanged = false;
        if (userResult.status === "fulfilled") {
          const nextUser = userResult.value;
          routeAuthorizationChanged = nextUser.id !== currentUser.id
            || nextUser.role.id !== currentUser.role.id
            || nextUser.role.name !== currentUser.role.name
            || nextUser.workbenchAccess !== currentUser.workbenchAccess;
          setDisplayUser(nextUser);
        }
        if (groupResult.status === "fulfilled" && groupResult.value) {
          const nextGroups = groupResult.value;
          const groupAuthorizationChanged = JSON.stringify(previousGroups) !== JSON.stringify(nextGroups);
          routeAuthorizationChanged ||= groupAuthorizationChanged;
          if (groupAuthorizationChanged) clearPersonalWorkbenchSnapshots(currentUser.id);
          setDisplayGroupResolution(nextGroups);
          setDisplayGroupResolutionError("");
        } else if (groupResult.status === "rejected") {
          setDisplayGroupResolutionError(groupResult.reason instanceof Error ? groupResult.reason.message : "所属组别暂时无法读取。");
        }
        if (routeAuthorizationChanged) void revalidator.revalidate();
      });
    };

    revalidateOnResume();
    window.addEventListener("focus", revalidateOnResume);
    document.addEventListener("visibilitychange", revalidateOnResume);
    return () => {
      active = false;
      window.removeEventListener("focus", revalidateOnResume);
      document.removeEventListener("visibilitychange", revalidateOnResume);
    };
  }, [currentUser, location.key, navigate, revalidator]);

  useEffect(() => {
    if (!userMenuOpen || !userMenuPosition || !focusUserMenuItemRef.current) return;
    focusUserMenuItemRef.current = false;
    userMenuPanelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [userMenuOpen, userMenuPosition]);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !userMenuRef.current?.contains(target) && !userMenuPanelRef.current?.contains(target)) {
        setUserMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setUserMenuOpen(false);
        userMenuTriggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (
        event.key !== "Escape"
        || event.defaultPrevented
        || userMenuOpen
        || document.querySelector('[role="dialog"]')
      ) return;
      event.preventDefault();
      setSidebarOpen(false);
      sidebarTriggerRef.current?.focus();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen, userMenuOpen]);

  useLayoutEffect(() => {
    if (!userMenuOpen) {
      setUserMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = userMenuTriggerRef.current?.getBoundingClientRect();
      const panel = userMenuPanelRef.current;
      if (!anchor || !panel) return;

      const bounds = panel.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const left = Math.max(margin, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - margin));
      const below = anchor.bottom + gap;
      const above = anchor.top - bounds.height - gap;
      const top = below + bounds.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, Math.min(above, window.innerHeight - bounds.height - margin));
      setUserMenuPosition({ left, top });
    };

    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    if (userMenuTriggerRef.current) resizeObserver.observe(userMenuTriggerRef.current);
    if (userMenuPanelRef.current) resizeObserver.observe(userMenuPanelRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [userMenuOpen]);

  function handleSidebarNavigate() {
    if (!window.matchMedia(DESKTOP_DASHBOARD_MEDIA).matches) setSidebarOpen(false);
  }

  function closeMobileSidebar() {
    setSidebarOpen(false);
    requestAnimationFrame(() => sidebarTriggerRef.current?.focus());
  }

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const nextOpen = !open;
      if (nextOpen && !window.matchMedia(DESKTOP_DASHBOARD_MEDIA).matches) {
        requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLElement>("a, button")?.focus());
      }
      return nextOpen;
    });
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
      setDisplayUser(user);
      setAccountModalMode(null);
      await navigate(getDefaultDashboardPath(user.role.name), { replace: true });
      await revalidator.revalidate();
      setAccountSyncing(false);
    } catch (error) {
      setAccountSessionsError(getAccountActionError(error));
      try { setAccountSessions(await getAccountSessions()); } catch { /* Keep the switch failure visible. */ }
      setLoggingOut(false);
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleRemoveAccount(accountId: number) {
    const account = accountSessions.find((item) => item.id === accountId);
    if (!account) return;
    const accountLabel = getAuthUserName(account.user);
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

  if (accountSyncing) {
    return (
      <main className="admin-design min-h-screen px-4 py-8 sm:px-6 sm:py-12" role="status" aria-live="polite">
        <section className="admin-panel mx-auto w-full max-w-xl space-y-4 p-5 sm:p-7">
          <h1 className="admin-page-title">正在同步账号状态</h1>
          <p className="text-sm leading-6 text-[var(--admin-muted)]">账号或权限刚刚发生变化，正在确认当前可访问范围。</p>
          {accountSyncError ? <p className="admin-notice admin-notice--error">{accountSyncError}</p> : null}
          {accountSyncError ? <button type="button" className="admin-button admin-button--secondary" onClick={() => void refreshAccountIdentity()}>重试</button> : null}
        </section>
      </main>
    );
  }

  return (
    <div className="dashboard-shell admin-design min-h-screen text-[var(--admin-text)]" data-immersive={isImmersiveExpedition ? "expedition" : undefined}>
      <header className="dashboard-shell__topbar sticky top-0 z-[60] flex h-16 min-w-0 items-center gap-3 border-b px-4 sm:gap-4 sm:px-6">
          <button
            ref={sidebarTriggerRef}
            type="button"
            className="dashboard-shell__sidebar-toggle -ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[var(--admin-muted)] transition-colors hover:bg-[var(--admin-hover-overlay)] hover:text-[var(--admin-text)]"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            aria-controls="dashboard-sidebar"
            aria-expanded={sidebarOpen}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" d="M3.75 6.75h16.5" />
              <path strokeLinecap="round" d="M3.75 12h16.5" />
              <path strokeLinecap="round" d="M3.75 17.25h16.5" />
            </svg>
          </button>

          <Link to="/" aria-label="返回 TARSGO 官网" className="dashboard-shell__topbar-logo inline-flex shrink-0 items-center">
            <SiteLogo className="h-6 max-w-[88px] sm:h-7 sm:max-w-[104px]" />
          </Link>

          {isCommunityPostRoute && pageTitle ? <div className="dashboard-shell__page-title" title={pageTitle}>{pageTitle}</div> : null}

          <div className="dashboard-shell__header-actions ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeControl />
            <div ref={userMenuRef}>
              <button
                ref={userMenuTriggerRef}
                type="button"
                onClick={(event) => {
                  const willOpen = !userMenuOpen;
                  setUserMenuOpen(willOpen);
                  focusUserMenuItemRef.current = willOpen && event.detail === 0;
                }}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-controls="dashboard-user-menu"
                aria-label={`${currentUserName}，打开账号菜单`}
                className={`dashboard-shell__avatar-button ${userMenuOpen ? "is-open" : ""}`}
              >
                <span className="dashboard-shell__avatar">
                  <span aria-hidden="true" className="text-sm font-semibold">{userInitial}</span>
                  {currentUser.avatarUrl ? (
                    <img key={currentUser.avatarUrl} src={currentUser.avatarUrl} alt="" aria-hidden="true" onError={(event) => { event.currentTarget.hidden = true; }} />
                  ) : null}
                </span>
              </button>
            </div>
          </div>
      </header>

      <div className="dashboard-shell__body">
        {sidebarOpen ? (
          <button
            type="button"
            className="dashboard-shell__sidebar-backdrop fixed inset-x-0 bottom-0 top-16 z-40 bg-black/55 lg:hidden"
            aria-label="关闭侧边栏"
            onClick={closeMobileSidebar}
          />
        ) : null}

        <aside
          ref={sidebarRef}
          id="dashboard-sidebar"
          aria-label="统一工作台导航"
          aria-hidden={!sidebarOpen}
          inert={!sidebarOpen}
          className={`dashboard-shell__sidebar fixed inset-y-16 left-0 z-50 flex h-[calc(100dvh-4rem)] w-[min(84vw,320px)] flex-col border-r transition-transform duration-200 lg:sticky lg:top-16 lg:bottom-auto lg:z-auto lg:h-[calc(100dvh-4rem)] lg:transform-none lg:transition-[width] lg:duration-200 ${
            sidebarOpen ? "translate-x-0 lg:w-64 lg:visible" : "-translate-x-full lg:w-0 lg:invisible lg:overflow-hidden lg:border-0"
          }`}
        >
          <nav className="dashboard-shell__sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="工作台分区">
            <div className="space-y-1.5" role="group" aria-label="工作台分区">
              {sectionMenuItems.map((item) => {
                const isActive = isDashboardSectionItemActive(activeSectionKey, item.key);
                return (
                  <SidebarSectionItem
                    key={item.key}
                    item={item}
                    active={isActive}
                    onNavigate={handleSidebarNavigate}
                  />
                );
              })}
            </div>
            <DashboardSectionNavigation
              currentUser={currentUser}
              hasAssignmentGroup={hasAssignmentGroup}
              onNavigate={handleSidebarNavigate}
            />
          </nav>
        </aside>

        <div className="dashboard-shell__main-frame relative z-10 min-w-0 flex-1">
        <main className="p-4 sm:p-6 lg:p-8">
          <div className="dashboard-shell__content relative">
            {groupResolutionError ? <div className="admin-notice admin-notice--error mb-4" role="status">所属组别暂时无法刷新，仍使用最近一次成功结果：{groupResolutionError}</div> : null}
            <Outlet context={{ currentUser, setPageTitle: updatePageTitle, groupResolution, groupResolutionError, openMyProfile, refreshAccountProfile, requestBadgeReplay, profileRevision } satisfies DashboardLayoutOutletContext} />
          </div>
        </main>
        <CommunityExperienceToastHost key={currentUser.id} userID={currentUser.id} />
        </div>
      </div>
      <CoBuilderBadgeUnlockToast
        key={currentUser.id}
        onOpenProfile={() => openMyProfile("badges")}
        replayRequest={currentBadgeReplayRequest}
        onReplayComplete={completeBadgeReplay}
      />
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
      {userMenuOpen && typeof document !== "undefined" ? createPortal(
        <div
          ref={userMenuPanelRef}
          id="dashboard-user-menu"
          role="menu"
          aria-label="账号菜单"
          className="admin-design dashboard-shell__user-menu"
          style={{
            left: userMenuPosition?.left ?? 12,
            top: userMenuPosition?.top ?? 12,
            visibility: userMenuPosition ? "visible" : "hidden",
          } satisfies CSSProperties}
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
            if (items.length === 0) return;
            event.preventDefault();
            const currentIndex = items.indexOf(document.activeElement as HTMLElement);
            const nextIndex = event.key === "Home" ? 0
              : event.key === "End" ? items.length - 1
                : currentIndex < 0
                  ? (event.key === "ArrowDown" ? 0 : items.length - 1)
                  : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[nextIndex]?.focus();
          }}
        >
          <div className="dashboard-shell__user-menu-role">
            <div className="truncate text-sm font-medium text-[var(--admin-text)]">
              {currentUserName || getAuthUserRoleLabel(currentUser)}
            </div>
            <div className="truncate text-xs text-[var(--admin-muted)]">{currentUser.email}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[var(--admin-dim)]">
              {getAuthUserRoleLabel(currentUser)}
            </div>
          </div>
          <div className="dashboard-shell__user-menu-actions">
            {hasWorkbenchAccess(currentUser) ? <button
              type="button"
              onClick={() => { setUserMenuOpen(false); navigate("/dashboard/guide"); }}
              role="menuitem"
              className="dashboard-shell__account-action"
            >帮助与工作手册</button> : null}
            <div className="dashboard-shell__account-divider" />
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
              className="dashboard-shell__account-action dashboard-shell__account-action--danger"
            >{loggingOut ? "退出中..." : "退出当前账号"}</button>
            {accountActionError ? <p role="alert" className="dashboard-shell__account-error mx-2 mt-2">{accountActionError}</p> : null}
          </div>
        </div>,
        document.body,
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
            <p>当前账号：{getAuthUserName(currentUser)} · {accounts.length} / {MAX_SAVED_ACCOUNT_SESSIONS} 个</p>
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
          {loading ? <BrandLoader label="正在读取账号" size="sm" /> : accounts.length === 0 ? (
            <div className="dashboard-shell__account-empty">当前没有可切换的账号。</div>
          ) : accounts.map((account) => (
            <div className="dashboard-shell__account-row" key={account.id}>
              <div className="dashboard-shell__account-avatar" aria-hidden="true">
                {getAuthUserName(account.user).charAt(0).toUpperCase()}
              </div>
              <div className="dashboard-shell__account-details">
                <strong>{getAuthUserName(account.user)}</strong>
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
                  <button type="button" disabled={busy} onClick={() => onRemove(account.id)} aria-label={`移除${getAuthUserName(account.user)}`} className="dashboard-shell__account-remove">移除</button>
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
