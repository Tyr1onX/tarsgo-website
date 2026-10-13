import { Link, PrefetchPageLinks, useNavigate, useRevalidator } from "react-router";
import { useEffect, useRef, useState } from "react";

import { logout, type AuthUser } from "~/lib/auth-client";
import { getDefaultDashboardPath } from "~/lib/dashboard-navigation";

const navLinks = [
  { label: "首页", href: "/#hero", active: true },
  { label: "关于我们", href: "/#about", active: false },
  { label: "团队历程", href: "/#achievements", active: false },
  { label: "机器人展示", href: "/#robots", active: false },
  { label: "低空微专业", href: "/micro-specialties/low-altitude-intelligent-sensing-control", active: false },
  { label: "成就展示", href: "/#certificates", active: false },
  { label: "加入我们", href: "/#join", active: false },
];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [dashboardPrefetchUserId, setDashboardPrefetchUserId] = useState<number | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  // Warm the authenticated dashboard route before the user opens the menu.
  // Defer this work until idle so public homepage resources keep priority.
  useEffect(() => {
    if (!currentUser || variant !== "default") return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(() => setDashboardPrefetchUserId(currentUser.id), { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = setTimeout(() => setDashboardPrefetchUserId(currentUser.id), 700);
    return () => clearTimeout(timeoutId);
  }, [currentUser?.id, variant]);

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
      }
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
      revalidator.revalidate();
      navigate("/", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <nav className="pointer-events-none fixed inset-x-0 top-0 z-50">
      {variant === "default" && currentUser && dashboardPrefetchUserId === currentUser.id ? (
        <PrefetchPageLinks page={getDefaultDashboardPath(currentUser.role.name)} />
      ) : null}
      {variant === "default" ? <PrefetchPageLinks page="/login" /> : null}
      <div
        className={`pointer-events-auto w-full overflow-visible border-b transition-all duration-300 ${
          isScrolled
            ? "border-white/10 bg-surface-primary/95 shadow-[0_20px_60px_-30px_rgba(2,6,23,0.9)]"
            : "border-white/12 bg-black/70 shadow-[0_24px_70px_-38px_rgba(2,6,23,0.85)]"
        }`}
      >
      <div className="max-w-[1440px] mx-auto flex h-[var(--site-nav-height)] items-center justify-between px-6 sm:px-10 lg:px-20">
        {/* Logo */}
        <Link
          to="/"
          aria-label="TARS-GO 首页"
          className="motion-button flex shrink-0 items-center"
        >
          <img
            src="/assets/images/Logo/tars-go.webp"
            alt="TARS-GO"
            className="h-[48px] w-auto object-contain sm:h-[54px]"
          />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8">
          {visibleNavLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`motion-nav-link text-base font-semibold transition-colors ${
                link.active
                  ? "text-accent-primary"
                  : "text-fg-primary hover:text-accent-primary"
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Auth area */}
        {variant === "default" ? <div className="hidden w-[174px] shrink-0 items-center justify-end gap-3 md:flex">
          {currentUser === undefined ? (
            authError ? <Link to="/login" className="text-sm text-fg-muted hover:text-accent-primary">验证失败，重试</Link> :
              <span className="h-10 w-28 animate-pulse rounded-full border border-white/10 bg-white/[0.06]" role="status" aria-label="正在确认登录状态" />
          ) : currentUser ? (
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((open) => !open)}
                className={`group flex items-center gap-2 rounded-full border p-1 pr-2.5 transition-all duration-200 ${
                  userMenuOpen
                    ? "border-accent-primary/60 bg-surface-light shadow-lg shadow-accent-primary/10"
                    : "border-border-subtle bg-surface-light/60 hover:border-accent-primary/40 hover:bg-surface-light hover:shadow-md hover:shadow-black/20"
                }`}
                aria-label="打开用户菜单"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
              >
                <UserAvatar user={currentUser} className="h-9 w-9" textClassName="text-sm" />
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
                    <UserAvatar user={currentUser} className="h-9 w-9" textClassName="text-sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-fg-primary">
                        {getUserDisplayName(currentUser)}
                      </div>
                      <div className="truncate text-xs text-fg-muted">{currentUser.email}</div>
                    </div>
                  </div>

                  <div className="p-1.5">
                    <Link
                      to={getDefaultDashboardPath(currentUser.role.name)}
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
                      进入工作台
                    </Link>

                    <div className="my-0.5 h-px bg-border-subtle/70" />

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

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden p-2 text-fg-muted hover:text-fg-primary"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
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

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden px-6 pb-4 border-t border-border-subtle pt-4">
          <div className="flex flex-col gap-1">
            {visibleNavLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  link.active
                    ? "text-accent-primary"
                    : "text-fg-primary hover:text-accent-primary hover:bg-white/5"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
          {variant === "default" && currentUser === undefined ? (
            authError ? <Link to="/login" className="mt-4 text-sm text-fg-muted" onClick={() => setMenuOpen(false)}>验证失败，重试</Link> :
              <div className="mt-4 h-10 w-32 animate-pulse rounded-full bg-white/[0.06]" role="status" aria-label="正在确认登录状态" />
          ) : variant === "default" && currentUser ? (
            <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-light/40 p-3">
              <div className="flex items-center gap-3">
                <UserAvatar user={currentUser} className="h-10 w-10" textClassName="text-sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-fg-primary">
                    {getUserDisplayName(currentUser)}
                  </div>
                  <div className="truncate text-xs text-fg-muted">{currentUser.email}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to={getDefaultDashboardPath(currentUser.role.name)}
                  prefetch="render"
                  className="rounded-full bg-accent-primary px-4 py-2 text-center text-sm font-medium text-fg-inverse"
                  onClick={() => setMenuOpen(false)}
                >
                  工作台
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="rounded-full border border-border-subtle px-4 py-2 text-sm font-medium text-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
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
                onClick={() => setMenuOpen(false)}
              >
                登录
              </Link>
              <Link
                to="/register"
                className="flex-1 text-center px-4 py-2 text-sm font-medium text-fg-inverse bg-accent-primary rounded-full"
                onClick={() => setMenuOpen(false)}
              >
                注册
              </Link>
            </div>
          ) : null}
        </div>
      )}
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
        alt={`${getUserDisplayName(user)}头像`}
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
  return user.nickname?.trim() || user.email;
}

function getUserInitial(user: AuthUser) {
  const source = getUserDisplayName(user).trim() || "U";
  return source.charAt(0).toUpperCase();
}
