import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router";

import type { Route } from "./+types/base";
import { Navbar } from "~/components/navbar";
import { getCachedCurrentUser, getOptionalCurrentUser, hasKnownAnonymousSession, subscribeAccountSessionChange, subscribeAuthStateChange, type AuthUser } from "~/lib/auth-client";
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
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(getNavbarUser);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let identityGeneration = 0;
    const unsubscribeAuth = subscribeAuthStateChange((user) => {
      identityGeneration += 1;
      if (!disposed) {
        setCurrentUser(user);
        setAuthError(false);
      }
    });
    const unsubscribeAccount = subscribeAccountSessionChange(() => {
      const requestGeneration = ++identityGeneration;
      setCurrentUser(undefined);
      setAuthError(false);
      void getOptionalCurrentUser({ force: true })
        .then((user) => {
          if (!disposed && requestGeneration === identityGeneration) setCurrentUser(user);
        })
        .catch(() => {
          if (!disposed && requestGeneration === identityGeneration) setAuthError(true);
        });
    });

    const initialGeneration = identityGeneration;
    void getOptionalCurrentUser()
      .then((user) => {
        if (!disposed && initialGeneration === identityGeneration) {
          setCurrentUser(user);
          setAuthError(false);
        }
      })
      .catch(() => {
        if (!disposed && initialGeneration === identityGeneration) setAuthError(true);
      });

    return () => {
      disposed = true;
      unsubscribeAuth();
      unsubscribeAccount();
    };
  }, []);

  if (currentUser) {
    return <Navigate to={`/dashboard/base${location.search}${location.hash}`} replace />;
  }

  return (
    <div className="public-home gijia-base min-h-screen bg-surface-primary text-fg-primary">
      <Navbar currentUser={currentUser} authError={authError} />

      {currentUser === null ? (
        <>
          <main className="gijia-base__guest">
            <section className="gijia-base__guest-welcome" aria-labelledby="gijia-base-guest-title">
              <div className="gijia-base__guest-copy">
                <p className="gijia-base__guest-eyebrow">参与吉甲 · 每日通信</p>
                <h1 id="gijia-base-guest-title">日常，也值得被认真记下。</h1>
                <p>每天为基地发送一条信号。状态可以轻轻记下，也可以留白。</p>
                <div className="gijia-base__guest-actions">
                  <Link to="/login?redirect=%2Fbase">登录后发送信号 <span aria-hidden="true">→</span></Link>
                  <Link to="/about">了解吉甲</Link>
                </div>
              </div>
              <div className="gijia-base__guest-radar" aria-hidden="true"><i /><i /><i /><b /></div>
            </section>
          </main>
          <PublicFooter />
        </>
      ) : (
        <>
          <main className="gijia-base__auth-pending" role="status" aria-live="polite">
            <span className="gijia-base__auth-pending-mark" aria-hidden="true"><i /><i /><b /></span>
            <h1>{authError ? "暂时无法确认登录状态" : "正在连接吉甲基地"}</h1>
            <p>{authError ? "请登录后重新进入基地。" : "准备好后，基地会为你打开个人通信空间。"}</p>
            {authError ? <Link to="/login?redirect=%2Fbase">前往登录</Link> : null}
          </main>
          <PublicFooter />
        </>
      )}
    </div>
  );
}
