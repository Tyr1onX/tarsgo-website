import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import {
  ApiError,
  getGitHubLoginUrl,
  loginWithCode,
  loginWithPassword,
  sendLoginCode,
} from "~/lib/auth-client";
import { useCooldown } from "~/lib/use-cooldown";

type LoginMode = "password" | "code";

const oauthErrorMap: Record<string, string> = {
  github_callback_invalid: "GitHub 回调参数不完整，请重新发起授权。",
  github_state_invalid: "GitHub 登录态校验失败，请重新尝试。",
  github_oauth_failed: "GitHub 授权失败，请稍后重试。",
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-10">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-primary-500/8 rounded-full blur-[110px]" />

      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8"
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

        <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl shadow-black/20">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary-500 flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-lg">T</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">欢迎回来</h1>
            <p className="text-sm text-gray-400">登录你的 TARS-GO 管理后台账号</p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-950/70 border border-gray-800 p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode("password")}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                mode === "password"
                  ? "bg-primary-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              密码登录
            </button>
            <button
              type="button"
              onClick={() => setMode("code")}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                mode === "code"
                  ? "bg-primary-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              验证码登录
            </button>
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
                placeholder="admin@tarsgo.local"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
              />
            </div>

            {mode === "password" ? (
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
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入密码"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-gray-300"
                  >
                    验证码
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
            )}

            {errorMessage && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/60 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-800" />
            <span className="text-xs uppercase tracking-[0.3em] text-gray-500">or</span>
            <div className="h-px flex-1 bg-gray-800" />
          </div>

          <a
            href={getGitHubLoginUrl()}
            className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 hover:bg-white/5 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.5v-1.96c-2.94.64-3.56-1.24-3.56-1.24-.48-1.2-1.17-1.52-1.17-1.52-.96-.65.07-.64.07-.64 1.05.08 1.6 1.06 1.6 1.06.95 1.6 2.48 1.14 3.08.87.1-.67.37-1.14.66-1.4-2.35-.26-4.82-1.16-4.82-5.15 0-1.14.42-2.07 1.1-2.8-.11-.26-.48-1.33.1-2.77 0 0 .9-.28 2.96 1.07a10.4 10.4 0 0 1 5.39 0c2.06-1.35 2.96-1.07 2.96-1.07.58 1.44.21 2.51.1 2.77.69.73 1.1 1.66 1.1 2.8 0 4-2.47 4.89-4.83 5.14.38.32.72.95.72 1.92v2.84c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z" />
            </svg>
            使用 GitHub 登录
          </a>

          <div className="mt-6 rounded-xl border border-primary-500/20 bg-primary-500/10 px-4 py-3 text-sm text-primary-100">
            <div className="font-medium mb-1">测试管理员账号</div>
            <div>邮箱：admin@tarsgo.local</div>
            <div>密码：123456</div>
          </div>

          <p className="mt-6 text-center text-sm text-gray-400">
            还没有账号？{" "}
            <Link
              to={redirectTo === "/admin/dashboard" ? "/register" : `/register?redirect=${encodeURIComponent(redirectTo)}`}
              className="text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              立即注册
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
    return "/admin/dashboard";
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/admin/dashboard";
  }

  return trimmed;
}
