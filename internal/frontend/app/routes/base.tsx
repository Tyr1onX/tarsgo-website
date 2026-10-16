import { useEffect, useState } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/base";
import { Navbar } from "~/components/navbar";
import { getCachedCurrentUser, getOptionalCurrentUser, hasKnownAnonymousSession, subscribeAuthStateChange, type AuthUser } from "~/lib/auth-client";
import { PublicFooter } from "./home";
import "./base.css";

function getNavbarUser(): AuthUser | null | undefined {
  return getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : undefined);
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "吉甲基地 | TARSGO" },
    { name: "description", content: "从每日通信开始，参与吉甲基地的日常。" },
  ];
}

export default function BasePage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(getNavbarUser);
  const [authError, setAuthError] = useState(false);

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

  return (
    <div className="public-home gijia-base min-h-screen bg-surface-primary text-fg-primary">
      <Navbar currentUser={currentUser} authError={authError} />
      <main className="gijia-base__main">
        <Link to="/" className="gijia-base__back">TARSGO <span aria-hidden="true">/</span> 首页</Link>

        <header className="gijia-base__hero">
          <div>
            <h1>吉甲基地</h1>
            <p className="gijia-base__intro">在工程现场之外，也为普通的日子留一个位置。</p>
          </div>
        </header>

        <section className="gijia-base__feature-section" aria-labelledby="gijia-base-feature-title">
          <div className="gijia-base__section-heading">
            <span>当前开放</span>
          </div>

          <Link to="/daily-signal" className="gijia-base__feature">
            <div className="gijia-base__feature-copy">
              <h2 id="gijia-base-feature-title">每日通信</h2>
              <p>今天也向基地发送一个信号吧。</p>
              <span className="gijia-base__feature-action">进入每日通信 <BaseArrowIcon /></span>
            </div>
            <span className="gijia-base__orbit" aria-hidden="true"><i /><i /><i /><b /></span>
          </Link>

          {currentUser === null ? (
            <p className="gijia-base__access-note">可以自由浏览；登录后可保存自己的信号。</p>
          ) : currentUser ? (
            <p className="gijia-base__access-note">信号与状态只保存在当前账号下。</p>
          ) : authError ? (
            <p className="gijia-base__access-note" role="status">登录状态暂时无法确认，基地仍可浏览。</p>
          ) : null}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function BaseArrowIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg>;
}
