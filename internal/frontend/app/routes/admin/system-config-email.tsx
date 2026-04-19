import mail from "@iconify-icons/lucide/mail";
import send from "@iconify-icons/lucide/send";
import { Icon, type IconifyIcon } from "@iconify/react";
import { forwardRef, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { Notify } from "~/components/notify";
import { ApiError } from "~/lib/api-client";
import {
  getEmailSystemConfig,
  sendRegisterFlowCodeSystemConfig,
  updateEmailSystemConfig,
  verifyRegisterFlowCodeSystemConfig,
  type EmailSystemConfig,
} from "~/lib/system-config-client";

export function meta() {
  return [
    { title: "邮件发信 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 系统邮件发信配置" },
  ];
}

type SuccessFlashState = string | null;

type EmailFormState = {
  host: string;
  port: string;
  username: string;
  password: string;
  from: string;
};

const emptyFormState: EmailFormState = {
  host: "",
  port: "465",
  username: "",
  password: "",
  from: "",
};

const FLASH_DURATION_MS = 3000;
const NOTIFY_ANIMATION_MS = 300;

export default function SystemConfigEmailPage() {
  const navigate = useNavigate();
  const verificationCodeInputRef = useRef<HTMLInputElement | null>(null);
  const [config, setConfig] = useState<EmailSystemConfig | null>(null);
  const [form, setForm] = useState<EmailFormState>(emptyFormState);
  const [isEditing, setIsEditing] = useState(false);
  const [flowEmail, setFlowEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        applyConfig(result);
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

  const passwordPlaceholder = useMemo(() => {
    if (!config?.passwordConfigured) {
      return "输入 SMTP 密码";
    }
    return `${config.passwordMasked}（留空保持不变）`;
  }, [config]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    try {
      setSaving(true);
      const result = await updateEmailSystemConfig(form);
      applyConfig(result);
      setIsEditing(false);
      setSuccessFlash("邮件配置已保存并立即生效。");
    } catch (error) {
      handlePageError(error, navigate, setErrorMessage);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    try {
      setSendingCode(true);
      await sendRegisterFlowCodeSystemConfig({
        ...form,
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

  function applyConfig(result: EmailSystemConfig) {
    setConfig(result);
    setForm({
      host: result.host,
      port: result.port,
      username: result.username,
      password: "",
      from: result.from,
    });
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
          <h1 className="text-2xl font-bold text-white">邮件发信</h1>
          <p className="text-sm text-gray-400">配置注册、登录验证码与系统通知使用的 SMTP 发信参数。</p>
        </div>

        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

        <div className="motion-fade-up rounded-2xl border border-gray-800 bg-gray-900" style={{ animationDelay: "80ms" }}>
          {isEditing ? (
            <form onSubmit={handleSave}>
              <SectionHeader
                icon={mail}
                title="字段配置"
                action={(
                  <button
                    type="submit"
                    disabled={loading || saving}
                    className="inline-flex min-w-[104px] items-center justify-center rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "保存中..." : "保存配置"}
                  </button>
                )}
              />
              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <InputField
                  label="SMTP Host"
                  value={form.host}
                  onChange={(value) => setForm((current) => ({ ...current, host: value }))}
                  placeholder="smtp.example.com"
                  disabled={loading || saving}
                />
                <InputField
                  label="SMTP Port"
                  value={form.port}
                  onChange={(value) => setForm((current) => ({ ...current, port: value }))}
                  placeholder="465"
                  disabled={loading || saving}
                />
                <InputField
                  label="用户名"
                  value={form.username}
                  onChange={(value) => setForm((current) => ({ ...current, username: value }))}
                  placeholder="SMTP 用户名"
                  disabled={loading || saving}
                />
                <InputField
                  label="发件邮箱"
                  value={form.from}
                  onChange={(value) => setForm((current) => ({ ...current, from: value }))}
                  placeholder="noreply@example.com"
                  disabled={loading || saving}
                />
                <div className="md:col-span-2">
                  <InputField
                    label="SMTP 密码"
                    value={form.password}
                    onChange={(value) => setForm((current) => ({ ...current, password: value }))}
                    placeholder={passwordPlaceholder}
                    type="password"
                    disabled={loading || saving}
                  />
                </div>
              </div>
            </form>
          ) : (
            <div>
              <SectionHeader
                icon={mail}
                title="字段配置"
                action={(
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage("");
                      setIsEditing(true);
                    }}
                    disabled={loading || saving}
                    className="inline-flex min-w-[104px] items-center justify-center rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-100 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    编辑配置
                  </button>
                )}
              />
              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <ReadonlyField label="SMTP Host" value={formatDisplayValue(form.host)} />
                <ReadonlyField label="SMTP Port" value={formatDisplayValue(form.port)} />
                <ReadonlyField label="用户名" value={formatDisplayValue(form.username)} />
                <ReadonlyField label="发件邮箱" value={formatDisplayValue(form.from)} />
                <div className="md:col-span-2">
                  <ReadonlyField
                    label="SMTP 密码"
                    value={config?.passwordConfigured ? config.passwordMasked : "未配置"}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="motion-fade-up rounded-2xl border border-gray-800 bg-gray-900" style={{ animationDelay: "140ms" }}>
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto px-6 py-5">
            <div className="inline-flex shrink-0 items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10 text-primary-400">
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
                disabled={loading || sendingCode || verifyingCode}
                autoComplete="email"
                className="min-w-[16rem] flex-1"
              />
              <button
                type="submit"
                disabled={loading || sendingCode || verifyingCode}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-100 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
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
                disabled={loading || sendingCode || verifyingCode}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                className="w-36"
              />
              <button
                type="submit"
                disabled={loading || sendingCode || verifyingCode}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-100 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="flex flex-col gap-4 border-b border-gray-800 px-6 py-5 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10 text-primary-400">
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
    <div className="rounded-xl border border-gray-800 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-2 text-sm text-white ${valueClassName ?? ""}`}>{value}</div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "password";
  disabled?: boolean;
}) {
  return (
    <label className="block rounded-xl border border-gray-800 bg-gray-950/70 px-4 py-3">
      <span className="block text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-2 w-full bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
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
          className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-500/60 focus:outline-none focus:ring-1 focus:ring-primary-500/30 disabled:cursor-not-allowed disabled:opacity-60"
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
    navigate("/dashboard/users", { replace: true });
    return;
  }
  setErrorMessage(error instanceof ApiError ? error.message : "请求失败，请稍后重试。");
}

function formatDisplayValue(value: string) {
  return value.trim() || "未配置";
}
