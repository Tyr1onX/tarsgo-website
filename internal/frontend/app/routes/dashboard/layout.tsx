import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, redirect, useLocation, useNavigate, useRevalidator } from "react-router";

import type { Route } from "./+types/layout";
import { SiteLogo } from "~/components/site-logo";
import { ThemeControl } from "~/components/theme-control";
import { DashboardSectionNavigation } from "~/components/dashboard-section-navigation";
import { AccountMenuActionIcon, AccountMenuIdentity, AccountSessionChoices, useAccountSessionChoices } from "~/components/account-session-choices";
import { CoBuilderBadgeUnlockToast } from "~/components/co-builder-badge-unlock-toast";
import { DashboardGroupCheckinToast, markDashboardLoginCeremony } from "~/components/dashboard-group-checkin";
import {
  DashboardBackToTop,
  DashboardCommandPalette,
  DashboardMobileBottomNav,
  DashboardTopbarBreadcrumb,
  DashboardTopbarTodoPill,
  useDashboardTaskCounts,
  type DashboardTaskCounts,
} from "~/components/dashboard-steady-ui";
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
  logout,
  removeAccountSession,
  subscribeAuthStateChange,
  subscribeAccountSessionChange,
  subscribePermissionChange,
  switchAccountSession,
  type AuthUser,
} from "~/lib/auth-client";
import { resolveDashboardAuth } from "~/lib/dashboard-auth-flow";
import { clearWeeklyDashboardSnapshots } from "~/lib/weekly-dashboard-cache";
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
  getDashboardSectionKey,
  getDashboardSectionMenu,
  getDefaultDashboardPath,
  hasAssignmentGroupAccess,
  isDashboardSectionItemActive,
  type DashboardMenuIconKey,
  type DashboardMenuLink,
} from "~/lib/dashboard-navigation";

export interface DashboardLayoutOutletContext {
  currentUser: AuthUser;
  setPageTitle: (title: string) => void;
  groupResolution: UserGroupConfirmationState | null;
  groupResolutionError: string;
  taskCounts: DashboardTaskCounts;
  openMyProfile: (tab?: "overview" | "settings" | "badges") => void;
  refreshAccountProfile: () => void;
  requestBadgeReplay: (levelCode: CoBuilderBadgeLevel) => void;
  profileRevision: number;
}

const DESKTOP_DASHBOARD_MEDIA = "(min-width: 1024px)";
const SUPER_ADMIN_SETUP_PATH = "/dashboard/setup/super-admin";
const HIGH_PRIORITY_RENDER_PREFETCH_KEYS = new Set(["management"]);

type UserMenuPosition = { left: number; top: number };

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const currentPath = new URL(request.url);
  const legacyOrganizationAlias = currentPath.pathname === "/dashboard/team" || currentPath.pathname === "/dashboard/admin/organization-preview";
  const skipGroupResolution = currentPath.pathname === "/dashboard/questions";
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
  if (legacyOrganizationAlias) {
    throw redirect("/dashboard/workbench/organization");
  }

  let groupResolution: UserGroupConfirmationState | null = null;
  let groupResolutionError = "";
  if (!skipGroupResolution) {
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
  if (
    pathname.startsWith("/dashboard/admin") &&
    !canAccessDashboardAdminPath(currentUser, pathname, hasAssignmentGroup)
  ) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/assignments" && !hasAssignmentGroup) {
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
  const { accounts: accountSessions, setAccounts: setAccountSessions, loading: accountSessionsLoading,
    error: accountSessionsError, setError: setAccountSessionsError } = useAccountSessionChoices(userMenuOpen, currentUser.id);
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
  const isCommunityPostRoute = /^\/dashboard\/community\/\d+$/.test(location.pathname);
  const hasAssignmentGroup = hasAssignmentGroupAccess(groupResolution?.groups);
  const permissionsKey = groupResolution?.groups.map((group) => `${group.groupId}:${group.role}`).sort().join(",") ?? "";
  const taskCounts = useDashboardTaskCounts({ currentUser, hasAssignmentGroup, permissionsKey });
  const totalTodoCount =
    (taskCounts.weeklyPending ? 1 : 0) +
    (taskCounts.assignmentCount ?? 0) +
    (taskCounts.reviewCount ?? 0) +
    (taskCounts.recruitmentCount ?? 0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const syncTitle = () => {
      const cleanTitle = document.title.replace(/^\(\d+\)\s*/, "");
      const desired = totalTodoCount > 0 ? `(${totalTodoCount}) ${cleanTitle}` : cleanTitle;
      if (document.title !== desired) document.title = desired;
    };
    const frame = window.requestAnimationFrame(syncTitle);
    return () => {
      window.cancelAnimationFrame(frame);
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [totalTodoCount, location.pathname, pageTitle]);

  const sectionMenuItems = getDashboardSectionMenu(currentUser).filter(({ key }) => key !== "my-profile");

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia(DESKTOP_DASHBOARD_MEDIA).matches) return;
    try {
      const saved = window.localStorage.getItem("tarsgo-dashboard-sidebar-open");
      setSidebarOpen(saved === null ? true : saved === "1");
    } catch {
      setSidebarOpen(true);
    }
  }, []);
  const activeSectionKey = getDashboardSectionKey(location.pathname, currentUser.id);
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
          if (groupAuthorizationChanged) clearWeeklyDashboardSnapshots(currentUser.id);
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
      if (window.matchMedia(DESKTOP_DASHBOARD_MEDIA).matches) {
        try {
          window.localStorage.setItem("tarsgo-dashboard-sidebar-open", nextOpen ? "1" : "0");
        } catch {
          // Ignore storage failures in restricted browsing modes.
        }
      } else if (nextOpen) {
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

  function handleAddAccount() {
    setUserMenuOpen(false);
    const redirectTarget = `${location.pathname}${location.search}`;
    const query = new URLSearchParams({ redirect: redirectTarget, addAccount: "1" });
    navigate(`/login?${query.toString()}`);
  }

  function handleReauthenticateAccount(email: string) {
    setUserMenuOpen(false);
    const redirectTarget = `${location.pathname}${location.search}`;
    const query = new URLSearchParams({ email, redirect: redirectTarget, addAccount: "1", reauth: "1" });
    navigate(`/login?${query.toString()}`);
  }

  async function handleSwitchAccount(accountId: number) {
    setAccountActionError("");
    setLoggingOut(true);
    try {
      const { user } = await switchAccountSession(accountId);
      markDashboardLoginCeremony(user.id);
      setDisplayUser(user);
      setUserMenuOpen(false);
      await navigate(getDefaultDashboardPath(user.role.name), { replace: true });
      await revalidator.revalidate();
      setAccountSyncing(false);
    } catch (error) {
      setAccountSessionsError(getAccountActionError(error));
      try { setAccountSessions(await getAccountSessions()); } catch { /* Keep the switch failure visible. */ }
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleRemoveAccount(accountId: number) {
    const account = accountSessions.find((item) => item.id === accountId);
    if (!account) return;
    const accountLabel = getAuthUserName(account.user);
    const confirmation = account.current || account.user.id === currentUser.id
      ? `移除当前账号「${accountLabel}」会同时退出登录，确定吗？`
      : account.status === "available"
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
        setUserMenuOpen(false);
        navigate("/login", { replace: true });
      }
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
    <div className="dashboard-shell admin-design min-h-screen text-[var(--admin-text)]">
      <a href="#dashboard-main-content" className="skip-to-content">跳到正文内容</a>
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

          {isCommunityPostRoute && pageTitle ? (
            <div className="dashboard-shell__page-title" title={pageTitle}>{pageTitle}</div>
          ) : (
            <DashboardTopbarBreadcrumb pathname={location.pathname} currentUser={currentUser} hasAssignmentGroup={hasAssignmentGroup} />
          )}

          <div className="dashboard-shell__header-actions ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <DashboardCommandPalette currentUser={currentUser} hasAssignmentGroup={hasAssignmentGroup} />
            <DashboardTopbarTodoPill counts={taskCounts} />
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
          aria-label="站内导航"
          aria-hidden={!sidebarOpen}
          inert={!sidebarOpen}
          className={`dashboard-shell__sidebar fixed inset-y-16 left-0 z-50 flex h-[calc(100dvh-4rem)] w-[min(84vw,320px)] flex-col border-r transition-transform duration-200 lg:sticky lg:top-16 lg:bottom-auto lg:z-auto lg:h-[calc(100dvh-4rem)] lg:transform-none lg:transition-[width] lg:duration-200 ${
            sidebarOpen ? "translate-x-0 lg:w-64 lg:visible" : "-translate-x-full lg:w-0 lg:invisible lg:overflow-hidden lg:border-0"
          }`}
        >
          <nav className="dashboard-shell__sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="站内导航">
            <div className="space-y-1.5" role="group" aria-label="主要入口">
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
              counts={taskCounts}
              onNavigate={handleSidebarNavigate}
            />
          </nav>
        </aside>

        <div className="dashboard-shell__main-frame relative z-10 min-w-0 flex-1">
        <main id="dashboard-main-content" tabIndex={-1} className="p-4 sm:p-6 lg:p-8 focus:outline-none">
          <div className="dashboard-shell__content relative">
            {groupResolutionError ? <div className="admin-notice admin-notice--error mb-4" role="status">所属组别暂时无法刷新，仍使用最近一次成功结果：{groupResolutionError}</div> : null}
            <Outlet context={{ currentUser, setPageTitle: updatePageTitle, groupResolution, groupResolutionError, taskCounts, openMyProfile, refreshAccountProfile, requestBadgeReplay, profileRevision } satisfies DashboardLayoutOutletContext} />
          </div>
        </main>
        <CommunityExperienceToastHost key={currentUser.id} userID={currentUser.id} />
        </div>
      </div>
      <DashboardBackToTop />
      <DashboardMobileBottomNav
        currentUser={currentUser}
        hasAssignmentGroup={hasAssignmentGroup}
        counts={taskCounts}
      />
      <DashboardGroupCheckinToast
        key={`checkin-${currentUser.id}`}
        currentUser={currentUser}
        groups={groupResolution?.groups ?? []}
      />
      <CoBuilderBadgeUnlockToast
        key={currentUser.id}
        onOpenProfile={() => openMyProfile("badges")}
        replayRequest={currentBadgeReplayRequest}
        onReplayComplete={completeBadgeReplay}
      />
      {userMenuOpen && typeof document !== "undefined" ? createPortal(
        <div
          ref={userMenuPanelRef}
          id="dashboard-user-menu"
          role="menu"
          aria-label="账号菜单"
          className="admin-design dashboard-shell__user-menu account-menu-surface"
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
          <AccountMenuIdentity user={currentUser} groups={groupResolution?.groups ?? []} />
          <div className="account-menu-actions">
            <AccountSessionChoices
              accounts={accountSessions}
              currentUserId={currentUser.id}
              loading={accountSessionsLoading}
              busy={loggingOut}
              error={accountSessionsError}
              onSwitch={(id) => void handleSwitchAccount(id)}
              onRemove={(id) => void handleRemoveAccount(id)}
              onReauthenticate={handleReauthenticateAccount}
              onAdd={handleAddAccount}
            />
            <button type="button" onClick={() => { setUserMenuOpen(false); openMyProfile(); }}
              role="menuitem" className="account-menu-action">
              <AccountMenuActionIcon name="my-profile" />
              我的主页
            </button>
            <button type="button" onClick={() => { setUserMenuOpen(false); navigate("/dashboard"); }}
              role="menuitem" className="account-menu-action">
              <AccountMenuActionIcon name="community" />
              社区
            </button>
            <div className="account-menu-divider" role="separator" />
            <button type="button" onClick={handleLogout} disabled={loggingOut}
              role="menuitem" className="account-menu-action account-menu-action--logout">
              <AccountMenuActionIcon name="logout" />
              退出登录
            </button>
            {accountActionError ? <p role="alert" className="dashboard-shell__account-error mx-2 mt-2">{accountActionError}</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function getAccountActionError(error: unknown) {
  return error instanceof Error ? error.message : "账号操作失败，请重试。";
}