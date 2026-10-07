import mail from "@iconify-icons/lucide/mail";
import send from "@iconify-icons/lucide/send";
import { Icon, type IconifyIcon } from "@iconify/react";
import { forwardRef, type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { Notify } from "~/components/notify";
import { ApiError } from "~/lib/api-client";
import {
  getEmailSystemConfig,
  testEmailSystemConfig,
  sendRegisterFlowCodeSystemConfig,
  verifyRegisterFlowCodeSystemConfig,
  type EmailSystemConfig,
} from "~/lib/system-config-client";

export function meta() {
  return [
    { title: "邮件服务 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 系统邮件服务配置与诊断" },
  ];
}

type SuccessFlashState = string | null;

const FLASH_DURATION_MS = 3000;
const NOTIFY_ANIMATION_MS = 300;

export default function SystemConfigEmailPage() {
  const navigate = useNavigate();
  const verificationCodeInputRef = useRef<HTMLInputElement | null>(null);
  const [config, setConfig] = useState<EmailSystemConfig | null>(null);
  const [flowEmail, setFlowEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successFlash, setSuccessFlash] = useState<SuccessFlashState>(null);
  const [successFlashVisible, setSuccessFlashVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        setLoading(true);
        setErrorMessage("");
        const result = await getEmailSystemConfig();
        if (cancelled) {
          return;
        }
        setConfig(result);
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setErrorMessage);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!successFlash) {
      return;
    }

    setSuccessFlashVisible(true);
  }, [successFlash]);

  useEffect(() => {
    if (!successFlash || !successFlashVisible) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccessFlashVisible(false);
    }, FLASH_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [successFlash, successFlashVisible]);

  useEffect(() => {
    if (!successFlash || successFlashVisible) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccessFlash(null);
    }, NOTIFY_ANIMATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [successFlash, successFlashVisible]);

  async function handleSendTest() {
    setErrorMessage("");
    try {
      setSendingTest(true);
      await testEmailSystemConfig({ to: flowEmail });
      setSuccessFlash("测试邮件已发送，请查收邮箱。");
    } catch (error) {
      handlePageError(error, navigate, setErrorMessage);
    } finally {
      setSendingTest(false);
    }
  }

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    try {
      setSendingCode(true);
      await sendRegisterFlowCodeSystemConfig({
        email: flowEmail,
      });
      setSuccessFlash("注册验证码已发送，请查收邮箱后继续校验。");
      window.requestAnimationFrame(() => {
        verificationCodeInputRef.current?.focus();
        verificationCodeInputRef.current?.select();
      });
    } catch (error) {
      handlePageError(error, navigate, setErrorMessage);
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    try {
      setVerifyingCode(true);
      await verifyRegisterFlowCodeSystemConfig({
        email: flowEmail,
        code: verificationCode,
      });
      setSuccessFlash("注册验证码校验成功，注册流程可继续执行。");
    } catch (error) {
      handlePageError(error, navigate, setErrorMessage);
    } finally {
      setVerifyingCode(false);
    }
  }

  function clearSuccessFlash(immediate = false) {
    if (immediate) {
      setSuccessFlashVisible(false);
      setSuccessFlash(null);
      return;
    }

    setSuccessFlashVisible(false);
  }

  return (
    <>
      {successFlash ? (
        <Notify
          tone="success"
          title="操作成功"
          message={successFlash}
          open={successFlashVisible}
          onClose={() => clearSuccessFlash()}
          placement="bottom-right"
        />
      ) : null}

      <div className="space-y-6">
        <div className="motion-fade-up space-y-2">
          <h1 className="text-2xl font-bold text-white">邮件服务</h1>
          <p className="text-sm text-gray-400">注册、登录验证码与系统通知的发信状态。</p>
        </div>

        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

        <div className="motion-fade-up glass-panel rounded-2xl" style={{ animationDelay: "80ms" }}>
          <SectionHeader icon={mail} title="发信状态" />
          <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
            <ReadonlyField label="发件邮箱" value={config?.from || "加载中..."} />
            <ReadonlyField label="状态" value={loading ? "加载中..." : config?.configured ? "已配置" : "未配置，请联系管理员"} />
          </div>
        </div>

        <div className="motion-fade-up glass-panel rounded-2xl" style={{ animationDelay: "140ms" }}>
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto px-6 py-5">
            <div className="inline-flex shrink-0 items-center gap-3">
              <div className="chip-gradient-soft inline-flex h-10 w-10 items-center justify-center rounded-xl text-primary-200">
                <Icon icon={send} className="h-5 w-5" />
              </div>
              <h2 className="shrink-0 text-lg font-semibold text-white">发信测试</h2>
            </div>
            <form onSubmit={handleSendCode} className="flex min-w-0 flex-1 items-center gap-3">
              <CompactInput
                id="email-test-recipient"
                ariaLabel="测试邮箱"
                value={flowEmail}
                onChange={setFlowEmail}
                placeholder="receiver@example.com"
                disabled={loading || sendingTest || sendingCode || verifyingCode}
                autoComplete="email"
                className="min-w-[16rem] flex-1"
              />
              <button
                type="button"
                onClick={() => void handleSendTest()}
                disabled={loading || sendingTest || sendingCode || verifyingCode}
                className="btn-glass inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-100 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingTest ? "发送中..." : "发送测试邮件"}
              </button>
              <button
                type="submit"
                disabled={loading || sendingTest || sendingCode || verifyingCode}
                className="btn-glass inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-100 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingCode ? "发送中..." : "获取验证码"}
              </button>
            </form>
            <form onSubmit={handleVerifyCode} className="flex shrink-0 items-center gap-3">
              <CompactInput
                id="email-test-code"
                ref={verificationCodeInputRef}
                ariaLabel="验证码"
                value={verificationCode}
                onChange={setVerificationCode}
                placeholder="6 位验证码"
                disabled={loading || sendingTest || sendingCode || verifyingCode}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                className="w-36"
              />
              <button
                type="submit"
                disabled={loading || sendingTest || sendingCode || verifyingCode}
                className="btn-glass inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-100 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifyingCode ? "验证中..." : "验证"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: IconifyIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/[0.06] px-6 py-5 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-3">
        <div className="chip-gradient-soft inline-flex h-10 w-10 items-center justify-center rounded-xl text-primary-200">
          <Icon icon={icon} className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 text-sm text-gray-400">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="md:ml-6 md:shrink-0">{action}</div> : null}
    </div>
  );
}

function ReadonlyField({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-2 text-sm text-white ${valueClassName ?? ""}`}>{value}</div>
    </div>
  );
}

const CompactInput = forwardRef<HTMLInputElement, {
  id: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "email" | "numeric";
  maxLength?: number;
  className?: string;
}>(
  (
    {
      id,
      ariaLabel,
      value,
      onChange,
      placeholder,
      disabled = false,
      autoComplete,
      inputMode,
      maxLength,
      className = "",
    },
    ref,
  ) => {
    return (
      <label htmlFor={id} className={`block ${className}`}>
        <span className="sr-only">{ariaLabel}</span>
        <input
          id={id}
          ref={ref}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          aria-label={ariaLabel}
          className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-400/60 focus:outline-none focus:ring-1 focus:ring-primary-400/30 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
    );
  },
);

CompactInput.displayName = "CompactInput";

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
      {message}
    </div>
  );
}

function handlePageError(
  error: unknown,
  navigate: ReturnType<typeof useNavigate>,
  setErrorMessage: (message: string) => void,
) {
  if (error instanceof ApiError && error.status === 401) {
    navigate("/login", { replace: true });
    return;
  }
  if (error instanceof ApiError && error.status === 403) {
    navigate("/dashboard/admin", { replace: true });
    return;
  }
  setErrorMessage(error instanceof ApiError ? error.message : "请求失败，请稍后重试。");
}
