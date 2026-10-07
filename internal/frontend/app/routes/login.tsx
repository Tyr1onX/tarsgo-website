import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { AuthShell } from "~/components/auth-shell";
import {
  ApiError,
  getBootstrapStatus,
  getOptionalCurrentUser,
  loginWithCode,
  loginWithPassword,
  sendLoginCode,
} from "~/lib/auth-client";
import { getDefaultDashboardPath } from "~/lib/dashboard-navigation";
import { useCooldown } from "~/lib/use-cooldown";

type LoginMode = "password" | "code";

export function meta() {
  return [
    { title: "登录 | TARS-GO" },
    { name: "description", content: "登录TARS-GO吉甲大师战队平台" },
  ];
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const cooldown = useCooldown();

  const redirectTo = useMemo(
    () => getSafeRedirectPath(searchParams.get("redirect")),
    [searchParams],
  );

  useEffect(() => {
    let disposed = false;

    void Promise.all([getBootstrapStatus(), getOptionalCurrentUser()])
      .then(([bootstrapStatus, currentUser]) => {
        if (disposed) {
          return;
        }
        if (bootstrapStatus.setupRequired) {
          navigate("/dashboard/setup/super-admin", { replace: true });
          return;
        }
        if (currentUser) {
          navigate(resolveAuthDestination(redirectTo, currentUser.role.name), { replace: true });
        }
      })
      .catch((error) => {
        if (!disposed) {
          setErrorMessage(getErrorMessage(error));
        }
      });

    return () => {
      disposed = true;
    };
  }, [navigate]);

  const canSendCode = isValidEmail(email) && !cooldown.isCoolingDown && !sendingCode;

  async function handleSendCode() {
    if (!isValidEmail(email)) {
      setErrorMessage("请输入有效邮箱后再发送验证码。");
      return;
    }

    try {
      setSendingCode(true);
      setErrorMessage("");
      await sendLoginCode(email);
      cooldown.start(60);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidEmail(email)) {
      setErrorMessage("请输入有效邮箱地址。");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");

      if (mode === "password") {
        const user = await loginWithPassword({ email, password });
        prefetchDashboardForRole(user.role.name);
        navigate(resolveAuthDestination(redirectTo, user.role.name), { replace: true });
      } else {
        const user = await loginWithCode({ email, code });
        prefetchDashboardForRole(user.role.name);
        navigate(resolveAuthDestination(redirectTo, user.role.name), { replace: true });
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      mode="login"
      title="欢迎回来"
      description="登录你的 TARS-GO 统一工作台账号"
      redirectTo={redirectTo}
    >
      <div className="auth-mode-switch" aria-label="登录方式">
        <button type="button" aria-pressed={mode === "password"} onClick={() => setMode("password")}>
          密码登录
        </button>
        <button type="button" aria-pressed={mode === "code"} onClick={() => setMode("code")}>
          验证码登录
        </button>
      </div>

      <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
        <div className="auth-field">
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="your@example.com"
            className="auth-input"
          />
        </div>

        {mode === "password" ? (
          <div key="password-field" className="auth-field animate-auth-slide-in">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
              className="auth-input"
            />
          </div>
        ) : (
          <div key="code-field" className="auth-field animate-auth-slide-in">
            <label htmlFor="code">邮箱验证码</label>
            <div className="auth-code-control">
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="输入 6 位验证码"
                className="auth-input"
              />
              <button type="button" onClick={handleSendCode} disabled={!canSendCode} className="auth-code-send">
                {cooldown.isCoolingDown
                  ? `${cooldown.remainingSeconds}s 后重发`
                  : sendingCode
                    ? "发送中..."
                    : "发送验证码"}
              </button>
            </div>
          </div>
        )}

        {errorMessage ? <div className="auth-error animate-auth-fade-in" role="alert" aria-live="polite">{errorMessage}</div> : null}

        <button type="submit" disabled={submitting} className="auth-submit">
          {submitting ? "登录中..." : "登录"}
        </button>
      </form>

    </AuthShell>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value.trim());
}

function getSafeRedirectPath(value: string | null) {
  if (!value) {
    return "/dashboard";
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/dashboard";
  }

  return trimmed;
}

function resolveAuthDestination(redirectTo: string, roleName: string) {
  return redirectTo === "/dashboard" ? getDefaultDashboardPath(roleName) : redirectTo;
}

function prefetchDashboardForRole(roleName: string) {
  if (roleName === "admin" || roleName === "super_admin") {
    void import("~/routes/admin/dashboard");
  } else {
    void import("~/routes/users/registrations");
  }
}
