import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, redirect } from "react-router";

import type { Route } from "./+types/recruitment";
import type { ApiEnvelope } from "~/lib/api-client";
import { ApiError, buildApiUrl } from "~/lib/api-client";
import type { AuthUser } from "~/lib/auth-client";
import {
  submitRecruitmentRegistration,
  type SubmitRegistrationResult,
} from "~/lib/registrations-client";
import {
  isFileField,
  isOptionField,
} from "~/lib/registration-form-schema";
import type {
  ActiveRecruitmentFormResult,
  RegistrationFormField,
} from "~/lib/registration-forms-client";

export function meta() {
  return [
    { title: "报名表 | TARS-GO" },
    { name: "description", content: "TARS-GO 在线报名表" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentPath = new URL(request.url).pathname;

  let currentUser: AuthUser;
  try {
    const payload = await fetchLoaderApi<{ user: AuthUser }>(request, "/api/me");
    currentUser = payload.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
    }
    throw error;
  }

  try {
    const form = await fetchLoaderApi<ActiveRecruitmentFormResult>(
      request,
      "/api/recruitment/form",
    );
    return {
      currentUser,
      form,
      pageMode: "form" as const,
      unavailableMessage: null,
      submittedMessage: null,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && isSubmittedMessage(error.message)) {
      return {
        currentUser,
        form: null,
        pageMode: "submitted" as const,
        unavailableMessage: null,
        submittedMessage: error.message,
      };
    }
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      return {
        currentUser,
        form: null,
        pageMode: "unavailable" as const,
        unavailableMessage: error.message,
        submittedMessage: null,
      };
    }
    throw error;
  }
}

export default function RecruitmentPage({
  loaderData,
}: Route.ComponentProps) {
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() =>
    buildInitialValues(loaderData.form?.fieldsSchema ?? []),
  );
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<SubmitRegistrationResult | null>(null);
  const isSubmittedPage = loaderData.pageMode === "submitted" || Boolean(submittedResult);

  useEffect(() => {
    setFormValues(buildInitialValues(loaderData.form?.fieldsSchema ?? []));
    setNotice(null);
    setSubmitting(false);
    setSubmittedResult(null);
  }, [loaderData.form]);

  const scheduleText = useMemo(() => {
    if (!loaderData.form) {
      return "";
    }

    const start = formatDateTime(loaderData.form.startTime);
    const end = formatDateTime(loaderData.form.endTime);

    if (start && end) {
      return `${start} - ${end}`;
    }
    if (start) {
      return `${start} 起开放`;
    }
    if (end) {
      return `${end} 截止`;
    }
    return "发布后立即开放";
  }, [loaderData.form]);

  function updateFieldValue(key: string, value: unknown) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaderData.form || submittedResult) {
      return;
    }

    try {
      setSubmitting(true);
      setNotice(null);
      const payload = buildRegistrationSubmitPayload(
        loaderData.form.id,
        loaderData.form.fieldsSchema,
        formValues,
      );
      const result = await submitRecruitmentRegistration(payload);
      setSubmittedResult(result);
      setNotice({
        type: "success",
        message: "报名提交成功，当前状态为待审核。",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500 text-sm font-bold">
              T
            </div>
            <div>
              <div className="text-sm font-semibold">TARS-GO 报名系统</div>
              <div className="text-xs text-gray-400">
                当前账号：{loaderData.currentUser.email}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Link
              to="/"
              className="rounded-lg border border-gray-700 px-3 py-2 text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              返回首页
            </Link>
            <Link
              to="/admin/dashboard"
              className="rounded-lg bg-primary-500 px-3 py-2 font-medium text-white transition-colors hover:bg-primary-600"
            >
              进入后台
            </Link>
          </div>
        </div>
      </header>

      {isSubmittedPage ? (
        <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-4xl items-center px-4 py-10 sm:px-6">
          <section className="w-full rounded-xl border border-emerald-500/20 bg-gray-900/80 p-8 sm:p-10">
            <p className="text-sm uppercase tracking-[0.24em] text-emerald-300">
              Registered
            </p>
            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">
              你已完成报名
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
              {submittedResult
                ? "你的报名信息已经提交成功，当前状态为待审核，请留意后续通知。"
                : loaderData.submittedMessage ?? "你已经提交过当前报名表，无需再次填写。"}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/"
                className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                回到首页
              </Link>
              <Link
                to="/recruitment"
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                刷新当前页面
              </Link>
            </div>
          </section>
        </main>
      ) : !loaderData.form ? (
        <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-4xl items-center px-4 py-10 sm:px-6">
          <section className="w-full rounded-xl border border-gray-800 bg-gray-900/80 p-8 sm:p-10">
            <p className="text-sm uppercase tracking-[0.24em] text-primary-300">
              Recruitment
            </p>
            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">
              当前暂不可报名
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
              {loaderData.unavailableMessage ?? "当前暂无可访问的报名表。"}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/"
                className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
              >
                回到首页
              </Link>
              <Link
                to="/admin/form-config"
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                查看后台配置
              </Link>
            </div>
          </section>
        </main>
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/70">
            {loaderData.form.coverImageUrl ? (
              <img
                src={loaderData.form.coverImageUrl}
                alt={loaderData.form.title}
                className="h-56 w-full object-cover sm:h-72"
              />
            ) : (
              <div className="flex h-56 w-full items-end bg-[linear-gradient(135deg,rgba(0,91,172,0.35),rgba(0,26,50,0.9))] p-6 sm:h-72 sm:p-8">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-primary-200">
                    Recruitment
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
                    {loaderData.form.title}
                  </h1>
                </div>
              </div>
            )}

            <div className="grid gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8 lg:py-8">
              <section>
                {!loaderData.form.coverImageUrl ? null : (
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-primary-300">
                      Recruitment
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold">
                      {loaderData.form.title}
                    </h1>
                  </div>
                )}

                <p className="mt-4 max-w-3xl text-base leading-7 text-gray-300">
                  {loaderData.form.description?.trim() || "请按要求填写报名信息。"}
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <InfoBadge label="开放时间" value={scheduleText} />
                  <InfoBadge
                    label="审核流程"
                    value="提交后进入待审核"
                  />
                  <InfoBadge
                    label="人数上限"
                    value={
                      loaderData.form.maxRegistrations
                        ? `${loaderData.form.maxRegistrations} 人`
                        : "不限"
                    }
                  />
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                  {loaderData.form.fieldsSchema.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-100">
                        {field.label}
                        {field.required ? (
                          <span className="ml-2 text-xs text-rose-300">必填</span>
                        ) : null}
                      </label>
                      {field.description ? (
                        <p className="text-sm text-gray-400">{field.description}</p>
                      ) : null}
                      {renderFieldControl(field, formValues[field.key], updateFieldValue)}
                    </div>
                  ))}

                  {notice ? (
                    <div
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        notice.type === "success"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                          : "border-rose-500/20 bg-rose-500/10 text-rose-100"
                      }`}
                    >
                      {notice.message}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting || Boolean(submittedResult)}
                    className="rounded-lg bg-primary-500 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittedResult ? "已提交" : submitting ? "提交中..." : "提交报名"}
                  </button>
                </form>
              </section>

              <aside className="self-start rounded-xl border border-gray-800 bg-gray-950/60 p-5">
                <h2 className="text-lg font-semibold">填写提醒</h2>
                <div className="mt-5 space-y-4 text-sm leading-6 text-gray-300">
                  <p>系统字段“姓名 / 手机号 / 邮箱”由后台强制要求，提交时必须补全。</p>
                  <p>文件与图片类字段会跟随本次报名一起上传，并通过后台受保护接口访问。</p>
                  <p>如果当前时间不在开放窗口内，页面会自动切换为不可报名状态。</p>
                </div>
              </aside>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/60 px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function renderFieldControl(
  field: RegistrationFormField,
  value: unknown,
  onChange: (key: string, value: unknown) => void,
) {
  const commonClassName =
    "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-400 focus:outline-none";

  if (field.type === "textarea") {
    return (
      <textarea
        rows={4}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(field.key, event.target.value)}
        placeholder={field.placeholder}
        className={commonClassName}
      />
    );
  }

  if (isOptionField(field.type)) {
    if (field.type === "select") {
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={commonClassName}
        >
          <option value="">请选择</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "radio") {
      return (
        <div className="flex flex-wrap gap-3">
          {field.options?.map((option) => (
            <label
              key={option.value}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
            >
              <input
                type="radio"
                name={field.key}
                checked={value === option.value}
                onChange={() => onChange(field.key, option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }

    const selectedValues = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];

    return (
      <div className="flex flex-wrap gap-3">
        {field.options?.map((option) => {
          const checked = selectedValues.includes(option.value);
          return (
            <label
              key={option.value}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange(field.key, [...selectedValues, option.value]);
                    return;
                  }
                  onChange(
                    field.key,
                    selectedValues.filter((item) => item !== option.value),
                  );
                }}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    );
  }

  if (isFileField(field.type)) {
    return (
      <input
        type="file"
        multiple={field.type === "image"}
        className={`${commonClassName} file:mr-4 file:rounded-md file:border-0 file:bg-primary-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-600`}
        onChange={(event) => onChange(field.key, event.target.files)}
      />
    );
  }

  const inputType =
    field.type === "date"
      ? "date"
      : field.type === "number"
        ? "number"
        : field.type === "email"
          ? "email"
          : field.type === "phone"
            ? "tel"
            : "text";

  return (
    <input
      type={inputType}
      value={typeof value === "string" || typeof value === "number" ? value : ""}
      onChange={(event) => onChange(field.key, event.target.value)}
      placeholder={field.placeholder}
      className={commonClassName}
    />
  );
}

function buildInitialValues(fields: RegistrationFormField[]) {
  return fields.reduce<Record<string, unknown>>((accumulator, field) => {
    if (field.type === "checkbox") {
      accumulator[field.key] = [];
      return accumulator;
    }
    if (isFileField(field.type)) {
      accumulator[field.key] = null;
      return accumulator;
    }
    accumulator[field.key] = typeof field.default_value === "string"
      ? field.default_value
      : "";
    return accumulator;
  }, {});
}

function buildRegistrationSubmitPayload(
  formId: number,
  fields: RegistrationFormField[],
  values: Record<string, unknown>,
) {
  const payload = new FormData();
  payload.append("formId", String(formId));

  for (const field of fields) {
    const value = values[field.key];
    if (field.type === "checkbox") {
      const items = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      for (const item of items) {
        payload.append(field.key, item);
      }
      continue;
    }

    if (isFileField(field.type)) {
      const fileList = value instanceof FileList ? value : null;
      if (!fileList) {
        continue;
      }
      Array.from(fileList).forEach((file) => {
        payload.append(field.key, file);
      });
      continue;
    }

    if (typeof value === "number") {
      payload.append(field.key, String(value));
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      payload.append(field.key, value.trim());
    }
  }

  return payload;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function fetchLoaderApi<T>(request: Request, path: string): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (typeof window === "undefined") {
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.set("Cookie", cookie);
    }
  }

  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    credentials: "include",
    headers,
  });

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.code >= 400) {
    throw new ApiError(
      payload?.message ?? "请求失败，请稍后重试",
      payload?.code ?? response.status,
    );
  }

  return payload.data;
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "提交失败，请稍后重试。";
}

function isSubmittedMessage(message: string) {
  return message.includes("已完成当前报名") || message.includes("已提交");
}
