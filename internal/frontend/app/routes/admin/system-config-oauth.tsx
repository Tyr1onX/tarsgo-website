import keyRound from "@iconify-icons/lucide/key-round";
import { Icon, type IconifyIcon } from "@iconify/react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { Notify } from "~/components/notify";
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

type SuccessFlashState = string | null;

type OAuthFormState = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scope: string;
};

const emptyFormState: OAuthFormState = {
  enabled: false,
  clientId: "",
  clientSecret: "",
  callbackUrl: "",
  scope: "",
};

const FLASH_DURATION_MS = 3000;
const NOTIFY_ANIMATION_MS = 300;

export default function SystemConfigOAuthPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<OAuthSystemConfigItem[]>([]);
  const [forms, setForms] = useState<Record<string, OAuthFormState>>({});
  const [activeProvider, setActiveProvider] = useState("github");
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successFlash, setSuccessFlash] = useState<SuccessFlashState>(null);
  const [successFlashVisible, setSuccessFlashVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        setLoading(true);
        setErrorMessage("");
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

  const currentItem = useMemo(
    () => items.find((item) => item.provider === activeProvider) ?? null,
    [activeProvider, items],
  );
  const currentForm = useMemo(
    () => forms[activeProvider] ?? emptyFormState,
    [activeProvider, forms],
  );
  const isEditingCurrentProvider = currentItem?.provider === editingProvider;

  const currentDefaultScope = useMemo(
    () => getDefaultScope(currentItem?.provider ?? activeProvider),
    [activeProvider, currentItem?.provider],
  );
  const secretPlaceholder = useMemo(() => {
    if (!currentItem?.clientSecretConfigured) {
      return "输入 Client Secret";
    }
    return `${currentItem.clientSecretMasked}（留空保持不变）`;
  }, [currentItem]);
  const scopeHelper = useMemo(() => {
    if (!currentItem) {
      return "";
    }
    return `OAuth 授权范围，决定 ${currentItem.displayName} 返回哪些用户信息。留空时默认使用 ${currentDefaultScope}。`;
  }, [currentDefaultScope, currentItem]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

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
      setSuccessFlash(`${result.displayName} 配置已保存并立即生效。`);
    } catch (error) {
      handlePageError(error, navigate, setErrorMessage);
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

  function handleEdit(provider: string) {
    setErrorMessage("");
    setEditingProvider(provider);
  }

  function handleSelectProvider(provider: string) {
    setErrorMessage("");
    setActiveProvider(provider);
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
        <div className="motion-fade-up">
          <h1 className="text-2xl font-bold text-white">第三方登录</h1>
        </div>

        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

        <div className="motion-fade-up glass-panel rounded-2xl" style={{ animationDelay: "80ms" }}>
          <div className="border-b border-white/[0.06] px-6 py-4">
            <div className="inline-flex rounded-xl border border-white/[0.06] bg-black/20 p-1">
              {items.map((item) => {
                const active = item.provider === activeProvider;
                return (
                  <button
                    key={item.provider}
                    type="button"
                    onClick={() => handleSelectProvider(item.provider)}
                    className={`rounded-xl px-4 py-2 text-sm transition-colors ${
                      active
                        ? "nav-item-active text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {item.displayName}
                  </button>
                );
              })}
            </div>
          </div>

          {currentItem ? isEditingCurrentProvider ? (
            <form onSubmit={handleSubmit}>
              <SectionHeader
                icon={keyRound}
                title={`${currentItem.displayName} 配置`}
                action={(
                  <button
                    type="submit"
                    disabled={loading || saving}
                    className="btn-gradient inline-flex min-w-[104px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "保存中..." : "保存配置"}
                  </button>
                )}
              />
              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={currentForm.enabled}
                    onChange={(event) => updateCurrentForm({ enabled: event.target.checked })}
                    disabled={loading || saving}
                    className="h-4 w-4 rounded border-white/[0.08] bg-black/30 text-primary-500 focus:ring-primary-400/30"
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
                  disabled={loading || saving}
                />
                <InputField
                  label="Client Secret"
                  value={currentForm.clientSecret}
                  onChange={(value) => updateCurrentForm({ clientSecret: value })}
                  placeholder={secretPlaceholder}
                  type="password"
                  disabled={loading || saving}
                />
                <div className="md:col-span-2">
                  <InputField
                    label="回调地址"
                    value={currentForm.callbackUrl}
                    onChange={(value) => updateCurrentForm({ callbackUrl: value })}
                    placeholder="https://example.com/api/login/provider/callback"
                    disabled={loading || saving}
                  />
                </div>
                <div className="md:col-span-2">
                  <InputField
                    label="Scope（授权范围）"
                    value={currentForm.scope}
                    onChange={(value) => updateCurrentForm({ scope: value })}
                    placeholder={currentDefaultScope}
                    disabled={loading || saving}
                  />
                </div>
              </div>
            </form>
          ) : (
            <div>
              <SectionHeader
                icon={keyRound}
                title={`${currentItem.displayName} 配置`}
                action={(
                  <button
                    type="button"
                    onClick={() => handleEdit(currentItem.provider)}
                    disabled={loading || saving}
                    className="btn-glass inline-flex min-w-[104px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-gray-100 transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    编辑配置
                  </button>
                )}
              />
              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <ReadonlyField label="启用状态" value={currentItem.enabled ? "已启用" : "未启用"} />
                </div>
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
                  <ReadonlyField
                    label="Scope（授权范围）"
                    value={formatDisplayValue(currentItem.scope)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="px-6 py-10 text-sm text-gray-400">暂无可配置的第三方登录项。</div>
          )}
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
    <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
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
  helper,
  valueClassName,
}: {
  label: string;
  value: string;
  helper?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-2 text-sm text-white ${valueClassName ?? ""}`}>{value}</div>
      {helper ? <p className="mt-2 text-xs leading-5 text-gray-500">{helper}</p> : null}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  helper?: ReactNode;
  type?: "text" | "password";
  disabled?: boolean;
}) {
  return (
    <label className="block rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
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
      {helper ? <p className="mt-2 text-xs leading-5 text-gray-500">{helper}</p> : null}
    </label>
  );
}

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

function getDefaultScope(provider: string) {
  return provider === "google" ? "openid email profile" : "read:user user:email";
}
