import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, redirect, useOutletContext } from "react-router";

import type { Route } from "./+types/registrations";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import type { ApiEnvelope } from "~/lib/api-client";
import { ApiError, buildApiUrl } from "~/lib/api-client";
import {
  isFileField,
  isOptionField,
} from "~/lib/registration-form-schema";
import type {
  RecruitmentPageData,
  RecruitmentPageRegistrationSummary,
  RegistrationFormField,
} from "~/lib/registration-forms-client";
import {
  submitRecruitmentRegistration,
  type SubmitRegistrationResult,
} from "~/lib/registrations-client";

const registrationStatusMeta: Record<number, { label: string; hint: string; badgeClassName: string }> = {
  0: {
    label: "待审核",
    hint: "报名资料已提交，正在等待管理员处理。",
    badgeClassName: "border-amber-500/20 bg-amber-500/10 text-amber-200",
  },
  1: {
    label: "已通过",
    hint: "报名审核已通过，请留意后续通知。",
    badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
  },
  2: {
    label: "未通过",
    hint: "本次报名未通过审核，你可以关注后续开放时间。",
    badgeClassName: "border-rose-500/20 bg-rose-500/10 text-rose-200",
  },
  3: {
    label: "已取消",
    hint: "当前报名记录已被取消。",
    badgeClassName: "border-gray-700 bg-gray-800 text-gray-200",
  },
};

export function meta() {
  return [
    { title: "纳新报名 | TARS-GO" },
    { name: "description", content: "TARS-GO 统一工作台纳新报名页" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentPath = new URL(request.url).pathname;

  try {
    return await fetchLoaderApi<RecruitmentPageData>(request, "/api/recruitment/form");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
    }
    throw error;
  }
}

export default function UserRegistrations({
  loaderData,
}: Route.ComponentProps) {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() =>
    buildInitialValues(loaderData.form?.fieldsSchema ?? []),
  );
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<SubmitRegistrationResult | null>(null);

  useEffect(() => {
    setFormValues(buildInitialValues(loaderData.form?.fieldsSchema ?? []));
    setNotice(null);
    setSubmitting(false);
    setSubmittedResult(null);
  }, [loaderData.pageMode, loaderData.form, loaderData.registrationSummary?.id]);

  const submittedSummary = useMemo<RecruitmentPageRegistrationSummary | null>(() => {
    if (submittedResult) {
      return {
        id: submittedResult.id,
        formId: submittedResult.formId,
        formTitle: loaderData.form?.title ?? loaderData.registrationSummary?.formTitle ?? "当前报名",
        status: submittedResult.status,
        canEdit: loaderData.registrationSummary?.canEdit ?? false,
        canCancel: loaderData.registrationSummary?.canCancel ?? false,
        submittedAt: submittedResult.submittedAt,
        updatedAt: submittedResult.submittedAt,
      };
    }

    return loaderData.registrationSummary ?? null;
  }, [loaderData.form?.title, loaderData.registrationSummary, submittedResult]);

  const pageMode = submittedSummary ? "submitted" : loaderData.pageMode;
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
    if (!loaderData.form || pageMode !== "form") {
      return;
    }

    try {
      setSubmitting(true);
      setNotice(null);
      const group1Value = typeof formValues.group_1 === "string" ? formValues.group_1.trim() : "";
      const group2Value = typeof formValues.group_2 === "string" ? formValues.group_2.trim() : "";
      if (group1Value !== "" && group1Value === group2Value) {
        setNotice({
          type: "error",
          message: "意向组别(1) 与意向组别(2) 不能重复。",
        });
        return;
      }

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
    <div className="space-y-8">
      <section className="motion-fade-up motion-surface rounded-xl border border-gray-800 bg-gray-900/70 px-6 py-6">
        <p className="text-sm uppercase tracking-[0.24em] text-primary-300">报名入口</p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">纳新报名</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-300">
              当前账号 {currentUser.email} 可在这里完成纳新报名、查看审核状态，或确认当前是否开放报名。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/dashboard/users"
              className="motion-button rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
            >
              返回用户主页
            </Link>
            <Link
              to="/"
              className="motion-button rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
            >
              返回官网
            </Link>
          </div>
        </div>
      </section>

      {pageMode === "submitted" && submittedSummary ? (
        <SubmittedStateCard summary={submittedSummary} />
      ) : pageMode === "unavailable" ? (
        <UnavailableStateCard
          reason={loaderData.unavailableReason ?? "当前暂无可访问的报名表。"}
        />
      ) : loaderData.form ? (
        <section className="motion-fade-up overflow-hidden rounded-xl border border-gray-800 bg-gray-900/70" style={{ animationDelay: "100ms" }}>
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
                  当前报名
                </p>
                <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                  {loaderData.form.title}
                </h2>
              </div>
            </div>
          )}

          <div className="grid gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8 lg:py-8">
            <section>
              {!loaderData.form.coverImageUrl ? null : (
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-primary-300">
                    当前报名
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-white">
                    {loaderData.form.title}
                  </h2>
                </div>
              )}

              <p className="mt-4 max-w-3xl text-base leading-7 text-gray-300">
                {loaderData.form.description?.trim() || "请按要求填写纳新报名信息。"}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <InfoBadge label="开放时间" value={scheduleText} />
                <InfoBadge label="审核流程" value="提交后进入待审核" />
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
                {loaderData.form.fieldsSchema.map((field, index) => (
                  <div
                    key={field.key}
                    className="motion-fade-up space-y-2"
                    style={{ animationDelay: `${120 + index * 45}ms` }}
                  >
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
                    className={`motion-fade-up rounded-lg border px-4 py-3 text-sm ${
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
                  disabled={submitting}
                  className="motion-button rounded-lg bg-primary-500 px-5 py-3 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "提交中..." : "提交报名"}
                </button>
              </form>
            </section>

            <aside className="motion-fade-up motion-surface self-start rounded-xl border border-gray-800 bg-gray-950/60 p-5" style={{ animationDelay: "180ms" }}>
              <h3 className="text-lg font-semibold text-white">填写提醒</h3>
              <div className="mt-5 space-y-4 text-sm leading-6 text-gray-300">
                <p>系统字段“姓名 / 手机号 / 邮箱 / 意向组别(1) / 意向组别(2)”为必填项。</p>
                <p>文件与图片类字段会跟随本次报名一起上传，并通过后台受保护接口访问。</p>
                <p>提交成功后，本页会直接切换为报名结果页，展示当前进度与提交时间。</p>
              </div>
            </aside>
          </div>
        </section>
      ) : (
        <UnavailableStateCard reason="当前暂无可访问的报名表。" />
      )}
    </div>
  );
}

function SubmittedStateCard({
  summary,
}: {
  summary: RecruitmentPageRegistrationSummary;
}) {
  const status = registrationStatusMeta[summary.status] ?? registrationStatusMeta[0];

  return (
    <section className="motion-fade-up motion-surface rounded-xl border border-emerald-500/20 bg-gray-900/80 p-8 sm:p-10">
      <p className="text-sm uppercase tracking-[0.24em] text-emerald-300">已提交</p>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">你已完成报名</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">
            {summary.formTitle} 已提交成功。当前页面会持续展示你的审核进度与最新结果。
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium ${status.badgeClassName}`}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <InfoBadge label="当前进度" value={status.hint} />
        <InfoBadge label="提交时间" value={formatDateTime(summary.submittedAt)} />
      </div>
    </section>
  );
}

function UnavailableStateCard({ reason }: { reason: string }) {
  return (
    <section className="motion-fade-up motion-surface rounded-xl border border-gray-800 bg-gray-900/80 p-8 sm:p-10">
      <p className="text-sm uppercase tracking-[0.24em] text-primary-300">暂未开放</p>
      <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">当前暂不可报名</h2>
      <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">{reason}</p>
    </section>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="motion-surface rounded-lg border border-gray-800 bg-gray-950/60 px-4 py-3">
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
    "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 transition-[border-color,box-shadow,background-color] duration-200 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20";

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
    if (field.type === "select" || field.type === "user_group_select") {
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
              className="motion-button inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
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
              className="motion-button inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
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
