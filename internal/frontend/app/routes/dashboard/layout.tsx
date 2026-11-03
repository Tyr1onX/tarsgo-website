import { useCallback, useEffect, useRef, useState, type CSSProperties, type FocusEvent as ReactFocusEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
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
  getDashboardSectionKey,
  getDashboardSectionMenu,
  getDefaultDashboardPath,
  hasAssignmentGroupAccess,
  hasSkillGroupAccess,
  hasTechnicalGroupAccess,
  getVisibleAdminDashboardMenu,
  hasDashboardAdminAccess,
  isTemporarilyUnavailableDashboardPath,
  type DashboardMenuIconKey,
  type DashboardMenuLink,
} from "~/lib/dashboard-navigation";

export interface DashboardLayoutOutletContext {
  currentUser: AuthUser;
  setPageTitle: (title: string) => void;
  groupResolution: UserGroupConfirmationState | null;
  groupResolutionError: string;
  refreshCandidateTodoCount: (force?: boolean) => Promise<void>;
  openMyProfile: (tab?: "overview" | "settings" | "badges") => void;
  refreshAccountProfile: () => void;
  requestBadgeReplay: (levelCode: CoBuilderBadgeLevel) => void;
  profileRevision: number;
}

const DESKTOP_DASHBOARD_MEDIA = "(min-width: 1024px)";
const SUPER_ADMIN_SETUP_PATH = "/dashboard/setup/super-admin";
const MAX_SAVED_ACCOUNT_SESSIONS = 5;
const HIGH_PRIORITY_RENDER_PREFETCH_KEYS = new Set(["management"]);

type TooltipPlacement = { left: number; top: number };

function DashboardTooltip({ label, children }: { label?: string; children: React.ReactNode }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);

  function show(event: ReactPointerEvent<HTMLSpanElement> | ReactFocusEvent<HTMLSpanElement>) {
    if (!label || ("pointerType" in event && event.pointerType === "touch")) return;
    const anchor = rootRef.current?.querySelector<HTMLElement>("a, button");
    const bounds = anchor?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    setPlacement({ left: bounds.right + 10, top: bounds.top + bounds.height / 2 });
  }

  function hideOnPointerLeave(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.relatedTarget instanceof Node && tooltipRef.current?.contains(event.relatedTarget)) return;
    setPlacement(null);
  }

  function hideOnBlur(event: ReactFocusEvent<HTMLSpanElement>) {
    if (event.relatedTarget instanceof Node && (rootRef.current?.contains(event.relatedTarget) || tooltipRef.current?.contains(event.relatedTarget))) return;
    setPlacement(null);
  }

  useEffect(() => {
    if (!placement) return;
    const hide = () => setPlacement(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [placement]);

  const style = placement ? { left: placement.left, top: placement.top } satisfies CSSProperties : undefined;
  return <span
    className="dashboard-tooltip-anchor"
    ref={rootRef}
    onPointerEnter={show}
    onPointerLeave={hideOnPointerLeave}
    onFocus={show}
    onBlur={hideOnBlur}
  >
    {children}
    {placement && label && typeof document !== "undefined" ? createPortal(
      <span className="dashboard-navigation-tooltip" role="tooltip" ref={tooltipRef} style={style} onPointerLeave={() => setPlacement(null)}>{label}</span>,
      document.body,
    ) : null}
  </span>;
}

function getIsDesktopDashboardViewport() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.matchMedia(DESKTOP_DASHBOARD_MEDIA).matches;
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const currentPath = new URL(request.url);
  const temporarilyUnavailable = isTemporarilyUnavailableDashboardPath(currentPath.pathname);
  const legacyTeamAlias = currentPath.pathname === "/dashboard/team" || currentPath.pathname === "/dashboard/admin/organization-preview";
  const legacyCommunityAlias = currentPath.pathname === "/dashboard/questions" || currentPath.pathname === "/dashboard/admin/training/questions";
  const legacyDashboardAlias = legacyTeamAlias || legacyCommunityAlias;
  const cachedUser = getCachedCurrentUser();
  const groupRequest = temporarilyUnavailable || legacyDashboardAlias
    ? Promise.resolve({ state: null, error: null as unknown })
    : getUserGroupConfirmationState(cachedUser?.id)
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
  if (temporarilyUnavailable) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (legacyTeamAlias) {
    throw redirect("/dashboard/workbench/organization");
  }

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
  const hasAssignmentGroup = hasAssignmentGroupAccess(groupResolution?.groups);
  const hasTechnicalGroup = hasTechnicalGroupAccess(groupResolution?.groups);
  const hasSkillGroup = hasSkillGroupAccess(groupResolution?.groups);
  const hasCapabilityGroup = Boolean(groupResolution?.groups?.length);
  if (
    pathname.startsWith("/dashboard/admin") &&
    !canAccessDashboardAdminPath(currentUser, pathname, hasAssignmentGroup)
  ) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/assignments" && !hasAssignmentGroup) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/skills" && !hasSkillGroup && currentUser.role.name !== "super_admin") {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }
  if (pathname === "/dashboard/capabilities" && !hasCapabilityGroup) {
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
  compact,
  badgeCount,
  badgeLabel,
  onNavigate,
}: {
  item: DashboardMenuLink;
  active: boolean;
  compact: boolean;
  badgeCount?: number | null;
  badgeLabel?: string;
  onNavigate: () => void;
}) {
  const hasBadge = (badgeCount ?? 0) > 0;
  const tooltip = `${item.label}${hasBadge ? ` · ${badgeLabel ?? `${badgeCount} 项待处理`}` : ""}`;

  return (
    <DashboardTooltip label={compact ? tooltip : undefined}>
    <Link
      to={item.href}
      prefetch={HIGH_PRIORITY_RENDER_PREFETCH_KEYS.has(item.key) ? "render" : "intent"}
      onClick={onNavigate}
      aria-label={hasBadge ? `${item.label}，${badgeLabel ?? `${badgeCount} 项待处理`}` : item.label}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm leading-5 transition-colors ${compact ? "justify-center px-2" : ""} ${
        active ? "dashboard-nav-link dashboard-nav-link--active" : "dashboard-nav-link"
      }`}
    >
      <span className={`relative flex h-[18px] w-[18px] shrink-0 items-center justify-center ${active ? "dashboard-shell__accent" : ""}`}>
        <MenuIcon iconKey={item.iconKey ?? "dashboard"} />
        {compact && hasBadge ? <span className="dashboard-nav-badge dashboard-nav-badge--compact" aria-label={badgeLabel ?? `${badgeCount} 项待处理`}>{badgeCount}</span> : null}
      </span>
      <span className={`min-w-0 flex-1 truncate ${compact ? "sr-only" : ""}`}>{item.label}</span>
      {!compact && hasBadge ? <span className="dashboard-nav-badge" aria-label={badgeLabel ?? `${badgeCount} 项待处理`}>{badgeCount}</span> : null}
    </Link>
    </DashboardTooltip>
  );
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [isDesktopViewport, setIsDesktopViewport] = useState(getIsDesktopDashboardViewport);
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
  const [candidateTodoState, setCandidateTodoState] = useState<{ userId: number; roleName: string; count: number | null } | null>(null);
  const [leaveActionableState, setLeaveActionableState] = useState<{ userId: number; roleName: string; pendingApprovalCount: number; todoCount: number; actionableCount: number } | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarTriggerRef = useRef<HTMLButtonElement | null>(null);
  const lastAuthRevalidationAtRef = useRef(Date.now());
  const badgeReplaySequenceRef = useRef(0);
  const { currentUser, groupResolution, groupResolutionError } = loaderData;
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
  const adminMenuItems = getVisibleAdminDashboardMenu(currentUser, hasAssignmentGroup);
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
  const currentUserName = getAuthUserName(currentUser);
  const userInitial = (currentUserName || "U")
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
    <div className="dashboard-shell admin-design min-h-screen text-[var(--admin-text)]" data-immersive={isImmersiveExpedition ? "expedition" : undefined}>
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
        className={`dashboard-shell__sidebar fixed top-0 left-0 z-50 flex h-full w-20 flex-col border-r transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={isDesktopViewport ? undefined : { width: "min(84vw, 320px)" }}
      >
        <div className="flex h-16 w-full shrink-0 items-center px-3 lg:hidden">
          <button
            type="button"
            className="lg:hidden ml-auto p-1 text-[var(--admin-muted)] hover:text-[var(--admin-text)]"
            onClick={closeMobileSidebar}
            aria-label="关闭侧边栏"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="dashboard-shell__divider mx-4 shrink-0 lg:hidden" aria-hidden="true" />

        <nav className="dashboard-shell__sidebar-nav flex-1 overflow-y-auto px-3 py-4 lg:px-2 lg:py-3" aria-label="工作台分区">
          <div className="space-y-1.5" role="group" aria-label="工作台分区">
            {sectionMenuItems.map((item) => {
              const isActive = getDashboardSectionKey(location.pathname, currentUser.role.name, currentUser.id) === item.key;
              const isWorkbench = item.key === "workbench";
              const isManagement = item.key === "management";
              const managementCount = (candidateTodoCount ?? 0) + (currentLeaveActionableState?.actionableCount ?? 0);
              const managementLabel = [
                candidateTodoCount !== null ? `${candidateTodoCount} 项报名待处理` : "",
                currentLeaveActionableState ? `请假待审批 ${currentLeaveActionableState.pendingApprovalCount} 项、待处理 ${currentLeaveActionableState.todoCount} 项` : "",
              ].filter(Boolean).join("；");
              const leaveLabel = currentLeaveActionableState
                ? `待审批 ${currentLeaveActionableState.pendingApprovalCount} 项，待处理 ${currentLeaveActionableState.todoCount} 项`
                : undefined;
              return (
                <SidebarSectionItem
                  key={item.key}
                  item={item}
                  active={isActive}
                  onNavigate={handleSidebarNavigate}
                  compact={isDesktopViewport}
                  badgeCount={isManagement ? (candidateTodoCount !== null || currentLeaveActionableState ? managementCount : null) : isWorkbench && !showAdminSection ? currentLeaveActionableState?.actionableCount : undefined}
                  badgeLabel={isManagement ? (managementLabel || undefined) : isWorkbench ? leaveLabel : undefined}
                />
              );
            })}
          </div>
          <DashboardSectionNavigation
            currentUser={currentUser}
            hasAssignmentGroup={hasAssignmentGroup}
            candidateTodoCount={candidateTodoCount}
            leaveActionableCount={currentLeaveActionableState?.actionableCount ?? null}
            compact={isDesktopViewport}
            onNavigate={handleSidebarNavigate}
          />
        </nav>

        <div ref={userMenuRef} className={`dashboard-shell__profile-area relative border-t border-[var(--admin-border-subtle)] px-3 py-3 lg:px-2`}>
          <DashboardTooltip label={isDesktopViewport && !userMenuOpen ? `${currentUserName} · 账号管理` : undefined}><button
            type="button"
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            aria-label={`${currentUserName}，打开账号管理`}
            className={`dashboard-shell__profile group w-full flex items-center gap-3 rounded-lg p-2 transition-colors ${isDesktopViewport ? "justify-center" : ""} ${
              userMenuOpen ? "dashboard-shell__profile--open" : ""
            }`}
          >
            <div className="dashboard-shell__avatar relative w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
              <span className="text-[var(--admin-text)] text-sm font-semibold">{userInitial}</span>
              {currentUser.avatarUrl ? (
                <img key={currentUser.avatarUrl} src={currentUser.avatarUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />
              ) : null}
            </div>
            <div className={`flex-1 min-w-0 text-left ${isDesktopViewport ? "hidden" : ""}`}>
              <div className="text-sm font-medium text-[var(--admin-text)] truncate">
                {currentUserName || getAuthUserRoleLabel(currentUser)}
              </div>
              <div className="text-xs text-[var(--admin-dim)] truncate">{currentUser.email}</div>
            </div>
            <svg
              aria-hidden="true"
              className={`w-4 h-4 shrink-0 transition-all duration-200 ${isDesktopViewport ? "hidden" : ""} ${
                userMenuOpen
                  ? "rotate-180 dashboard-shell__accent"
                  : "text-[var(--admin-dim)] group-hover:text-[var(--admin-muted)]"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.75}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
            </svg>
          </button></DashboardTooltip>

          {userMenuOpen ? (
            <div
              role="menu"
              className="dashboard-shell__user-menu absolute left-3 right-3 bottom-full mb-2 overflow-hidden rounded-lg shadow-xl"
            >
              <div className="dashboard-shell__user-menu-role px-3 py-2.5">
                <div className="truncate text-sm font-medium text-[var(--admin-text)]">
                  {currentUserName || getAuthUserRoleLabel(currentUser)}
                </div>
                <div className="truncate text-xs text-[var(--admin-muted)]">{currentUser.email}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[var(--admin-dim)]">
                  {getAuthUserRoleLabel(currentUser)}
                </div>
              </div>
              <div className="p-1.5">
                <button
                  type="button"
                  onClick={() => { setUserMenuOpen(false); navigate("/dashboard/guide"); }}
                  role="menuitem"
                  className="dashboard-shell__account-action"
                >帮助与工作手册</button>
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
                  className="group/item flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[var(--admin-danger)] transition-colors hover:bg-[var(--admin-danger-surface)] hover:text-[var(--admin-danger)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg
                    className="w-4 h-4 text-[var(--admin-danger)] transition-colors group-hover/item:text-[var(--admin-danger)]"
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

      </aside>

      <div className="dashboard-shell__main-frame relative z-10 lg:pl-20">
        <header className="dashboard-shell__topbar sticky top-0 z-30 flex items-center gap-4 h-16 px-4 sm:px-6 border-b">
          <button
            ref={sidebarTriggerRef}
            type="button"
            className="lg:hidden p-2 -ml-2 text-[var(--admin-muted)] hover:text-[var(--admin-text)]"
            onClick={openMobileSidebar}
            aria-label="打开侧边栏"
            aria-controls="dashboard-sidebar"
            aria-expanded={sidebarOpen}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          <Link to="/" aria-label="返回 TARSGO 官网" className="dashboard-shell__topbar-logo inline-flex shrink-0 items-center">
            <SiteLogo className="h-6 max-w-[88px] sm:h-7 sm:max-w-[104px]" />
          </Link>

          {isCommunityPostRoute && pageTitle ? <div className="dashboard-shell__page-title" title={pageTitle} aria-label={pageTitle}>{pageTitle}</div> : null}

          <ThemeControl className="ml-auto" />
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="dashboard-shell__content relative">
            <Outlet context={{ currentUser, setPageTitle: updatePageTitle, groupResolution, groupResolutionError, refreshCandidateTodoCount, openMyProfile, refreshAccountProfile, requestBadgeReplay, profileRevision } satisfies DashboardLayoutOutletContext} />
          </div>
        </main>
        <CommunityExperienceToastHost key={currentUser.id} userID={currentUser.id} />
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
          {loading ? <div role="status" className="dashboard-shell__account-empty">正在读取账号…</div> : accounts.length === 0 ? (
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
