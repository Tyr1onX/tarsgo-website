import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";

import {
  getCachedCurrentUser,
  getOptionalCurrentUser,
  hasKnownAnonymousSession,
  subscribeAccountSessionChange,
  subscribeAuthStateChange,
  type AuthUser,
} from "~/lib/auth-client";

function getInitialUser() {
  return getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : undefined);
}

export default function LegacyBaseRedirect() {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(getInitialUser);
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

  const dashboardPath = `/dashboard${location.search}${location.hash}`;
  const loginPath = `/login?redirect=${encodeURIComponent(dashboardPath)}`;

  if (currentUser) {
    return <Navigate to={dashboardPath} replace />;
  }

  if (currentUser === null || authError) {
    return <Navigate to={loginPath} replace />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-surface-primary px-5 text-fg-muted" role="status" aria-live="polite">
      正在确认登录状态…
    </main>
  );
}
