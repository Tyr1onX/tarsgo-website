import { type FormEvent, useMemo, useState } from "react";
import { Link, redirect, useNavigate } from "react-router";

import type { Route } from "./+types/setup-super-admin";
import { ApiError } from "~/lib/api-client";
import { getBootstrapStatus, registerInitialSuperAdmin } from "~/lib/auth-client";

export function meta() {
  return [
    { title: "初始化超级管理员 | TARS-GO" },
    { name: "description", content: "首次运行时创建 TARS-GO 超级管理员账户" },
  ];
}

export async function clientLoader(_: Route.ClientLoaderArgs) {
  const status = await getBootstrapStatus();
  if (!status.setupRequired) {
    throw redirect("/dashboard");
  }

  return null;
}

clientLoader.hydrate = true;

export default function SetupSuperAdmin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordStrength = useMemo(() => computePasswordStrength(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

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
    if (password !== confirmPassword) {
      setErrorMessage("两次输入的密码不一致。");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      await registerInitialSuperAdmin({ email, password, confirmPassword });
      setSubmitting(false);
      setSuccess(true);
      setTimeout(() => navigate("/dashboard/admin", { replace: true }), 900);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-design setup-super-admin min-h-screen flex items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="group mb-8 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          <svg
            className="h-4 w-4 auth-back-link-arrow"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
          返回首页
        </Link>

        <div className="relative admin-panel setup-super-admin__card rounded-lg px-8 py-9">
          <div className="relative mb-7 text-center">
            <div className="relative mx-auto mb-5 h-14 w-14">
              <div className={`setup-super-admin__mark ${success ? "setup-super-admin__mark--success" : ""}`}>
                {success ? (
                  <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path className="auth-success-check" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-xl font-bold tracking-tight text-white">T</span>
                )}
              </div>
            </div>
            <h1 className="mb-1.5 text-2xl font-bold tracking-tight text-white">
              {success ? "初始化完成" : "创建超级管理员"}
            </h1>
            <div className="mx-auto mt-5 h-px w-16 bg-[var(--admin-border)]" />
          </div>

          <div className="setup-super-admin__notice mb-6 rounded-md p-4">
            <div className="relative">
              <div className="flex items-start gap-3">
                <div className="chip-gradient-soft flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl">
                  <svg className="h-4 w-4 text-[var(--admin-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--admin-text)]">仅首次运行显示</span>
                    <span className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--admin-muted)]">
                      One-time
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--admin-muted)]">
                    创建成功后，该账号将作为系统的首个<span className="font-medium text-[var(--admin-accent)]">超级管理员</span>，后续访问将恢复为正常登录流程。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-300">
                邮箱
              </label>
              <div className="group relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75A2.25 2.25 0 014.5 4.5h15A2.25 2.25 0 0121.75 6.75v10.5A2.25 2.25 0 0119.5 19.5h-15a2.25 2.25 0 01-2.25-2.25V6.75z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 9-6" />
                  </svg>
                </span>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="root@example.com"
                  className="admin-field setup-super-admin__field setup-super-admin__field--icon"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-300">
                密码
              </label>
              <div className="group relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 10-9 0v3m-1.5 0h12a1.5 1.5 0 011.5 1.5v7.5a1.5 1.5 0 01-1.5 1.5h-12a1.5 1.5 0 01-1.5-1.5V12a1.5 1.5 0 011.5-1.5z" />
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 6 位"
                  className="admin-field setup-super-admin__field setup-super-admin__field--icon setup-super-admin__field--action"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 transition-colors hover:text-gray-300"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {password.length > 0 ? (
                <div className="mt-2 flex items-center gap-2.5">
                  <div className="flex flex-1 gap-1">
                    {[1, 2, 3].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          passwordStrength.score >= level ? passwordStrength.barColor : "bg-gray-700"
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-medium transition-colors ${passwordStrength.textColor}`}>
                    {passwordStrength.label}
                  </span>
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-gray-300">
                确认密码
              </label>
              <div className="group relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入密码"
                  className={`admin-field setup-super-admin__field setup-super-admin__field--icon setup-super-admin__field--action ${
                    passwordsMismatch
                      ? "setup-super-admin__field--error"
                      : passwordsMatch ? "setup-super-admin__field--success" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 transition-colors hover:text-gray-300"
                  aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordsMismatch ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-300">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  两次输入的密码不一致
                </p>
              ) : passwordsMatch ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  密码一致
                </p>
              ) : null}
            </div>

            {errorMessage ? (
              <div role="alert" className="admin-notice admin-notice--error">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || success}
              className="admin-button admin-button--primary w-full py-3"
            >
              {success ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path className="auth-success-check" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  初始化完成
                </span>
              ) : submitting ? "创建中..." : "创建"}
            </button>
          </form>
        </div>
      </div>
    </div>
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

function computePasswordStrength(value: string) {
  if (!value) {
    return { score: 0, label: "", barColor: "bg-gray-700", textColor: "text-gray-500" };
  }
  let score = 0;
  if (value.length >= 6) score += 1;
  if (value.length >= 10) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (value.length < 6 || score <= 1) {
    return { score: 1, label: "弱", barColor: "bg-rose-500", textColor: "text-rose-300" };
  }
  if (score <= 3) {
    return { score: 2, label: "中", barColor: "bg-amber-500", textColor: "text-amber-300" };
  }
  return { score: 3, label: "强", barColor: "bg-emerald-500", textColor: "text-emerald-300" };
}
