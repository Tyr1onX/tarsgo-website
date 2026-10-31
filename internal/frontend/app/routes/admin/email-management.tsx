import mail from "@iconify-icons/lucide/mail";
import send from "@iconify-icons/lucide/send";
import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { Notify } from "~/components/notify";
import { ApiError } from "~/lib/api-client";
import {
  getEmailManagementConfig,
  saveEmailNotificationTemplates,
  testEmailSystemConfig,
  type EmailManagementConfig,
} from "~/lib/email-management-client";
import {
  previewEmailTemplate,
  validateEmailNotificationTemplates,
  type EmailNotificationTemplates,
} from "~/lib/email-templates";

const templateOptions = [
  { key: "screeningRejected", label: "初筛未通过" },
  { key: "interviewAdmitted", label: "面试录取" },
  { key: "interviewRejected", label: "面试未通过" },
] as const;

type TemplateKey = (typeof templateOptions)[number]["key"];
type EditorField = "subject" | "body";

export function meta() {
  return [{ title: "邮件管理 | TARSGO" }];
}

export default function EmailManagementPage() {
  const navigate = useNavigate();
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [config, setConfig] = useState<EmailManagementConfig | null>(null);
  const [templates, setTemplates] = useState<EmailNotificationTemplates | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<TemplateKey>("screeningRejected");
  const [activeField, setActiveField] = useState<EditorField>("body");
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getEmailManagementConfig()
      .then((result) => {
        if (!cancelled) {
          setConfig(result);
          setTemplates(result.notificationTemplates);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) handlePageError(error, navigate, setErrorMessage);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const currentTemplate = templates?.[activeTemplate];
  const preview = useMemo(() => {
    if (!currentTemplate || !config) return null;
    return {
      subject: previewEmailTemplate(currentTemplate.subject, config.availableVariables),
      body: previewEmailTemplate(currentTemplate.body, config.availableVariables),
    };
  }, [currentTemplate, config]);

  function updateCurrentTemplate(field: EditorField, value: string) {
    setTemplates((current) => current ? {
      ...current,
      [activeTemplate]: { ...current[activeTemplate], [field]: value },
    } : current);
    setErrorMessage("");
  }

  function insertVariable(token: string) {
    const field = activeField;
    const element = field === "subject" ? subjectRef.current : bodyRef.current;
    const value = currentTemplate?.[field] ?? "";
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    updateCurrentTemplate(field, next);
    window.requestAnimationFrame(() => {
      const updatedElement = field === "subject" ? subjectRef.current : bodyRef.current;
      updatedElement?.focus();
      updatedElement?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templates || !config) return;
    const validationMessage = validateEmailNotificationTemplates(templates, config.availableVariables);
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }
    try {
      setSaving(true);
      setErrorMessage("");
      const result = await saveEmailNotificationTemplates(templates);
      setConfig(result);
      setTemplates(result.notificationTemplates);
      setSuccessMessage("邮件模板已保存。");
    } catch (error) {
      handlePageError(error, navigate, setErrorMessage);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSendingTest(true);
      setErrorMessage("");
      await testEmailSystemConfig({ to: recipient.trim() });
      setSuccessMessage("测试邮件已发送。");
    } catch (error) {
      handlePageError(error, navigate, setErrorMessage);
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <>
      {successMessage ? (
        <Notify tone="success" title="操作成功" message={successMessage} open onClose={() => setSuccessMessage("")} placement="bottom-right" />
      ) : null}

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--admin-text)]">邮件管理</h1>
          <div className="flex items-center gap-4 text-sm text-[var(--admin-muted)]">
            <span>{config?.from || (loading ? "加载中..." : "发件邮箱未配置")}</span>
            <span className={`rounded-full border px-2.5 py-1 text-xs ${config?.configured ? "border-[var(--admin-success-border)] bg-[var(--admin-success-surface)] text-[var(--admin-success)]" : "border-[var(--admin-warning-border)] bg-[var(--admin-warning-surface)] text-[var(--admin-warning)]"}`}>
              {loading ? "检查中" : config?.configured ? "发信已配置" : "发信未配置"}
            </span>
          </div>
        </div>

        {errorMessage ? <div role="alert" className="admin-notice admin-notice--error">{errorMessage}</div> : null}

        <section className="glass-panel overflow-hidden rounded-2xl">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border-subtle)] px-6 py-4">
            <div className="flex items-center gap-3">
              <Icon icon={mail} className="h-5 w-5 text-[var(--admin-accent)]" />
              <h2 className="text-lg font-semibold text-[var(--admin-text)]">通知模板</h2>
            </div>
            <span className="text-xs text-[var(--admin-muted)]">验证码模板由系统固定生成</span>
          </header>

          {loading || !templates || !config || !currentTemplate ? (
            <div className="px-6 py-8 text-sm text-[var(--admin-muted)]">{loading ? "正在加载邮件设置..." : "邮件设置加载失败。"}</div>
          ) : (
            <form onSubmit={(event) => void handleSave(event)} className="space-y-5 px-6 py-5">
              <label className="block max-w-sm text-sm text-[var(--admin-muted)]">
                模板
                <select
                  value={activeTemplate}
                  onChange={(event) => setActiveTemplate(event.target.value as TemplateKey)}
                  className="admin-field mt-1"
                >
                  {templateOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>

              <label className="block text-sm text-[var(--admin-muted)]">
                主题
                <input
                  ref={subjectRef}
                  required
                  maxLength={255}
                  value={currentTemplate.subject}
                  onFocus={() => setActiveField("subject")}
                  onChange={(event) => updateCurrentTemplate("subject", event.target.value)}
                  className="admin-field mt-1"
                />
              </label>

              <label className="block text-sm text-[var(--admin-muted)]">
                正文
                <textarea
                  ref={bodyRef}
                  required
                  maxLength={10000}
                  rows={10}
                  value={currentTemplate.body}
                  onFocus={() => setActiveField("body")}
                  onChange={(event) => updateCurrentTemplate("body", event.target.value)}
                  className="admin-field mt-1 min-h-56 resize-y font-mono text-sm leading-6"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs text-[var(--admin-muted)]">插入变量</span>
                {config.availableVariables.map((variable) => (
                  <button
                    key={variable.token}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertVariable(variable.token)}
                    className="admin-button admin-button--secondary admin-button--small"
                  >
                    {variable.label}
                  </button>
                ))}
              </div>

              {preview ? (
                <div className="rounded-xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface-subtle)] p-4">
                  <h3 className="text-sm font-medium text-[var(--admin-text)]">实时预览</h3>
                  <div className="mt-3 text-sm text-[var(--admin-muted)]">主题：{preview.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-[var(--admin-muted)]">{preview.body}</pre>
                </div>
              ) : null}

              <div className="flex justify-end">
                <button type="submit" disabled={saving} className="admin-button admin-button--primary">
                  {saving ? "保存中..." : "保存模板"}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="glass-panel rounded-2xl">
          <header className="flex items-center gap-3 border-b border-[var(--admin-border-subtle)] px-6 py-4">
            <Icon icon={send} className="h-5 w-5 text-[var(--admin-accent)]" />
            <h2 className="text-lg font-semibold text-[var(--admin-text)]">发信测试</h2>
          </header>
          <form onSubmit={(event) => void handleSendTest(event)} className="flex flex-wrap items-end gap-3 px-6 py-5">
            <label className="min-w-64 flex-1 text-sm text-[var(--admin-muted)]">
              测试收件邮箱
              <input
                required
                type="email"
                maxLength={255}
                autoComplete="email"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                className="admin-field mt-1"
                placeholder="name@example.com"
              />
            </label>
            <button type="submit" disabled={sendingTest || loading} className="admin-button admin-button--secondary">
              {sendingTest ? "发送中..." : "发送测试邮件"}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

function handlePageError(error: unknown, navigate: ReturnType<typeof useNavigate>, setErrorMessage: (message: string) => void) {
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
