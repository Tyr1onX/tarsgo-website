import { type FormEvent, type MouseEvent, useMemo, useState } from "react";
import { redirect, useNavigate, useSearchParams } from "react-router";

import type { Route } from "./+types/register";

import { AuthShell } from "~/components/auth-shell";
import {
  ApiError,
  getOptionalCurrentUser,
  registerWithEmail,
  sendRegisterCode,
} from "~/lib/auth-client";
import { useCooldown } from "~/lib/use-cooldown";
import { getDefaultDashboardPath } from "~/lib/dashboard-navigation";

export function meta() {
  return [
    { title: "注册 | TARS-GO" },
    { name: "description", content: "注册TARS-GO吉甲大师战队平台账号" },
  ];
}

export async function clientLoader(_: Route.ClientLoaderArgs) {
  const currentUser = await getOptionalCurrentUser({ force: true });
  if (currentUser) {
    throw redirect(getDefaultDashboardPath(currentUser.role.name));
  }

  return null;
}

clientLoader.hydrate = true;

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cooldown = useCooldown();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const redirectTo = useMemo(
    () => getSafeRedirectPath(searchParams.get("redirect")),
    [searchParams],
  );

  const canSendCode =
    isValidEmail(email) && !cooldown.isCoolingDown && !sendingCode;

  function handleBackToHome(e: MouseEvent) {
    e.preventDefault();
    setLeaving(true);
    setTimeout(() => navigate("/"), 350);
  }

  async function handleSendCode() {
    if (!isValidEmail(email)) {
      setErrorMessage("请输入有效邮箱后再发送验证码。");
      return;
    }

    try {
      setSendingCode(true);
      setErrorMessage("");
      await sendRegisterCode(email);
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
    if (password.trim().length < 6) {
      setErrorMessage("密码长度至少为 6 位。");
      return;
    }
    if (realName.trim() === "") {
      setErrorMessage("请输入真实姓名。");
      return;
    }
    if (!isChineseRealName(realName)) {
      setErrorMessage("真实姓名需为汉字。");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setErrorMessage("请输入正确的 11 位手机号。");
      return;
    }
    if (code.trim().length !== 6) {
      setErrorMessage("请输入 6 位验证码。");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      const user = await registerWithEmail({
        email,
        password,
        realName,
        phone,
        code,
      });
      const destination = redirectTo === "/dashboard" ? getDefaultDashboardPath(user.role.name) : redirectTo;
      if (user.role.name === "admin" || user.role.name === "super_admin") {
        void import("~/routes/admin/dashboard");
      } else {
        void import("~/routes/users/registrations");
      }
      setSubmitting(false);
      setSuccess(true);
      setTimeout(() => navigate(destination, { replace: true }), 900);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      mode="register"
      title={success ? "注册成功" : "加入 TARS-GO"}
      description={success ? "账号已创建，正在进入工作台。" : "完成邮箱验证后即可进入统一工作台。"}
      redirectTo={redirectTo}
      leaving={leaving}
      onHomeClick={handleBackToHome}
    >
      {success ? (
        <div className="auth-success" role="status" aria-live="polite">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
          <span>注册成功，正在进入工作台…</span>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
          <div className="auth-form-grid">
            <div className="auth-field auth-field--wide">
              <label htmlFor="email">邮箱</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="建议使用常用非校园邮箱"
                maxLength={255}
                className="auth-input"
              />
            </div>

            <div className="auth-field auth-field--wide">
              <label htmlFor="password">密码</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
                maxLength={72}
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="realName">真实姓名</label>
              <input
                id="realName"
                type="text"
                autoComplete="name"
                required
                value={realName}
                onChange={(event) => setRealName(event.target.value)}
                placeholder="请输入真实姓名"
                maxLength={100}
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="phone">手机号</label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                required
                maxLength={11}
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="13800138000"
                className="auth-input"
              />
            </div>

            <div className="auth-field auth-field--wide">
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
          </div>

          {errorMessage ? <div className="auth-error animate-auth-fade-in" role="alert" aria-live="polite">{errorMessage}</div> : null}

          <button type="submit" disabled={submitting} className="auth-submit">
            {submitting ? "注册中..." : "创建账号"}
          </button>
        </form>
      )}
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
  const email = value.trim();
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isChineseRealName(value: string) {
  return /^[\u3400-\u4dbf\u4e00-\u9fff\uF900-\uFAFF]+$/u.test(value.trim());
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
