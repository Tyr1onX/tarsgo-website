import keyRound from "@iconify-icons/lucide/key-round";
import { Icon, type IconifyIcon } from "@iconify/react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { ApiError } from "~/lib/api-client";
import {
  getOAuthSystemConfig,
  updateOAuthSystemConfig,
  type OAuthSystemConfigItem,
} from "~/lib/system-config-client";

export function meta() {
  return [
    { title: "第三方登录 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 第三方登录配置" },
  ];
}

type FlashState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type OAuthFormState = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scope: string;
};

export default function SystemConfigOAuthPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<OAuthSystemConfigItem[]>([]);
  const [forms, setForms] = useState<Record<string, OAuthFormState>>({});
  const [activeProvider, setActiveProvider] = useState("github");
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        setLoading(true);
        const result = await getOAuthSystemConfig();
        if (cancelled) {
          return;
        }

        setItems(result);
        setForms(
          result.reduce<Record<string, OAuthFormState>>((accumulator, item) => {
            accumulator[item.provider] = {
              enabled: item.enabled,
              clientId: item.clientId,
              clientSecret: "",
              callbackUrl: item.callbackUrl,
              scope: item.scope,
            };
            return accumulator;
          }, {}),
        );
        if (result.length > 0) {
          setActiveProvider((current) =>
            result.some((item) => item.provider === current) ? current : result[0].provider,
          );
        }
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

  const currentItem = useMemo(
    () => items.find((item) => item.provider === activeProvider) ?? null,
    [activeProvider, items],
  );
  const currentForm = useMemo(
    () =>
      forms[activeProvider] ?? {
        enabled: false,
        clientId: "",
        clientSecret: "",
        callbackUrl: "",
        scope: "",
      },
    [activeProvider, forms],
  );

  const secretPlaceholder = useMemo(() => {
    if (!currentItem?.clientSecretConfigured) {
      return "输入 Client Secret";
    }
    return `${currentItem.clientSecretMasked}（留空保持不变）`;
  }, [currentItem]);
  const isEditingCurrentProvider = currentItem?.provider === editingProvider;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlash(null);

    try {
      setSaving(true);
      const result = await updateOAuthSystemConfig(activeProvider, currentForm);
      setItems((current) =>
        current.map((item) => (item.provider === result.provider ? result : item)),
      );
      setForms((current) => ({
        ...current,
        [result.provider]: {
          enabled: result.enabled,
          clientId: result.clientId,
          clientSecret: "",
          callbackUrl: result.callbackUrl,
          scope: result.scope,
        },
      }));
      setEditingProvider(null);
      setFlash({
        type: "success",
        message: `${result.displayName} 配置已保存并立即生效。`,
      });
    } catch (error) {
      handlePageError(error, navigate, setFlash);
    } finally {
      setSaving(false);
    }
  }

  function updateCurrentForm(patch: Partial<OAuthFormState>) {
    setForms((current) => ({
      ...current,
      [activeProvider]: {
        ...currentForm,
        ...patch,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-white">第三方登录</h1>
        <p className="text-sm text-gray-400">
          管理 GitHub 与 Google 登录接入参数。保存后会立即切换当前服务实例的登录配置。
        </p>
      </div>

      {flash ? <FlashBanner type={flash.type} message={flash.message} /> : null}

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
        当前仅开放必要字段：启用状态、Client ID、Client Secret、回调地址与 Scope。高级端点继续使用内置默认值。
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-6 py-4">
          <div className="inline-flex rounded-xl border border-gray-800 bg-gray-950/70 p-1">
            {items.map((item) => {
              const active = item.provider === activeProvider;
              return (
                <button
                  key={item.provider}
                  type="button"
                  onClick={() => setActiveProvider(item.provider)}
                  className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary-500 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {item.displayName}
                </button>
              );
            })}
          </div>
        </div>

        {currentItem ? (
          <form onSubmit={handleSubmit}>
            <SectionHeader
              icon={keyRound}
              title={`${currentItem.displayName} 配置`}
              description="Client Secret 留空时保留当前已保存的值。"
              action={isEditingCurrentProvider ? (
                <button
                  type="submit"
                  disabled={loading || saving}
                  className="inline-flex items-center justify-center rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "保存中..." : "保存配置"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingProvider(currentItem.provider)}
                  disabled={loading || saving}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-100 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  编辑配置
                </button>
              )}
            />
            {isEditingCurrentProvider ? (
              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={currentForm.enabled}
                    onChange={(event) => updateCurrentForm({ enabled: event.target.checked })}
                    disabled={loading}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-primary-500 focus:ring-primary-500/30"
                  />
                  <div>
                    <div className="text-sm font-medium text-white">启用 {currentItem.displayName} 登录</div>
                    <div className="text-xs text-gray-500">
                      关闭后登录页不会展示该入口，但会保留当前配置。
                    </div>
                  </div>
                </label>

                <InputField
                  label="Client ID"
                  value={currentForm.clientId}
                  onChange={(value) => updateCurrentForm({ clientId: value })}
                  placeholder="输入 Client ID"
                  disabled={loading}
                />
                <InputField
                  label="Client Secret"
                  value={currentForm.clientSecret}
                  onChange={(value) => updateCurrentForm({ clientSecret: value })}
                  placeholder={secretPlaceholder}
                  type="password"
                  disabled={loading}
                />
                <div className="md:col-span-2">
                  <InputField
                    label="回调地址"
                    value={currentForm.callbackUrl}
                    onChange={(value) => updateCurrentForm({ callbackUrl: value })}
                    placeholder="https://example.com/api/login/provider/callback"
                    disabled={loading}
                  />
                </div>
                <div className="md:col-span-2">
                  <InputField
                    label="Scope"
                    value={currentForm.scope}
                    onChange={(value) => updateCurrentForm({ scope: value })}
                    placeholder="openid email profile"
                    disabled={loading}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <ReadonlyField label="启用状态" value={currentItem.enabled ? "已启用" : "未启用"} />
                <ReadonlyField label="Client ID" value={formatDisplayValue(currentItem.clientId)} />
                <ReadonlyField
                  label="Client Secret"
                  value={currentItem.clientSecretConfigured ? currentItem.clientSecretMasked : "未配置"}
                />
                <div className="md:col-span-2">
                  <ReadonlyField
                    label="回调地址"
                    value={formatDisplayValue(currentItem.callbackUrl)}
                    valueClassName="break-all"
                  />
                </div>
                <div className="md:col-span-2">
                  <ReadonlyField label="Scope" value={formatDisplayValue(currentItem.scope)} />
                </div>
              </div>
            )}
          </form>
        ) : (
          <div className="px-6 py-10 text-sm text-gray-400">暂无可配置的第三方登录项。</div>
        )}
      </div>
    </div>
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
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10 text-primary-400">
          <Icon icon={icon} className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-gray-400">{description}</p>
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
    <div className="rounded-xl border border-gray-800 bg-gray-950/70 px-4 py-3">
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

function FlashBanner({ type, message }: { type: "success" | "error"; message: string }) {
  const className = type === "success"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
    : "border-rose-500/20 bg-rose-500/10 text-rose-100";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${className}`}>
      {message}
    </div>
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
    message: error instanceof ApiError ? error.message : "请求失败，请稍后重试。",
  });
}

function formatDisplayValue(value: string) {
  return value.trim() || "未配置";
}
