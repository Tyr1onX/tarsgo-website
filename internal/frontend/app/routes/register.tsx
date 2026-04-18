import { type FormEvent, type MouseEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import {
  ApiError,
  registerWithEmail,
  sendRegisterCode,
} from "~/lib/auth-client";
import { useCooldown } from "~/lib/use-cooldown";

export function meta() {
  return [
    { title: "注册 | TARS-GO" },
    { name: "description", content: "注册TARS-GO吉甲大师战队平台账号" },
  ];
}

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
    if (phone.trim() === "") {
      setErrorMessage("请输入手机号。");
      return;
    }
    if (code.trim().length !== 6) {
      setErrorMessage("请输入 6 位验证码。");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      await registerWithEmail({
        email,
        password,
        realName,
        phone,
        code,
      });
      setSubmitting(false);
      setSuccess(true);
      setTimeout(() => navigate(redirectTo, { replace: true }), 900);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-10">
      <div className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-primary-500/8 rounded-full blur-[110px] ${success ? "animate-auth-success-glow" : leaving ? "animate-auth-exit-glow" : "animate-auth-glow"}`} />
      {success && (
        <div className="fixed inset-0 bg-gray-950/80 animate-auth-success-overlay z-40" />
      )}

      <div className={`relative w-full max-w-md ${success ? "z-50" : ""} ${leaving ? "animate-auth-exit" : ""}`}>
        <Link
          to="/"
          onClick={handleBackToHome}
          className="group inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8 animate-auth-back-link"
        >
          <svg
            className="w-4 h-4 auth-back-link-arrow"
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

        <div className={`p-8 rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl shadow-black/20 animate-auth-card ${success ? "animate-auth-success-card" : ""}`}>
          <div className="text-center mb-8 relative">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 transition-all duration-300 ${success ? "bg-emerald-500 scale-110" : "bg-primary-500"}`}>
              {success ? (
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path className="auth-success-check" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-white font-bold text-lg">T</span>
              )}
            </div>
            {success && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-16 rounded-xl border-2 border-emerald-400/50 animate-auth-success-ring" />
            )}
            <h1 className="text-2xl font-bold text-white mb-2">
              {success ? "注册成功" : "加入 TARS-GO"}
            </h1>
            <p className="text-sm text-gray-400">
              {success ? "正在进入工作台..." : "完成邮箱验证后即可直接进入统一工作台"}
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                邮箱
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="your@jlu.edu.cn"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                密码
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <label
                htmlFor="realName"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                真实姓名
              </label>
              <input
                id="realName"
                type="text"
                autoComplete="name"
                required
                value={realName}
                onChange={(event) => setRealName(event.target.value)}
                placeholder="请输入真实姓名"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                手机号
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="13800138000"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-gray-300"
                >
                  邮箱验证码
                </label>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={!canSendCode}
                  className="text-sm font-medium text-primary-400 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                >
                  {cooldown.isCoolingDown
                    ? `${cooldown.remainingSeconds}s 后重发`
                    : sendingCode
                      ? "发送中..."
                      : "发送验证码"}
                </button>
              </div>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="输入 6 位验证码"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 animate-auth-fade-in">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || success}
              className={`w-full py-3 font-medium rounded-lg transition-all duration-300 disabled:cursor-not-allowed ${
                success
                  ? "bg-emerald-500 text-white scale-[1.02]"
                  : "bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/60 text-white"
              }`}
            >
              {success ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path className="auth-success-check" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  注册成功
                </span>
              ) : submitting ? "注册中..." : "注册"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-400">
            已有账号？{" "}
            <Link
              to={redirectTo === "/dashboard" ? "/login" : `/login?redirect=${encodeURIComponent(redirectTo)}`}
              className="text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              立即登录
            </Link>
          </p>
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
