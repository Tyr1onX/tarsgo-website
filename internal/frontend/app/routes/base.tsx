import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router";

import type { Route } from "./+types/base";
import { Navbar } from "~/components/navbar";
import { DailySignalWorkspace } from "~/components/daily-signal-workspace";
import { getCachedCurrentUser, getOptionalCurrentUser, hasKnownAnonymousSession, subscribeAuthStateChange, type AuthUser } from "~/lib/auth-client";
import { PublicFooter } from "./home";
import "./base.css";

function getNavbarUser(): AuthUser | null | undefined {
  return getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : undefined);
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "吉甲基地 · 每日通信 | TARSGO" },
    { name: "description", content: "从每日通信开始，参与吉甲基地的日常。" },
  ];
}

export default function BasePage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(getNavbarUser);
  const [authError, setAuthError] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = subscribeAuthStateChange(() => {
      if (!disposed) {
        setCurrentUser(getNavbarUser());
        setAuthError(false);
      }
    });

    void getOptionalCurrentUser()
      .then(() => {
        if (!disposed) {
          setCurrentUser(getNavbarUser());
          setAuthError(false);
        }
      })
      .catch(() => {
        if (!disposed) {
          setCurrentUser(getNavbarUser());
          setAuthError(true);
        }
      });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobileSidebarOpen(false);
      mobileMenuButtonRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 767px)");
    function updateViewportMode() {
      setIsMobileViewport(mobileViewport.matches);
      if (!mobileViewport.matches) setMobileSidebarOpen(false);
    }
    updateViewportMode();
    mobileViewport.addEventListener("change", updateViewportMode);
    return () => mobileViewport.removeEventListener("change", updateViewportMode);
  }, []);

  function closeMobileSidebar() {
    setMobileSidebarOpen(false);
    if (isMobileViewport) mobileMenuButtonRef.current?.focus();
  }

  function openMobileSidebar() {
    setMobileSidebarOpen(true);
    requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLAnchorElement>(".gijia-base__nav-link")?.focus());
  }

  return (
    <div className="public-home gijia-base min-h-screen bg-surface-primary text-fg-primary">
      <Navbar currentUser={currentUser} authError={authError} />

      <div className={`gijia-base__workspace${sidebarExpanded ? "" : " gijia-base__workspace--collapsed"}`}>
        <aside
          ref={sidebarRef}
          className={`gijia-base__sidebar${mobileSidebarOpen ? " gijia-base__sidebar--mobile-open" : ""}`}
          id="gijia-base-sidebar"
          aria-label="吉甲基地侧边栏"
          aria-hidden={isMobileViewport && !mobileSidebarOpen}
          inert={isMobileViewport && !mobileSidebarOpen}
          data-collapsed={!sidebarExpanded}
        >
          <div className="gijia-base__sidebar-head">
            <Link to="/" className="gijia-base__brand" aria-label="返回 TARSGO 首页">
              <span className="gijia-base__brand-mark" aria-hidden="true"><i /><i /><i /></span>
              <span className="gijia-base__brand-copy"><strong>吉甲基地</strong><small>参与吉甲</small></span>
            </Link>
            <button
              type="button"
              className="gijia-base__collapse-button"
              aria-label={sidebarExpanded ? "收起基地侧栏" : "展开基地侧栏"}
              aria-expanded={sidebarExpanded}
              title={sidebarExpanded ? "收起侧栏" : "展开侧栏"}
              onClick={() => setSidebarExpanded((expanded) => !expanded)}
            >
              <CollapseIcon collapsed={!sidebarExpanded} />
            </button>
            <button
              type="button"
              className="gijia-base__mobile-close"
              aria-label="关闭基地导航"
              onClick={closeMobileSidebar}
            >
              <CloseIcon />
            </button>
          </div>

          <div className="gijia-base__sidebar-divider" aria-hidden="true" />

          <nav className="gijia-base__nav" aria-label="基地功能">
            <NavLink
              to="/base"
              end
              aria-label="每日通信"
              className={({ isActive }) => `gijia-base__nav-link${isActive ? " gijia-base__nav-link--active" : ""}`}
              onClick={closeMobileSidebar}
            >
              <DailySignalIcon />
              <span className="gijia-base__nav-label">每日通信</span>
            </NavLink>
          </nav>

          <div className="gijia-base__sidebar-foot" aria-hidden="true">
            <span className="gijia-base__status-dot" />
            <span className="gijia-base__sidebar-foot-label">信号终端在线</span>
          </div>
        </aside>

        {mobileSidebarOpen ? (
          <button
            type="button"
            className="gijia-base__backdrop"
            aria-label="关闭基地导航"
            onClick={closeMobileSidebar}
          />
        ) : null}

        <div className="gijia-base__content">
          <div className="gijia-base__mobile-bar">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              className="gijia-base__mobile-menu"
              aria-controls="gijia-base-sidebar"
              aria-expanded={mobileSidebarOpen}
              onClick={openMobileSidebar}
            >
              <MenuIcon />
              <span>基地导航</span>
            </button>
            <span className="gijia-base__mobile-location">吉甲基地</span>
          </div>
          <DailySignalWorkspace />
          <PublicFooter />
        </div>
      </div>
    </div>
  );
}

function DailySignalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 4 6 6-6 6M4 4v12" /></svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m12 4-6 6 6 6m4-12v12" /></svg>
  );
}

function MenuIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>;
}
