import { Link, PrefetchPageLinks, useLocation, useNavigate, useRevalidator } from "react-router";
import { useEffect, useRef, useState } from "react";

import {
  getAuthUserRoleLabel,
  getAuthUserName,
  getCachedCurrentUser,
  getOptionalCurrentUser,
  hasKnownAnonymousSession,
  logout,
  subscribeAccountSessionChange,
  subscribeAuthStateChange,
  subscribePermissionChange,
  type AuthUser,
} from "~/lib/auth-client";
import { getDashboardSectionKey, getDashboardSectionMenu, getDefaultDashboardPath } from "~/lib/dashboard-navigation";
import { resolveGroupIdentity, type GroupIdentity } from "~/lib/group-identity";
import {
  getCachedUserGroupConfirmationState,
  getUserGroupConfirmationState,
  needsUserGroupConfirmationRefresh,
  refreshUserGroupConfirmationState,
  type UserGroupConfirmationState,
} from "~/lib/user-group-client";
import { teamIdentityLabel } from "./community-team-identity";
import { SiteLogo } from "./site-logo";
import { ThemeControl } from "./theme-control";

type NavbarProps = {
  currentUser?: AuthUser | null;
  authError?: boolean;
};

type GroupIdentityStatus =
  | { userId: number; status: "loading" }
  | { userId: number; status: "ready"; state: UserGroupConfirmationState }
  | { userId: number; status: "error" };

export function Navbar({ currentUser, authError = false }: NavbarProps) {
  const [observedUser, setObservedUser] = useState<AuthUser | null | undefined>(() =>
    currentUser !== undefined ? currentUser : getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : undefined),
  );
  const visibleUser = currentUser === undefined ? observedUser : currentUser;
  const [identityRefreshError, setIdentityRefreshError] = useState(false);
  const [groupState, setGroupState] = useState<GroupIdentityStatus | null>(null);
  const groupStateMatchesUser = Boolean(visibleUser && groupState?.userId === visibleUser.id);
  const groupIdentityLoading = Boolean(visibleUser && (!groupStateMatchesUser || groupState?.status === "loading"));
  const groupIdentity = groupStateMatchesUser && groupState?.status === "ready"
    ? resolveGroupIdentity(groupState.state)
    : null;
  const visibleAuthError = visibleUser === undefined && (authError || identityRefreshError);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [dashboardPrefetchUserId, setDashboardPrefetchUserId] = useState<number | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const identityRequestGenerationRef = useRef(0);
  const location = useLocation();
  const accountMenuItems = visibleUser
    ? getDashboardSectionMenu(visibleUser)
      .filter((item) => item.key !== "community")
      .sort((a, b) => Number(b.key === "my-profile") - Number(a.key === "my-profile"))
    : [];
  const accountSection = visibleUser
    ? getDashboardSectionKey(location.pathname, visibleUser.role.name, visibleUser.id)
    : null;
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  useEffect(() => {
    let disposed = false;
    const unsubscribeAuth = subscribeAuthStateChange((user) => {
      identityRequestGenerationRef.current += 1;
      if (!disposed) {
        setObservedUser(user);
        setIdentityRefreshError(false);
        setUserMenuOpen(false);
      }
    });
    const unsubscribeAccount = subscribeAccountSessionChange(() => {
      const requestGeneration = ++identityRequestGenerationRef.current;
      setObservedUser(undefined);
      setGroupState(null);
      setIdentityRefreshError(false);
      setUserMenuOpen(false);
      void getOptionalCurrentUser({ force: true })
        .then((user) => {
          if (!disposed && requestGeneration === identityRequestGenerationRef.current) setObservedUser(user);
        })
        .catch(() => {
          if (!disposed && requestGeneration === identityRequestGenerationRef.current) setIdentityRefreshError(true);
        });
    });

    if (currentUser === undefined) {
      const initialGeneration = identityRequestGenerationRef.current;
      void getOptionalCurrentUser()
        .then((user) => {
          if (!disposed && initialGeneration === identityRequestGenerationRef.current) setObservedUser(user);
        })
        .catch(() => {
          if (!disposed && initialGeneration === identityRequestGenerationRef.current) setIdentityRefreshError(true);
        });
    }

    return () => {
      disposed = true;
      unsubscribeAuth();
      unsubscribeAccount();
    };
  }, []);

  useEffect(() => {
    const userId = visibleUser?.id;
    setUserMenuOpen(false);
    if (!userId) {
      setGroupState(null);
      return;
    }

    let active = true;
    const cachedGroup = getCachedUserGroupConfirmationState(userId);
    setGroupState(cachedGroup ? { userId, status: "ready", state: cachedGroup } : { userId, status: "loading" });
    void getUserGroupConfirmationState(userId)
      .then((state) => {
        if (active) setGroupState({ userId, status: "ready", state });
      })
      .catch(() => {
        if (active) setGroupState({ userId, status: "error" });
      });
    return () => { active = false; };
  }, [visibleUser?.id]);

  useEffect(() => {
    const userId = visibleUser?.id;
    if (!userId) return;
    const refreshGroupOnResume = () => {
      if (document.visibilityState !== "visible" || !needsUserGroupConfirmationRefresh(userId)) return;
      const previous = getCachedUserGroupConfirmationState(userId);
      void refreshUserGroupConfirmationState(userId)
        .then((state) => setGroupState({ userId, status: "ready", state }))
        .catch(() => {
          if (!previous) setGroupState({ userId, status: "error" });
        });
    };
    window.addEventListener("focus", refreshGroupOnResume);
    document.addEventListener("visibilitychange", refreshGroupOnResume);
    return () => {
      window.removeEventListener("focus", refreshGroupOnResume);
      document.removeEventListener("visibilitychange", refreshGroupOnResume);
    };
  }, [visibleUser?.id]);

  useEffect(() => {
    const userId = visibleUser?.id;
    if (!userId) return;
    return subscribePermissionChange((changedUserId) => {
      if (changedUserId !== null && changedUserId !== userId) return;
      const cachedGroup = getCachedUserGroupConfirmationState(userId);
      if (cachedGroup) setGroupState({ userId, status: "ready", state: cachedGroup });
      void refreshUserGroupConfirmationState(userId)
        .then((state) => setGroupState({ userId, status: "ready", state }))
        .catch(() => {
          if (!cachedGroup) setGroupState({ userId, status: "error" });
        });
    });
  }, [visibleUser?.id]);

  // Warm the authenticated dashboard route before the user opens the menu.
  // Keep the idle window short so an early click does not wait for the prefetch.
  useEffect(() => {
    if (!visibleUser) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(() => setDashboardPrefetchUserId(visibleUser.id), { timeout: 250 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = setTimeout(() => setDashboardPrefetchUserId(visibleUser.id), 250);
    return () => clearTimeout(timeoutId);
  }, [visibleUser?.id]);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 24);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
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
        profileButtonRef.current?.focus();
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      const items = Array.from(userMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
      if (!items.length) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      let nextIndex = currentIndex;
      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = items.length - 1;
      else if (currentIndex < 0) nextIndex = event.key === "ArrowDown" ? 0 : items.length - 1;
      else nextIndex = (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      event.preventDefault();
      items[nextIndex].focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    try {
      setLoggingOut(true);
      await logout();
      setUserMenuOpen(false);
      revalidator.revalidate();
      navigate("/", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  function retryIdentityCheck() {
    const requestGeneration = ++identityRequestGenerationRef.current;
    setObservedUser(undefined);
    setGroupState(null);
    setIdentityRefreshError(false);
    void getOptionalCurrentUser({ force: true })
      .then((user) => {
        if (requestGeneration === identityRequestGenerationRef.current) setObservedUser(user);
      })
      .catch(() => {
        if (requestGeneration === identityRequestGenerationRef.current) setIdentityRefreshError(true);
      });
  }

  function getAccountSwitchHref() {
    const redirectTarget = `${location.pathname}${location.search}${location.hash}`;
    const query = new URLSearchParams({ redirect: redirectTarget, addAccount: "1" });
    return `/login?${query.toString()}`;
  }

  return (
    <nav
      aria-label="主导航"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      {visibleUser && dashboardPrefetchUserId === visibleUser.id ? (
        <PrefetchPageLinks page={getDefaultDashboardPath(visibleUser.role.name)} />
      ) : null}
      <PrefetchPageLinks page="/login" />
      <div className={`site-navbar pointer-events-auto w-full overflow-visible ${isScrolled ? "site-navbar--scrolled" : ""}`}>
        <div className="max-w-[1440px] mx-auto flex h-[var(--site-nav-height)] items-center justify-between px-6 sm:px-10 lg:px-20">
          {/* Logo */}
          <Link
            to="/"
            aria-label="TARSGO 首页"
            className="motion-button flex shrink-0 items-center"
          >
            <SiteLogo className="h-[48px] sm:h-[54px]" />
          </Link>

          <div className="navbar-actions">
            <ThemeControl />

            {/* Auth area */}
            <div className="navbar-auth-area">
              {visibleUser === undefined ? (
                visibleAuthError ? <button type="button" onClick={retryIdentityCheck} className="navbar-auth-loading navbar-auth-loading--error">重新确认登录状态</button> :
                  <NavbarAuthLoadingStatus />
              ) : visibleUser ? (
                <div ref={userMenuRef} className="relative">
                  <button
                    ref={profileButtonRef}
                    type="button"
                    onClick={() => setUserMenuOpen((open) => !open)}
                    onKeyDown={(event) => {
                      if (userMenuOpen || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
                      event.preventDefault();
                      setUserMenuOpen(true);
                      requestAnimationFrame(() => {
                        const items = userMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])');
                        items?.[event.key === "ArrowDown" ? 0 : items.length - 1]?.focus();
                      });
                    }}
                    className={`navbar-profile-button group flex items-center gap-2 rounded-full border p-1 pr-2.5 transition-all duration-200 ${
                      userMenuOpen
                        ? "border-accent-primary/60 bg-surface-light shadow-lg shadow-accent-primary/10"
                        : "border-border-subtle bg-surface-light/60 hover:border-accent-primary/40 hover:bg-surface-light hover:shadow-md hover:shadow-black/20"
                    }`}
                    aria-label={`打开${getUserDisplayName(visibleUser)}的用户菜单${groupIdentity ? `，${groupIdentity.name}` : `，${getAuthUserRoleLabel(visibleUser)}`}`}
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                  >
                    <UserAvatar user={visibleUser} className="h-8 w-8" textClassName="text-sm" />
                    <span className="navbar-profile-identity">
                      <span className="navbar-profile-identity__name">{getUserDisplayName(visibleUser)}</span>
                      <NavbarIdentityDetail user={visibleUser} identity={groupIdentity} loading={groupIdentityLoading} compact />
                    </span>
                    <svg
                      className={`h-4 w-4 transition-all duration-200 ${
                        userMenuOpen
                          ? "rotate-180 text-accent-primary"
                          : "text-fg-muted group-hover:text-fg-primary"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.75}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {userMenuOpen ? (
                    <div
                      role="menu"
                      className="navbar-user-menu animate-user-menu-in absolute right-0 z-20 mt-2.5 overflow-hidden rounded-xl border border-border-subtle bg-surface-primary/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
                    >
                      <div className="navbar-account-header">
                        <UserAvatar user={visibleUser} className="h-10 w-10 shrink-0" textClassName="text-sm" />
                        <div className="navbar-account-header__identity">
                          <div className="navbar-account-header__name">{getUserDisplayName(visibleUser)}</div>
                          <div className="navbar-account-header__email">{visibleUser.email}</div>
                          <div className="navbar-account-header__detail">
                            <span className="navbar-user-role">{teamIdentityLabel(visibleUser.teamIdentityStatus)}</span>
                            <NavbarIdentityDetail user={visibleUser} identity={groupIdentity} loading={groupIdentityLoading} />
                          </div>
                        </div>
                      </div>

                      <div className="navbar-account-actions">
                        {accountMenuItems.map((item) => (
                          <Link key={item.key} to={item.href} role="menuitem" onClick={() => setUserMenuOpen(false)}
                            aria-current={accountSection === (item.key === "my-profile" ? "profile" : item.key) ? "page" : undefined}
                            className="navbar-account-action">
                            <NavbarAccountIcon name={item.key} />
                            {item.key === "management" ? "管理后台" : item.label}
                          </Link>
                        ))}
                        <div className="navbar-account-separator" role="separator" />
                        <Link
                          to={getAccountSwitchHref()}
                          prefetch="render"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="navbar-account-action"
                        >
                          <NavbarAccountIcon name="switch" />
                          切换账号
                        </Link>
                        <button
                          type="button"
                          onClick={handleLogout}
                          disabled={loggingOut}
                          role="menuitem"
                          className="navbar-account-action navbar-account-action--danger"
                        >
                          <NavbarAccountIcon name="logout" />
                          {loggingOut ? "退出中..." : "退出登录"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex min-h-11 items-center rounded-full border border-accent-primary px-5 text-sm font-medium text-accent-primary hover:bg-accent-primary/10"
                >
                  登录
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavbarAccountIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    "my-profile": "M20 21v-2a7 7 0 0 0-14 0v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    workbench: "M9 6V4h6v2 M3 7h18v14H3Z M3 12a22 22 0 0 0 18 0 M12 11v4",
    management: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z m-4 9 3 3 5-5",
    switch: "M4 7h16m-4-4 4 4-4 4 M20 17H4m4-4-4 4 4 4",
    logout: "M9 3H4v18h5 M14 7l5 5-5 5 M8 12h11",
  };
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}

function UserAvatar({
  user,
  className,
  textClassName,
}: {
  user: AuthUser;
  className: string;
  textClassName: string;
}) {
  const avatarUrl = user.avatarUrl?.trim();
  return (
    <div className={`${className} relative flex items-center justify-center overflow-hidden rounded-full bg-accent-primary/15 text-accent-primary`}>
      <span className={`font-semibold ${textClassName}`}>{getUserInitial(user)}</span>
      {avatarUrl ? (
        <img
          key={avatarUrl}
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.hidden = true; }}
          className="absolute inset-0 h-full w-full rounded-full border border-[var(--theme-border)] bg-surface-card object-cover"
        />
      ) : null}
    </div>
  );
}

function NavbarAuthLoadingStatus() {
  return (
    <div
      className="navbar-auth-loading"
      role="status"
      aria-label="正在确认登录状态"
      aria-busy="true"
    >
      <span className="navbar-auth-loading__avatar" aria-hidden="true" />
      <span>正在确认登录状态</span>
    </div>
  );
}

function NavbarIdentityDetail({
  user,
  identity,
  loading,
  compact = false,
}: {
  user: AuthUser;
  identity: GroupIdentity | null;
  loading: boolean;
  compact?: boolean;
}) {
  return (
    <span className={`navbar-identity-detail${compact ? " navbar-identity-detail--compact" : ""}`}>
      {identity ? <GroupIdentityBadge identity={identity} compact={compact} /> : loading ? (
        <span className="navbar-user-role">{getAuthUserRoleLabel(user)}</span>
      ) : <span className="navbar-user-role">{getAuthUserRoleLabel(user)}</span>}
    </span>
  );
}

function getUserDisplayName(user: AuthUser) {
  return getAuthUserName(user);
}

function getUserInitial(user: AuthUser) {
  const source = getUserDisplayName(user).trim() || "U";
  return source.charAt(0).toUpperCase();
}

function GroupIdentityBadge({ identity, compact = false }: { identity: GroupIdentity; compact?: boolean }) {
  return (
    <span className={`navbar-group-badge${compact ? " navbar-group-badge--compact" : ""}`} title={identity.name}>
      <img src={`/assets/images/Groups/${identity.mark}-black.svg`} alt="" aria-hidden="true" />
      <span>{identity.name}</span>
    </span>
  );
}
