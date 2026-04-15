import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import {
  ApiError,
  registerWithEmail,
  sendRegisterCode,
} from "~/lib/auth-client";
import { useCooldown } from "~/lib/use-cooldown";

const inputClassName =
  "w-full rounded-lg border border-gray-700 bg-gray-800/90 px-4 py-3 text-white placeholder-gray-500 transition-[border-color,box-shadow,background-color] duration-200 focus:border-primary-400 focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500/30";

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
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const redirectTo = useMemo(
    () => getSafeRedirectPath(searchParams.get("redirect")),
    [searchParams],
  );

  const canSendCode =
    isValidEmail(email) && !cooldown.isCoolingDown && !sendingCode;

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
        phone,
        code,
      });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950 px-4 py-10">
      <div className="hero-grid-motion absolute inset-0 bg-[linear-gradient(rgba(0,91,172,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,91,172,0.03)_1px,transparent_1px)] bg-[size:56px_56px] opacity-60" />
      <div className="hero-glow-motion absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-500/8 blur-[110px]" />
      <div className="hero-glow-motion absolute left-[24%] top-[70%] h-56 w-56 rounded-full bg-sky-400/8 blur-[100px]" />

      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="motion-fade-down motion-button mb-8 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          <svg
            className="w-4 h-4"
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

        <div className="motion-fade-up rounded-2xl border border-gray-800 bg-gray-900/95 p-8 shadow-2xl shadow-black/20 backdrop-blur-sm">
          <div className="motion-fade-up mb-8 text-center" style={{ animationDelay: "80ms" }}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 shadow-lg shadow-primary-500/25">
              <span className="text-white font-bold text-lg">T</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">加入 TARS-GO</h1>
            <p className="text-sm text-gray-400">
              完成邮箱验证后即可直接进入统一工作台
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="motion-fade-up" style={{ animationDelay: "140ms" }}>
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
                className={inputClassName}
              />
            </div>

            <div className="motion-fade-up" style={{ animationDelay: "180ms" }}>
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
                className={inputClassName}
              />
            </div>

            <div className="motion-fade-up" style={{ animationDelay: "220ms" }}>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                手机号
                <span className="ml-2 text-xs text-gray-500">可选</span>
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="13800138000"
                className={inputClassName}
              />
            </div>

            <div className="motion-fade-up" style={{ animationDelay: "260ms" }}>
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
                  className="motion-button text-sm font-medium text-primary-400 disabled:cursor-not-allowed disabled:text-gray-500"
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
                className={inputClassName}
              />
            </div>

            {errorMessage && (
              <div className="motion-fade-up rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="motion-button w-full rounded-lg bg-primary-500 py-3 font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-primary-500/60"
            >
              {submitting ? "注册中..." : "注册并进入工作台"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-400">
            已有账号？{" "}
            <Link
              to={redirectTo === "/dashboard" ? "/login" : `/login?redirect=${encodeURIComponent(redirectTo)}`}
              className="motion-button font-medium text-primary-400 hover:text-primary-300"
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
