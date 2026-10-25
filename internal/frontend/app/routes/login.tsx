import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { AuthShell } from "~/components/auth-shell";
import {
  ApiError,
  getBootstrapStatus,
  getAccountSessions,
  getOptionalCurrentUser,
  loginWithCode,
  loginWithPassword,
  sendLoginCode,
  switchAccountSession,
  type AccountSessionAccount,
} from "~/lib/auth-client";
import { getDefaultDashboardPath } from "~/lib/dashboard-navigation";
import { useCooldown } from "~/lib/use-cooldown";

type LoginMode = "password" | "code";

export function meta() {
  return [
    { title: "登录 | TARSGO" },
    { name: "description", content: "登录TARSGO吉甲大师战队平台" },
  ];
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<AccountSessionAccount[]>([]);
  const [switchingAccountId, setSwitchingAccountId] = useState<number | null>(null);
  const cooldown = useCooldown();

  const redirectTo = useMemo(
    () => getSafeRedirectPath(searchParams.get("redirect")),
    [searchParams],
  );
  const addingAccount = searchParams.get("addAccount") === "1";
  const reauthenticating = searchParams.get("reauth") === "1";

  useEffect(() => {
    let disposed = false;

    void Promise.all([getBootstrapStatus(), getOptionalCurrentUser(), getAccountSessions().catch(() => [])])
      .then(([bootstrapStatus, currentUser, accounts]) => {
        if (disposed) {
          return;
        }
        setSavedAccounts(accounts);
        if (bootstrapStatus.setupRequired) {
          navigate("/dashboard/setup/super-admin", { replace: true });
          return;
        }
        if (currentUser && !addingAccount) {
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
  }, [addingAccount, navigate, redirectTo]);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) setEmail(emailParam);
  }, [searchParams]);

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
        navigate(getAccountLoginDestination(redirectTo, user.role.name, addingAccount, reauthenticating), { replace: true });
      } else {
        const user = await loginWithCode({ email, code });
        prefetchDashboardForRole(user.role.name);
        navigate(getAccountLoginDestination(redirectTo, user.role.name, addingAccount, reauthenticating), { replace: true });
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setSubmitting(false);
    }
  }

  async function handleSwitchSavedAccount(accountId: number) {
    setErrorMessage("");
    setSwitchingAccountId(accountId);
    try {
      const { user } = await switchAccountSession(accountId);
      window.location.assign(getAccountLoginDestination(redirectTo, user.role.name, addingAccount, reauthenticating));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setSwitchingAccountId(null);
    }
  }

  return (
    <AuthShell
      mode="login"
      title={addingAccount ? "添加另一个账号" : "欢迎回来"}
      description={addingAccount ? "使用另一个 TARSGO 账号登录" : "登录你的 TARSGO 统一工作台账号"}
      redirectTo={redirectTo}
    >
      {savedAccounts.length > 0 ? (
        <section className="auth-saved-accounts" aria-label="已保存账号">
          <h2>已保存账号</h2>
          <div className="auth-saved-accounts__list">
            {savedAccounts.map((account) => (
              <div key={account.id} className="auth-saved-account">
                <span className="auth-saved-account__avatar" aria-hidden="true">
                  {(account.user.nickname?.trim() || account.user.email).charAt(0).toUpperCase()}
                </span>
                <span className="auth-saved-account__details">
                  <strong>{account.user.nickname || account.user.email}</strong>
                  <small>{account.user.email} · {account.user.role.displayName}</small>
                </span>
                <span className="auth-saved-account__status">
                  {account.current ? "当前账号" : account.status === "available" ? "可切换" : account.status === "disabled" ? "账号已停用" : "会话已失效"}
                </span>
                {account.status === "available" ? <button type="button" onClick={() => void handleSwitchSavedAccount(account.id)} disabled={account.current || switchingAccountId != null} className="auth-saved-account__action">{account.current ? "当前" : switchingAccountId === account.id ? "切换中…" : "切换"}</button> : account.status === "disabled" ? null : <Link className="auth-saved-account__action" to={reauthPath(account.user.email, redirectTo, addingAccount)}>重新验证</Link>}
              </div>
            ))}
          </div>
        </section>
      ) : null}

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

function reauthPath(email: string, redirectTo: string, addingAccount: boolean) {
  const params = new URLSearchParams({ email, addAccount: "1" });
  if (redirectTo) params.set("redirect", redirectTo);
  params.set("reauth", "1");
  return `/login?${params.toString()}`;
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

function getAccountLoginDestination(redirectTo: string, roleName: string, addingAccount: boolean, reauthenticating: boolean) {
  if (reauthenticating) return resolveAuthDestination(redirectTo, roleName);
  return addingAccount ? getDefaultDashboardPath(roleName) : resolveAuthDestination(redirectTo, roleName);
}

function prefetchDashboardForRole(_roleName: string) {
  void import("~/routes/dashboard/index");
}
