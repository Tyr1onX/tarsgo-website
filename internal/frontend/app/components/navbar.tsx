import { Link, PrefetchPageLinks, useLocation, useNavigate, useRevalidator } from "react-router";
import { useEffect, useRef, useState } from "react";

import {
  getAuthUserRoleLabel,
  getCachedCurrentUser,
  getOptionalCurrentUser,
  hasKnownAnonymousSession,
  logout,
  subscribeAccountSessionChange,
  subscribeAuthStateChange,
  type AuthUser,
} from "~/lib/auth-client";
import { getDefaultDashboardPath } from "~/lib/dashboard-navigation";
import { resolveGroupIdentity, type GroupIdentity } from "~/lib/group-identity";
import { getUserGroupConfirmationState, type UserGroupConfirmationState } from "~/lib/user-group-client";
import { SiteLogo } from "./site-logo";
import { ThemeControl } from "./theme-control";
import { useTheme } from "./theme-provider";

const navLinks = [
  { label: "首页", href: "/", active: true },
  { label: "认识吉甲", href: "/about", active: false },
  { label: "机器人", href: "/robots", active: false },
  { label: "赛事与荣誉", href: "/events-and-honors", active: false },
  { label: "加入我们", href: "/join", active: false },
  { label: "吉甲基地", href: "/base", active: false },
];

function isNavigationLinkActive(href: string, pathname: string) {
  if (href === "/base") {
    return pathname === "/base" || pathname === "/daily-signal" || pathname.startsWith("/base/");
  }
  return pathname === href;
}

const microSpecialtyNavLinks = [
  { label: "项目介绍", href: "#introduction", active: false },
  { label: "课程安排", href: "#curriculum", active: false },
  { label: "实践内容", href: "#practice", active: false },
  { label: "常见问题", href: "#faq", active: false },
];

type NavbarProps = {
  currentUser?: AuthUser | null;
  authError?: boolean;
  variant?: "default" | "micro-specialty";
};

export function Navbar({ currentUser, authError = false, variant = "default" }: NavbarProps) {
  const visibleNavLinks = variant === "micro-specialty" ? microSpecialtyNavLinks : navLinks;
  const [observedUser, setObservedUser] = useState<AuthUser | null | undefined>(() =>
    currentUser !== undefined ? currentUser : getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : undefined),
  );
  const visibleUser = currentUser === undefined ? observedUser : currentUser;
  const [identityRefreshError, setIdentityRefreshError] = useState(false);
  const [groupState, setGroupState] = useState<{ userId: number; state: UserGroupConfirmationState } | null>(null);
  const groupIdentity = groupState && visibleUser && groupState.userId === visibleUser.id
    ? resolveGroupIdentity(groupState.state)
    : null;
  const visibleAuthError = !visibleUser && (authError || identityRefreshError);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [dashboardPrefetchUserId, setDashboardPrefetchUserId] = useState<number | null>(null);
  const { preference, setPreference } = useTheme();
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const desktopNavLinksRef = useRef<HTMLDivElement | null>(null);
  const desktopAuthAreaRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  useEffect(() => {
    let disposed = false;
    let identityRequestGeneration = 0;
    const unsubscribeAuth = subscribeAuthStateChange((user) => {
      identityRequestGeneration += 1;
      if (!disposed) {
        setObservedUser(user);
        setIdentityRefreshError(false);
      }
    });
    const unsubscribeAccount = subscribeAccountSessionChange(() => {
      const requestGeneration = ++identityRequestGeneration;
      setObservedUser(undefined);
      setIdentityRefreshError(false);
      void getOptionalCurrentUser({ force: true })
        .then((user) => {
          if (!disposed && requestGeneration === identityRequestGeneration) setObservedUser(user);
        })
        .catch(() => {
          if (!disposed && requestGeneration === identityRequestGeneration) setIdentityRefreshError(true);
        });
    });

    if (currentUser === undefined) {
      const initialGeneration = identityRequestGeneration;
      void getOptionalCurrentUser()
        .then((user) => {
          if (!disposed && initialGeneration === identityRequestGeneration) setObservedUser(user);
        })
        .catch(() => {
          if (!disposed && initialGeneration === identityRequestGeneration) setIdentityRefreshError(true);
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
    if (!userId) {
      setGroupState(null);
      return;
    }

    let active = true;
    setGroupState(null);
    void getUserGroupConfirmationState()
      .then((state) => {
        if (active) setGroupState({ userId, state });
      })
      .catch(() => {
        if (active) setGroupState(null);
      });
    return () => { active = false; };
  }, [visibleUser?.id]);

  useEffect(() => {
    if (!menuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      setMenuOpen(false);
      mobileMenuButtonRef.current?.focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    const desktopViewport = window.matchMedia("(min-width: 1280px)");

    function handleNavBreakpointChange() {
      const activeElement = document.activeElement;

      if (desktopViewport.matches) {
        const focusedMobileControl =
          activeElement === mobileMenuButtonRef.current ||
          Boolean(mobileMenuRef.current?.contains(activeElement));

        if (menuOpen) setMenuOpen(false);
        if (focusedMobileControl) {
          desktopNavLinksRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
        }
        return;
      }

      const focusedDesktopControl =
        Boolean(desktopNavLinksRef.current?.contains(activeElement)) ||
        Boolean(desktopAuthAreaRef.current?.contains(activeElement));

      setUserMenuOpen(false);
      if (focusedDesktopControl) {
        mobileMenuButtonRef.current?.focus();
      }
    }

    desktopViewport.addEventListener("change", handleNavBreakpointChange);
    return () => desktopViewport.removeEventListener("change", handleNavBreakpointChange);
  }, [menuOpen]);

  function closeMobileMenu() {
    setMenuOpen(false);
    mobileMenuButtonRef.current?.focus();
  }

  // Warm the authenticated dashboard route before the user opens the menu.
  // Defer this work until idle so public homepage resources keep priority.
  useEffect(() => {
    if (!visibleUser || variant !== "default") return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(() => setDashboardPrefetchUserId(visibleUser.id), { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = setTimeout(() => setDashboardPrefetchUserId(visibleUser.id), 700);
    return () => clearTimeout(timeoutId);
  }, [visibleUser?.id, variant]);

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
      setMenuOpen(false);
      if (menuOpen) mobileMenuButtonRef.current?.focus();
      revalidator.revalidate();
      navigate("/", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  function getAccountSwitchHref() {
    const redirectTarget = `${location.pathname}${location.search}${location.hash}`;
    const query = new URLSearchParams({ redirect: redirectTarget, addAccount: "1" });
    return `/login?${query.toString()}`;
  }

  return (
    <nav
      aria-label={variant === "micro-specialty" ? "低空微专业导航" : "主导航"}
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      {variant === "default" && visibleUser && dashboardPrefetchUserId === visibleUser.id ? (
        <PrefetchPageLinks page={getDefaultDashboardPath(visibleUser.role.name)} />
      ) : null}
      {variant === "default" ? <PrefetchPageLinks page="/login" /> : null}
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

          {/* Desktop nav links */}
          <div ref={desktopNavLinksRef} className="hidden xl:flex items-center gap-5 2xl:gap-8">
            {visibleNavLinks.map((link) => {
              const active = link.href.startsWith("#")
                ? location.hash === link.href
                : isNavigationLinkActive(link.href, location.pathname);
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`motion-nav-link text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D0AD69] ${
                    active ? "text-accent-primary" : "text-fg-primary hover:text-accent-primary"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="navbar-actions">
          <ThemeControl className="theme-control--navbar" systemOnly />

          {/* Auth area */}
          {variant === "default" ? <div ref={desktopAuthAreaRef} className="hidden w-[220px] shrink-0 items-center justify-end gap-3 xl:flex">
            {visibleUser === undefined ? (
              visibleAuthError ? <Link to="/login" className="text-sm text-fg-muted hover:text-accent-primary">验证失败，重试</Link> :
                <span className="h-10 w-28 animate-pulse rounded-full border border-white/10 bg-white/[0.06]" role="status" aria-label="正在确认登录状态" />
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
                    {groupIdentity ? <GroupIdentityBadge identity={groupIdentity} compact /> : <span className="navbar-profile-identity__role">{getAuthUserRoleLabel(visibleUser)}</span>}
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
                    className="animate-user-menu-in absolute right-0 z-20 mt-3 w-64 overflow-hidden rounded-2xl border border-border-subtle bg-surface-primary/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
                  >
                    <div className="flex items-center gap-3 border-b border-border-subtle/80 bg-gradient-to-b from-accent-primary/5 to-transparent px-4 py-2.5">
                      <UserAvatar user={visibleUser} className="h-9 w-9" textClassName="text-sm" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-fg-primary">{getUserDisplayName(visibleUser)}</div>
                        <div className="truncate text-xs text-fg-muted">{visibleUser.email}</div>
                        <div className="mt-1">{groupIdentity ? <GroupIdentityBadge identity={groupIdentity} /> : <span className="navbar-user-role">{getAuthUserRoleLabel(visibleUser)}</span>}</div>
                      </div>
                    </div>

                    <div className="p-1.5">
                      <Link
                        to={getDefaultDashboardPath(visibleUser.role.name)}
                        prefetch="render"
                        onClick={() => setUserMenuOpen(false)}
                        role="menuitem"
                        className="group/item flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-white/5 hover:text-fg-primary"
                      >
                        <svg
                          className="h-4 w-4 text-fg-dim transition-colors group-hover/item:text-accent-primary"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.75}
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                        </svg>
                        {visibleUser.role.name === "admin" || visibleUser.role.name === "super_admin" ? "管理工作台" : "个人工作台"}
                      </Link>

                      <div className="my-0.5 h-px bg-border-subtle/70" />

                      <Link
                        to={getAccountSwitchHref()}
                        prefetch="render"
                        onClick={() => setUserMenuOpen(false)}
                        role="menuitem"
                        className="group/item flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-white/5 hover:text-fg-primary"
                      >
                        切换或添加账号
                      </Link>

                      <button
                        type="button"
                        onClick={handleLogout}
                        disabled={loggingOut}
                        role="menuitem"
                        className="group/item flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <svg
                          className="h-4 w-4 text-rose-400/70 transition-colors group-hover/item:text-rose-300"
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
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-5 py-2 text-sm font-medium text-accent-primary border-[1.5px] border-accent-primary rounded-full transition-colors hover:bg-accent-primary/10"
                >
                  登录
                </Link>
                <Link
                  to="/register"
                  className="px-5 py-2 text-sm font-medium text-fg-inverse bg-accent-primary rounded-full transition-colors hover:bg-accent-primary/90"
                >
                  注册
                </Link>
              </>
            )}
          </div> : null}

          <button
            ref={mobileMenuButtonRef}
            type="button"
            className={"navbar-menu-toggle xl:hidden" + (visibleUser ? " navbar-menu-toggle--identity" : "")}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={visibleUser
              ? (menuOpen ? "关闭导航菜单" : "展开导航菜单") + "，" + getUserDisplayName(visibleUser) + "，" + (groupIdentity?.name ?? getAuthUserRoleLabel(visibleUser))
              : menuOpen ? "关闭导航菜单" : "展开导航菜单"}
            aria-expanded={menuOpen}
            aria-controls="site-mobile-menu"
          >
            {visibleUser ? <UserAvatar user={visibleUser} className="h-7 w-7" textClassName="text-xs" /> : null}
            {groupIdentity ? <img className="navbar-menu-group-mark" src={`/assets/images/Groups/${groupIdentity.mark}-black.svg`} alt="" aria-hidden="true" /> : null}
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              {menuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              )}
            </svg>
          </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          id="site-mobile-menu"
          ref={mobileMenuRef}
          hidden={!menuOpen}
          className="site-mobile-menu xl:hidden"
        >
          <div className="navbar-mobile-links">
            {visibleNavLinks.map((link) => {
              const active = link.href.startsWith("#")
                ? location.hash === link.href
                : isNavigationLinkActive(link.href, location.pathname);
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`navbar-mobile-link ${active ? "navbar-mobile-link--active" : ""}`}
                  onClick={closeMobileMenu}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          {variant === "default" && visibleUser === undefined ? (
            visibleAuthError ? <Link to="/login" className="mt-4 text-sm text-fg-muted" onClick={closeMobileMenu}>验证失败，重试</Link> :
              <div className="mt-4 h-10 w-32 animate-pulse rounded-full bg-white/[0.06]" role="status" aria-label="正在确认登录状态" />
          ) : variant === "default" && visibleUser ? (
            <div className="navbar-mobile-account">
              <UserAvatar user={visibleUser} className="h-8 w-8" textClassName="text-xs" />
              <span className="navbar-mobile-account__identity">
                <span className="navbar-mobile-account__name">{getUserDisplayName(visibleUser)}</span>
                {groupIdentity ? <GroupIdentityBadge identity={groupIdentity} /> : <span className="navbar-user-role">{getAuthUserRoleLabel(visibleUser)}</span>}
              </span>
              <div className="navbar-mobile-account__actions">
                <Link
                  to={getDefaultDashboardPath(visibleUser.role.name)}
                  prefetch="render"
                  className="navbar-mobile-account__action navbar-mobile-account__action--primary"
                  onClick={closeMobileMenu}
                >
                  工作台
                </Link>
                <Link
                  to={getAccountSwitchHref()}
                  prefetch="render"
                  className="navbar-mobile-account__action navbar-mobile-account__action--quiet"
                  onClick={closeMobileMenu}
                >
                  切换
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="navbar-mobile-account__action navbar-mobile-account__action--quiet"
                >
                  {loggingOut ? "退出中..." : "登出"}
                </button>
              </div>
            </div>
          ) : variant === "default" ? (
            <div className="flex gap-3 mt-4 px-3">
              <Link
                to="/login"
                className="flex-1 text-center px-4 py-2 text-sm font-medium text-accent-primary border-[1.5px] border-accent-primary rounded-full"
                onClick={closeMobileMenu}
              >
                登录
              </Link>
              <Link
                to="/register"
                className="flex-1 text-center px-4 py-2 text-sm font-medium text-fg-inverse bg-accent-primary rounded-full"
                onClick={closeMobileMenu}
              >
                注册
              </Link>
            </div>
          ) : null}
          <button
            type="button"
            className="navbar-system-theme"
            aria-pressed={preference === "system"}
            onClick={() => {
              setPreference("system");
              closeMobileMenu();
            }}
          >
            <span>跟随系统主题</span>
            <span className="navbar-system-theme__state">{preference === "system" ? "已启用" : "恢复自动"}</span>
          </button>
        </div>
      </div>
    </nav>
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
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className={`${className} rounded-full border border-white/10 object-cover`}
      />
    );
  }

  return (
    <div className={`${className} flex items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary`}>
      <span className={`font-semibold ${textClassName}`}>{getUserInitial(user)}</span>
    </div>
  );
}

function getUserDisplayName(user: AuthUser) {
  return user.nickname?.trim() || user.email.split("@")[0] || "TARSGO 成员";
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
