import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { AuthShell } from "~/components/auth-shell";
import {
  ApiError,
  getBootstrapStatus,
  getOptionalCurrentUser,
  getOAuthLoginProviders,
  getOAuthLoginUrl,
  loginWithCode,
  loginWithPassword,
  sendLoginCode,
  type OAuthLoginProvider,
} from "~/lib/auth-client";
import { useCooldown } from "~/lib/use-cooldown";

type LoginMode = "password" | "code";

const oauthErrorMap: Record<string, string> = {
  github_callback_invalid: "GitHub 回调参数不完整，请重新发起授权。",
  github_state_invalid: "GitHub 登录态校验失败，请重新尝试。",
  github_oauth_failed: "GitHub 授权失败，请稍后重试。",
  google_callback_invalid: "Google 回调参数不完整，请重新发起授权。",
  google_state_invalid: "Google 登录态校验失败，请重新尝试。",
  google_oauth_failed: "Google 授权失败，请稍后重试。",
};

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
  const [providers, setProviders] = useState<OAuthLoginProvider[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const cooldown = useCooldown();

  const oauthError = useMemo(() => {
    const code = searchParams.get("error") ?? "";
    return oauthErrorMap[code] ?? "";
  }, [searchParams]);
  const redirectTo = useMemo(
    () => getSafeRedirectPath(searchParams.get("redirect")),
    [searchParams],
  );

  useEffect(() => {
    if (oauthError) {
      setErrorMessage(oauthError);
    }
  }, [oauthError]);

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
          navigate("/dashboard", { replace: true });
        }
      })
      .catch((error) => {
        if (!disposed) {
          setErrorMessage(getErrorMessage(error));
        }
      });

    void getOAuthLoginProviders()
      .then((items) => {
        if (!disposed) {
          setProviders(items);
        }
      })
      .catch(() => {
        // OAuth is optional; password/code login stays usable if provider discovery fails.
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
        await loginWithPassword({ email, password });
      } else {
        await loginWithCode({ email, code });
      }

      navigate(redirectTo, { replace: true });
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

      {providers.length > 0 ? (
        <>
          <div className="auth-oauth-divider">其他登录方式</div>
          <div className="auth-oauth-list">
            {providers.map((provider) => (
              <a key={provider.provider} href={getOAuthLoginUrl(provider.provider)} className="auth-oauth-link">
                <OAuthProviderIcon provider={provider} />
                <span>使用 {provider.displayName} 登录</span>
              </a>
            ))}
          </div>
        </>
      ) : null}
    </AuthShell>
  );
}

function OAuthProviderIcon({ provider }: { provider: OAuthLoginProvider }) {
  if (provider.provider === "google") {
    return (
      <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-sky-600" aria-hidden="true">
        G
      </div>
    );
  }

  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.5v-1.96c-2.94.64-3.56-1.24-3.56-1.24-.48-1.2-1.17-1.52-1.17-1.52-.96-.65.07-.64.07-.64 1.05.08 1.6 1.06 1.6 1.06.95 1.6 2.48 1.14 3.08.87.1-.67.37-1.14.66-1.4-2.35-.26-4.82-1.16-4.82-5.15 0-1.14.42-2.07 1.1-2.8-.11-.26-.48-1.33.1-2.77 0 0 .9-.28 2.96 1.07a10.4 10.4 0 0 1 5.39 0c2.06-1.35 2.96-1.07 2.96-1.07.58 1.44.21 2.51.1 2.77.69.73 1.1 1.66 1.1 2.8 0 4-2.47 4.89-4.83 5.14.38.32.72.95.72 1.92v2.84c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z" />
    </svg>
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
