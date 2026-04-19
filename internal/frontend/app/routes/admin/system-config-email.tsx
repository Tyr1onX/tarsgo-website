import mail from "@iconify-icons/lucide/mail";
import send from "@iconify-icons/lucide/send";
import { Icon } from "@iconify/react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
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

type FlashState =
  | { type: "success"; title: string; message: string }
  | { type: "error"; title: string; message: string }
  | null;

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

export default function SystemConfigEmailPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<EmailSystemConfig | null>(null);
  const [form, setForm] = useState<EmailFormState>(emptyFormState);
  const [flowEmail, setFlowEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [toastOpen, setToastOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        setLoading(true);
        const result = await getEmailSystemConfig();
        if (cancelled) {
          return;
        }
        applyConfig(result);
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setFlash);
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
    if (!flash) {
      setToastOpen(false);
      return;
    }

    setToastOpen(true);
    const hideTimer = window.setTimeout(() => {
      setToastOpen(false);
    }, 2600);
    const clearTimer = window.setTimeout(() => {
      setFlash(null);
    }, 2950);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [flash]);

  const passwordPlaceholder = useMemo(() => {
    if (!config?.passwordConfigured) {
      return "输入 SMTP 密码";
    }
    return `${config.passwordMasked}（留空保持不变）`;
  }, [config]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlash(null);

    try {
      setSaving(true);
      const result = await updateEmailSystemConfig(form);
      applyConfig(result);
      setFlash({ type: "success", title: "保存成功", message: "邮件配置已保存并立即生效。" });
    } catch (error) {
      handlePageError(error, navigate, setFlash);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlash(null);

    try {
      setSendingCode(true);
      await sendRegisterFlowCodeSystemConfig({
        ...form,
        email: flowEmail,
      });
      setFlash({
        type: "success",
        title: "发送成功",
        message: "注册验证码已发送，请查收邮箱后继续校验。",
      });
    } catch (error) {
      handlePageError(error, navigate, setFlash);
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyCode() {
    setFlash(null);

    try {
      setVerifyingCode(true);
      await verifyRegisterFlowCodeSystemConfig({
        email: flowEmail,
        code: verificationCode,
      });
      setFlash({
        type: "success",
        title: "验证通过",
        message: "注册验证码校验成功，注册流程可继续执行。",
      });
    } catch (error) {
      handlePageError(error, navigate, setFlash);
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

  function dismissToast() {
    setToastOpen(false);
    window.setTimeout(() => {
      setFlash(null);
    }, 300);
  }

  return (
    <>
      {flash ? (
        <Notify
          tone={flash.type}
          title={flash.title}
          message={flash.message}
          open={toastOpen}
          onClose={dismissToast}
          placement="top-right"
        />
      ) : null}

      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">邮件发信</h1>
          <p className="text-sm text-gray-400">配置注册、登录验证码与系统通知使用的 SMTP 发信参数。</p>
        </div>

        <form onSubmit={handleSave} className="rounded-2xl border border-gray-800 bg-gray-900">
          <SectionHeader icon={mail} title="字段配置" description="保存到系统配置后立即生效。" />
          <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
            <InputField
              label="SMTP Host"
              value={form.host}
              onChange={(value) => setForm((current) => ({ ...current, host: value }))}
              placeholder="smtp.example.com"
              disabled={loading}
            />
            <InputField
              label="SMTP Port"
              value={form.port}
              onChange={(value) => setForm((current) => ({ ...current, port: value }))}
              placeholder="465"
              disabled={loading}
            />
            <InputField
              label="用户名"
              value={form.username}
              onChange={(value) => setForm((current) => ({ ...current, username: value }))}
              placeholder="SMTP 用户名"
              disabled={loading}
            />
            <InputField
              label="发件邮箱"
              value={form.from}
              onChange={(value) => setForm((current) => ({ ...current, from: value }))}
              placeholder="noreply@example.com"
              disabled={loading}
            />
            <div className="md:col-span-2">
              <InputField
                label="SMTP 密码"
                value={form.password}
                onChange={(value) => setForm((current) => ({ ...current, password: value }))}
                placeholder={passwordPlaceholder}
                type="password"
                disabled={loading}
              />
            </div>
          </div>
          <div className="flex items-center justify-end border-t border-gray-800 px-6 py-4">
            <button
              type="submit"
              disabled={loading || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存配置"}
            </button>
          </div>
        </form>

        <form onSubmit={handleSendCode} className="rounded-2xl border border-gray-800 bg-gray-900">
          <SectionHeader
            icon={send}
            title="注册流程测试"
            description="填写邮箱获取注册验证码，再输入收到的 6 位验证码完成校验。"
          />
          <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white">获取验证码</h3>
              <InputField
                label="测试邮箱"
                value={flowEmail}
                onChange={setFlowEmail}
                placeholder="receiver@example.com"
                disabled={loading || sendingCode || verifyingCode}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading || sendingCode || verifyingCode}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-100 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendingCode ? "发送中..." : "获取验证码"}
                </button>
              </div>
            </div>

            <div className="space-y-4 border-t border-gray-800 pt-6 md:border-t-0 md:border-l md:pl-6 md:pt-0">
              <h3 className="text-sm font-medium text-white">验证码验证</h3>
              <InputField
                label="验证码"
                value={verificationCode}
                onChange={setVerificationCode}
                placeholder="输入 6 位验证码"
                disabled={loading || sendingCode || verifyingCode}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    void handleVerifyCode();
                  }}
                  disabled={loading || sendingCode || verifyingCode}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-100 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifyingCode ? "验证中..." : "验证验证码"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: Parameters<typeof Icon>[0]["icon"];
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-gray-800 px-6 py-5">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10 text-primary-400">
        <Icon icon={icon} className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-gray-400">{description}</p>
      </div>
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
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-primary-500/60 focus:outline-none focus:ring-1 focus:ring-primary-500/30 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function handlePageError(
  error: unknown,
  navigate: ReturnType<typeof useNavigate>,
  setFlash: (state: FlashState) => void,
) {
  if (error instanceof ApiError && error.status === 401) {
    navigate("/login", { replace: true });
    return;
  }
  if (error instanceof ApiError && error.status === 403) {
    navigate("/dashboard/users", { replace: true });
    return;
  }
  setFlash({
    type: "error",
    title: "操作失败",
    message: error instanceof ApiError ? error.message : "请求失败，请稍后重试。",
  });
}
