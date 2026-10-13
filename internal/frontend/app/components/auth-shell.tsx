import type { ReactNode, MouseEventHandler } from "react";
import { Link } from "react-router";


type AuthShellProps = {
  mode: "login" | "register";
  title: string;
  description: string;
  redirectTo: string;
  children: ReactNode;
  leaving?: boolean;
  onHomeClick?: MouseEventHandler<HTMLAnchorElement>;
};

function authPath(path: "/login" | "/register", redirectTo: string) {
  return redirectTo === "/dashboard" ? path : `${path}?redirect=${encodeURIComponent(redirectTo)}`;
}

export function AuthShell({
  mode,
  title,
  description,
  redirectTo,
  children,
  leaving = false,
  onHomeClick,
}: AuthShellProps) {
  return (
    <main className={`auth-page${leaving ? " auth-page--leaving" : ""}`}>
      <div className="auth-layout">
        <aside className="auth-brand-panel" aria-label="吉甲大师品牌信息">
          <Link to="/" className="auth-brand-lockup" aria-label="返回 TARS-GO 首页">
            <img src="/assets/images/Logo/tarsgo-logo-v5.svg" alt="TARSGO" />
            <span>吉林大学 · 吉甲大师双创基地</span>
          </Link>

          <div className="auth-brand-story">
            <p className="auth-eyebrow">JLU · JIJIA MASTER</p>
            <h2>为赛场而来，<br />与团队并肩。</h2>
            <p>TARS-GO 战队统一工作台入口。</p>
          </div>

          <div className="auth-brand-footer">
            <span>ROBO MASTER TEAM</span>
            <span>吉林大学吉甲大师双创基地</span>
          </div>
        </aside>

        <section className="auth-main" aria-label={mode === "login" ? "登录" : "注册"}>
          <div className="auth-main-top">
            <Link
              to="/"
              onClick={onHomeClick}
              className="auth-home-link animate-auth-back-link"
            >
              <svg className="auth-back-link-arrow" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              返回官网
            </Link>

            <nav className="auth-entry-switch" aria-label="账户入口">
              <Link to={authPath("/login", redirectTo)} aria-current={mode === "login" ? "page" : undefined}>
                登录
              </Link>
              <Link to={authPath("/register", redirectTo)} aria-current={mode === "register" ? "page" : undefined}>
                注册
              </Link>
            </nav>
          </div>

          <div className="auth-form-wrap">
            <header className="auth-form-heading">
              <p className="auth-eyebrow">{mode === "login" ? "WELCOME BACK" : "JOIN THE TEAM"}</p>
              <h1>{title}</h1>
              <p>{description}</p>
            </header>
            {children}
          </div>

          <footer className="auth-main-footer">
            <span>© TARS-GO 战队</span>
            <span>吉林大学 · 吉甲大师双创基地</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
