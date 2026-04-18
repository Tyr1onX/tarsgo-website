import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { redirect, useOutletContext } from "react-router";
import { Icon, type IconifyIcon } from "@iconify/react";
import alertTriangle from "@iconify-icons/lucide/alert-triangle";
import x from "@iconify-icons/lucide/x";
import calendarIcon from "@iconify-icons/lucide/calendar-days";
import clockIcon from "@iconify-icons/lucide/clock";
import usersIcon from "@iconify-icons/lucide/users";
import shieldCheckIcon from "@iconify-icons/lucide/shield-check";
import badgeCheckIcon from "@iconify-icons/lucide/badge-check";
import infoIcon from "@iconify-icons/lucide/info";
import uploadCloudIcon from "@iconify-icons/lucide/upload-cloud";
import sparklesIcon from "@iconify-icons/lucide/sparkles";
import fileTextIcon from "@iconify-icons/lucide/file-text";
import clipboardListIcon from "@iconify-icons/lucide/clipboard-list";
import circleSlashIcon from "@iconify-icons/lucide/circle-slash-2";
import arrowRightIcon from "@iconify-icons/lucide/arrow-right";
import loaderIcon from "@iconify-icons/lucide/loader-2";
import checkIcon from "@iconify-icons/lucide/check";
import paperclipIcon from "@iconify-icons/lucide/paperclip";

import type { Route } from "./+types/registrations";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import type { ApiEnvelope } from "~/lib/api-client";
import { ApiError, buildApiUrl } from "~/lib/api-client";
import { Notify } from "~/components/notify";
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
  cancelRecruitmentRegistration,
} from "~/lib/registrations-client";

const FLASH_DURATION_MS = 3000;
const NOTIFY_ANIMATION_MS = 300;
const MODAL_ANIMATION_MS = 220;

type FlashState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type StatusMeta = {
  label: string;
  hint: string;
  tone: "pending" | "approved" | "rejected" | "cancelled";
  badgeClassName: string;
  dotClassName: string;
  ringClassName: string;
};

const registrationStatusMeta: Record<number, StatusMeta> = {
  0: {
    label: "待审核",
    hint: "报名资料已提交，正在等待管理员处理",
    tone: "pending",
    badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    dotClassName: "bg-amber-400",
    ringClassName: "ring-amber-500/20",
  },
  1: {
    label: "已通过",
    hint: "报名审核已通过，请留意后续通知",
    tone: "approved",
    badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    dotClassName: "bg-emerald-400",
    ringClassName: "ring-emerald-500/20",
  },
  2: {
    label: "未通过",
    hint: "本次报名未通过审核，可关注后续开放时间",
    tone: "rejected",
    badgeClassName: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    dotClassName: "bg-rose-400",
    ringClassName: "ring-rose-500/20",
  },
  3: {
    label: "已取消",
    hint: "当前报名记录已被取消",
    tone: "cancelled",
    badgeClassName: "border-slate-500/30 bg-slate-500/10 text-slate-200",
    dotClassName: "bg-slate-400",
    ringClassName: "ring-slate-500/20",
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
  const [pageData, setPageData] = useState<RecruitmentPageData>(loaderData);
  const initialFormValues = useMemo(
    () =>
      buildInitialValues(
        pageData.form?.fieldsSchema ?? [],
        pageData.registrationFormData ?? {},
      ),
    [pageData.form, pageData.registrationFormData, pageData.registrationSummary?.id, pageData.registrationSummary?.updatedAt],
  );
  const [formValues, setFormValues] = useState<Record<string, unknown>>(initialFormValues);
  const [flash, setFlash] = useState<FlashState>(null);
  const [flashVisible, setFlashVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmCancelClosing, setConfirmCancelClosing] = useState(false);

  useEffect(() => {
    setPageData(loaderData);
  }, [loaderData]);

  useEffect(() => {
    setFormValues(initialFormValues);
    setSubmitting(false);
    setCancelling(false);
  }, [initialFormValues]);

  useEffect(() => {
    if (!flash) {
      return;
    }
    setFlashVisible(true);
  }, [flash]);

  useEffect(() => {
    if (!flash || !flashVisible) {
      return;
    }
    const timer = window.setTimeout(() => {
      setFlashVisible(false);
    }, FLASH_DURATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [flash, flashVisible]);

  useEffect(() => {
    if (!flash || flashVisible) {
      return;
    }
    const timer = window.setTimeout(() => {
      setFlash(null);
    }, NOTIFY_ANIMATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [flash, flashVisible]);

  function clearFlash() {
    setFlashVisible(false);
  }

  const submittedSummary = pageData.registrationSummary ?? null;
  const canCancelSubmitted = Boolean(submittedSummary?.canCancel && pageData.form);
  const pageMode = pageData.pageMode;
  const scheduleText = useMemo(() => {
    if (!pageData.form) {
      return "";
    }

    const start = formatDateTime(pageData.form.startTime);
    const end = formatDateTime(pageData.form.endTime);

    if (start && end) {
      return `${start} — ${end}`;
    }
    if (start) {
      return `${start} 起开放`;
    }
    if (end) {
      return `${end} 截止`;
    }
    return "发布后立即开放";
  }, [pageData.form]);

  function updateFieldValue(key: string, value: unknown) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = pageData.form;
    if (!targetForm || pageMode !== "form") {
      return;
    }

    try {
      setSubmitting(true);
      setFlash(null);
      setFlashVisible(false);
      const group1Value = typeof formValues.group_1 === "string" ? formValues.group_1.trim() : "";
      const group2Value = typeof formValues.group_2 === "string" ? formValues.group_2.trim() : "";
      if (group1Value !== "" && group1Value === group2Value) {
        setFlash({
          type: "error",
          message: "意向组别(1) 与意向组别(2) 不能重复。",
        });
        return;
      }

      const payload = buildRegistrationSubmitPayload(
        targetForm.id,
        targetForm.fieldsSchema,
        formValues,
      );
      const result = await submitRecruitmentRegistration(payload);
      setPageData((current) => ({
        ...current,
        pageMode: "submitted",
        registrationSummary: {
          id: result.id,
          formId: result.formId,
          formTitle: current.form?.title ?? submittedSummary?.formTitle ?? "当前报名",
          status: result.status,
          canEdit: true,
          canCancel: true,
          submittedAt: result.submittedAt,
          updatedAt: result.updatedAt,
        },
      }));
      setFlash({
        type: "success",
        message: "报名提交成功，当前状态为待审核。",
      });
    } catch (error) {
      setFlash({
        type: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  }

  function requestCancelRegistration() {
    if (!submittedSummary || !canCancelSubmitted || cancelling) {
      return;
    }
    setConfirmCancelClosing(false);
    setConfirmCancelOpen(true);
  }

  function closeCancelConfirm() {
    if (!confirmCancelOpen || confirmCancelClosing || cancelling) {
      return;
    }
    setConfirmCancelClosing(true);
    window.setTimeout(() => {
      setConfirmCancelOpen(false);
      setConfirmCancelClosing(false);
    }, MODAL_ANIMATION_MS);
  }

  async function confirmCancelRegistration() {
    if (!submittedSummary || !canCancelSubmitted || cancelling) {
      return;
    }

    try {
      setCancelling(true);
      setFlash(null);
      setFlashVisible(false);
      const cachedForm = pageData.form;
      const cachedFormData = pageData.registrationFormData ?? {};
      await cancelRecruitmentRegistration(submittedSummary.id);
      if (!cachedForm) {
        throw new Error("missing cached form after cancel");
      }
      setPageData({
        pageMode: "form",
        form: cachedForm,
        registrationSummary: null,
        registrationFormData: cachedFormData,
        unavailableReason: null,
      });
      setFormValues(buildInitialValues(cachedForm.fieldsSchema, cachedFormData));
      setConfirmCancelClosing(true);
      window.setTimeout(() => {
        setConfirmCancelOpen(false);
        setConfirmCancelClosing(false);
      }, MODAL_ANIMATION_MS);
      setFlash({
        type: "success",
        message: "报名已取消，原填写内容已保留在表单中，可直接重新提交。",
      });
    } catch (error) {
      setFlash({
        type: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setCancelling(false);
    }
  }

  const headerChip: { tone: "form" | "submitted" | "unavailable"; label: string } = {
    tone: pageMode,
    label:
      pageMode === "submitted"
        ? "已提交"
        : pageMode === "unavailable"
          ? "暂未开放"
          : "接受报名中",
  };

  return (
    <div className="space-y-6 pb-8 sm:space-y-10 sm:pb-12">
      <PageHero
        chipTone={headerChip.tone}
        chipLabel={headerChip.label}
      />

      {pageMode === "submitted" && submittedSummary ? (
        <SubmittedStateCard
          summary={submittedSummary}
          canCancel={canCancelSubmitted}
          cancelling={cancelling}
          onCancel={requestCancelRegistration}
        />
      ) : pageMode === "unavailable" ? (
        <UnavailableStateCard
          reason={pageData.unavailableReason ?? "当前暂无可访问的报名表。"}
        />
      ) : pageData.form ? (
        <FormStateView
          form={pageData.form}
          scheduleText={scheduleText}
          formValues={formValues}
          registrationFormData={pageData.registrationFormData ?? null}
          onFieldChange={updateFieldValue}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      ) : (
        <UnavailableStateCard reason="当前暂无可访问的报名表。" />
      )}

      {confirmCancelOpen && submittedSummary ? (
        <CancelConfirmModal
          formTitle={submittedSummary.formTitle}
          cancelling={cancelling}
          closing={confirmCancelClosing}
          onClose={closeCancelConfirm}
          onConfirm={() => void confirmCancelRegistration()}
        />
      ) : null}

      {flash ? (
        <Notify
          tone={flash.type}
          title={flash.type === "success" ? "操作成功" : "操作失败"}
          message={flash.message}
          open={flashVisible}
          onClose={clearFlash}
          placement="bottom-right"
        />
      ) : null}
    </div>
  );
}

function PageHero({
  chipTone,
  chipLabel,
}: {
  chipTone: "form" | "submitted" | "unavailable";
  chipLabel: string;
}) {
  const chipStyle =
    chipTone === "submitted"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : chipTone === "unavailable"
        ? "border-slate-500/30 bg-slate-500/10 text-slate-200"
        : "border-primary-500/30 bg-primary-500/10 text-primary-200";
  const chipDot =
    chipTone === "submitted"
      ? "bg-emerald-400"
      : chipTone === "unavailable"
        ? "bg-slate-400"
        : "bg-primary-400";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
      <div
        aria-hidden
        className="bg-registrations-hero-glow pointer-events-none absolute inset-0 opacity-80"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary-500/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 px-5 py-5 sm:gap-6 sm:px-8 sm:py-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary-500/20 bg-primary-500/10 text-primary-200 ring-1 ring-inset ring-primary-500/10 sm:flex">
            <Icon icon={sparklesIcon} className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-primary-300 sm:text-[11px] sm:tracking-[0.28em]">
              <span>Recruitment</span>
              <span className="h-1 w-1 rounded-full bg-primary-500/70" />
              <span>报名入口</span>
            </div>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-fg-primary sm:mt-3 sm:text-[2.125rem]">
              纳新报名
            </h1>
          </div>
        </div>
        <div
          className={`inline-flex w-fit items-center gap-2 self-start rounded-full border px-3 py-1 text-xs font-medium sm:px-3.5 sm:py-1.5 ${chipStyle}`}
        >
          <span className={`relative flex h-1.5 w-1.5`}>
            <span
              className={`absolute inset-0 animate-ping rounded-full opacity-75 ${chipDot}`}
            />
            <span className={`relative h-1.5 w-1.5 rounded-full ${chipDot}`} />
          </span>
          {chipLabel}
        </div>
      </div>
    </section>
  );
}

function FormStateView({
  form,
  scheduleText,
  formValues,
  registrationFormData,
  onFieldChange,
  onSubmit,
  submitting,
}: {
  form: NonNullable<RecruitmentPageData["form"]>;
  scheduleText: string;
  formValues: Record<string, unknown>;
  registrationFormData: Record<string, unknown> | null;
  onFieldChange: (key: string, value: unknown) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
}) {
  const totalFields = form.fieldsSchema.length;
  const requiredFields = form.fieldsSchema.filter((f) => f.required).length;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <FormCoverCard form={form} />

        <form
          className="rounded-2xl border border-border-subtle bg-surface-card"
          onSubmit={onSubmit}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-dark text-primary-300">
                <Icon icon={clipboardListIcon} className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-fg-primary">报名信息</h3>
                <p className="text-xs text-fg-dim">
                  共 {totalFields} 项 · 其中 {requiredFields} 项必填
                </p>
              </div>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-border-subtle bg-surface-dark px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-fg-muted sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
              Filling
            </span>
          </div>

          {registrationFormData ? (
            <div className="mx-6 mt-5 flex items-start gap-3 rounded-xl border border-primary-500/20 bg-primary-500/[0.07] px-4 py-3 text-sm leading-6 text-primary-100">
              <Icon
                icon={infoIcon}
                className="mt-0.5 h-4 w-4 shrink-0 text-primary-300"
              />
              <span>
                你刚刚取消了上一条未审核报名记录，原填写内容已回填到表单中，可直接重新提交。
              </span>
            </div>
          ) : null}

          <div className="space-y-6 px-6 py-6">
            {form.fieldsSchema.map((field, index) => (
              <FieldRow
                key={field.key}
                index={index + 1}
                field={field}
                value={formValues[field.key]}
                existingUpload={registrationFormData?.[field.key]}
                onChange={onFieldChange}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-border-subtle bg-surface-dark/40 px-6 py-4">
            <p className="flex items-center gap-2 text-xs text-fg-dim">
              <Icon icon={shieldCheckIcon} className="h-3.5 w-3.5" />
              提交后进入待审核状态，可在结果页查看进度
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="group inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition-all hover:bg-primary-600 hover:shadow-primary-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Icon
                    icon={loaderIcon}
                    className="h-4 w-4 animate-spin"
                  />
                  提交中...
                </>
              ) : (
                <>
                  提交报名
                  <Icon
                    icon={arrowRightIcon}
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <SidebarCard
          icon={calendarIcon}
          label="开放时间"
          accent="primary"
        >
          <p className="text-sm font-medium leading-6 text-fg-primary">
            {scheduleText || "发布后立即开放"}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-fg-dim">
            <Icon icon={clockIcon} className="h-3.5 w-3.5" />
            以系统时间为准
          </div>
        </SidebarCard>

        <SidebarCard
          icon={usersIcon}
          label="人数上限"
          accent="indigo"
        >
          <p className="text-sm font-medium text-fg-primary">
            {form.maxRegistrations ? (
              <>
                <span className="text-lg text-fg-primary">
                  {form.maxRegistrations}
                </span>
                <span className="ml-1 text-fg-muted">人</span>
              </>
            ) : (
              "不限人数"
            )}
          </p>
          <p className="mt-1 text-xs text-fg-dim">达到上限后将停止接收新报名</p>
        </SidebarCard>

        <div className="rounded-2xl border border-border-subtle bg-surface-card p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle bg-surface-dark text-accent-gold">
              <Icon icon={infoIcon} className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-fg-primary">填写提醒</h3>
          </div>
          <ul className="mt-4 space-y-3 text-xs leading-6 text-fg-muted">{[
            "系统字段「姓名 / 手机号 / 邮箱 / 意向组别(1) / 意向组别(2)」为必填项。",
            "文件与图片字段会随本次报名一起上传，通过后台受保护接口访问。",
            "提交成功后页面切换为结果页，展示审核进度与提交时间。",
            "取消未审核报名后，未重新上传的文件沿用上一版内容。",
          ].map((text) => (
            <TipItem key={text}>{text}</TipItem>
          ))}</ul>
        </div>
      </aside>
    </section>
  );
}

function FormCoverCard({
  form,
}: {
  form: NonNullable<RecruitmentPageData["form"]>;
}) {
  if (form.coverImageUrl) {
    return (
      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
        <div className="relative">
          <img
            src={form.coverImageUrl}
            alt={form.title}
            className="h-48 w-full object-cover sm:h-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-card via-surface-card/40 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary-200 sm:text-[11px] sm:tracking-[0.28em]">
              当前报名
            </p>
            <h2 className="mt-1.5 text-xl font-semibold text-white sm:mt-2 sm:text-3xl">
              {form.title}
            </h2>
          </div>
        </div>
        <div className="border-t border-border-subtle px-5 py-4 sm:px-6 sm:py-5">
          <p className="text-sm leading-6 text-fg-muted sm:leading-7">
            {form.description?.trim() || "请按要求填写纳新报名信息。"}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
      <div
        aria-hidden
        className="bg-registrations-cover-glow pointer-events-none absolute inset-0"
      />
      <div className="relative px-5 py-5 sm:px-7 sm:py-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary-300 sm:text-[11px] sm:tracking-[0.28em]">
          当前报名
        </p>
        <h2 className="mt-1.5 text-xl font-semibold text-fg-primary sm:mt-2 sm:text-3xl">
          {form.title}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-muted sm:mt-4 sm:leading-7">
          {form.description?.trim() || "请按要求填写纳新报名信息。"}
        </p>
      </div>
    </section>
  );
}

function SidebarCard({
  icon,
  label,
  children,
  accent,
}: {
  icon: IconifyIcon;
  label: string;
  children: ReactNode;
  accent: "primary" | "indigo" | "emerald" | "gold";
}) {
  const accentMap = {
    primary: "border-primary-500/20 bg-primary-500/10 text-primary-200",
    indigo: "border-indigo-500/20 bg-indigo-500/10 text-indigo-200",
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    gold: "border-amber-500/20 bg-amber-500/10 text-amber-200",
  } as const;

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card p-5">
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${accentMap[accent]}`}
        >
          <Icon icon={icon} className="h-4 w-4" />
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-dim">
          {label}
        </p>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function TipItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary-400" />
      <span>{children}</span>
    </li>
  );
}

function FieldRow({
  index,
  field,
  value,
  existingUpload,
  onChange,
}: {
  index: number;
  field: RegistrationFormField;
  value: unknown;
  existingUpload: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const fieldId = `field-${field.key}`;
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-surface-dark text-[11px] font-mono text-fg-dim ring-1 ring-inset ring-border-subtle">
          {index}
        </span>
        <label
          htmlFor={fieldId}
          className="text-sm font-medium text-fg-primary"
        >
          {field.label}
        </label>
        {field.required ? (
          <span className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-200">
            必填
          </span>
        ) : (
          <span className="text-[11px] text-fg-dim">选填</span>
        )}
      </div>
      {field.description ? (
        <p className="text-xs leading-5 text-fg-dim">{field.description}</p>
      ) : null}
      {isFileField(field.type) ? (
        <ExistingUploadState field={field} value={existingUpload} />
      ) : null}
      {renderFieldControl(fieldId, field, value, onChange)}
    </div>
  );
}

function CancelConfirmModal({
  formTitle,
  cancelling,
  closing,
  onClose,
  onConfirm,
}: {
  formTitle: string;
  cancelling: boolean;
  closing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !cancelling) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [cancelling, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  const visible = mounted && !closing;
  const overlayClass = visible
    ? "bg-black/70 backdrop-blur-md"
    : "bg-black/0 backdrop-blur-0";
  const panelClass = visible
    ? "translate-y-0 scale-100 opacity-100 blur-0"
    : "translate-y-3 scale-95 opacity-0 blur-sm";

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-[background-color,backdrop-filter] duration-[220ms] ease-out ${overlayClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-registration-title"
      onClick={() => {
        if (!cancelling) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full max-w-md transform-gpu overflow-hidden rounded-2xl border border-rose-500/20 bg-surface-card shadow-2xl shadow-black/50 ring-1 ring-white/5 transition-[opacity,transform,filter] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${panelClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden
          className="bg-registrations-modal-glow pointer-events-none absolute inset-0"
        />
        <div className="relative flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/20">
              <Icon icon={alertTriangle} className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="cancel-registration-title"
                className="text-base font-semibold text-fg-primary"
              >
                确认取消报名
              </h2>
              <p className="mt-0.5 text-xs text-fg-dim">此操作可随时重新提交</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={cancelling}
            title="关闭"
            aria-label="关闭"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-dim transition hover:bg-white/5 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon icon={x} className="h-4 w-4" />
          </button>
        </div>

        <div className="relative space-y-4 px-6 py-5">
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3.5 text-sm leading-6 text-rose-100/90">
            即将取消
            <span className="mx-1 font-semibold text-fg-primary">{formTitle}</span>
            的报名记录。取消后该条记录不再进入审核流程，已填写的内容将回填到表单中，你可以重新编辑并再次提交。
          </div>
          <ul className="space-y-2 text-xs leading-6 text-fg-muted">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400/70" />
              审核进入中或已完成的报名无法取消
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400/70" />
              未重新上传的文件将继续沿用上一版内容
            </li>
          </ul>
        </div>

        <div className="relative flex items-center justify-end gap-3 border-t border-border-subtle bg-surface-dark/40 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={cancelling}
            className="cursor-pointer rounded-lg border border-border-subtle bg-surface-dark px-4 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-white/5 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            保留报名
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={cancelling}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelling ? (
              <>
                <Icon icon={loaderIcon} className="h-4 w-4 animate-spin" />
                取消中...
              </>
            ) : (
              "确认取消报名"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SubmittedStateCard({
  summary,
  canCancel,
  cancelling,
  onCancel,
}: {
  summary: RecruitmentPageRegistrationSummary;
  canCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const status = registrationStatusMeta[summary.status] ?? registrationStatusMeta[0];
  const statusGlowClass =
    status.tone === "approved"
      ? "bg-registrations-status-approved"
      : status.tone === "rejected"
        ? "bg-registrations-status-rejected"
        : status.tone === "cancelled"
          ? "bg-registrations-status-cancelled"
          : "bg-registrations-status-pending";

  return (
    <section className="space-y-6">
      <div
        className={`relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card ring-1 ring-inset ${status.ringClassName}`}
      >
        <div
          aria-hidden
          className={`${statusGlowClass} pointer-events-none absolute inset-0`}
        />
        <div className="relative flex flex-col gap-4 px-5 py-5 sm:gap-6 sm:px-8 sm:py-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-200 sm:h-12 sm:w-12">
              <Icon icon={badgeCheckIcon} className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-300 sm:text-[11px] sm:tracking-[0.24em]">
                <span>Submitted</span>
                <span className="h-1 w-1 rounded-full bg-emerald-400/70" />
                <span>已提交</span>
              </div>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-fg-primary sm:mt-2 sm:text-3xl">
                你已完成报名
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-fg-muted sm:mt-2">
                <span className="text-fg-primary">{summary.formTitle}</span>{" "}
                已提交成功，当前页面会持续展示你的审核进度与最新结果。
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-xs font-medium sm:py-1.5 sm:text-sm ${status.badgeClassName}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />
            {status.label}
          </span>
        </div>

        <div className="relative grid grid-cols-2 gap-3 border-t border-border-subtle bg-surface-dark/30 px-5 py-4 sm:px-8 sm:py-5 lg:grid-cols-4">
          <StatTile
            icon={clipboardListIcon}
            label="当前进度"
            value={status.hint}
          />
          <StatTile
            icon={calendarIcon}
            label="提交时间"
            value={formatDateTime(summary.submittedAt) || "—"}
          />
          <StatTile
            icon={clockIcon}
            label="最近更新"
            value={formatDateTime(summary.updatedAt) || "—"}
          />
          <StatTile
            icon={shieldCheckIcon}
            label="当前可操作"
            value={
              canCancel
                ? "审核开始前可取消报名并重新提交"
                : "已进入审核，当前不可修改"
            }
          />
        </div>

        {canCancel ? (
          <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-6 py-4 sm:px-8">
            <p className="flex items-center gap-2 text-xs text-fg-dim">
              <Icon icon={infoIcon} className="h-3.5 w-3.5" />
              如需修改内容，请先取消当前报名，再重新编辑提交
            </p>
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelling ? (
                <>
                  <Icon icon={loaderIcon} className="h-4 w-4 animate-spin" />
                  取消中...
                </>
              ) : (
                <>
                  <Icon icon={x} className="h-4 w-4" />
                  取消报名
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: IconifyIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-card/80 p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-fg-dim">
        <Icon icon={icon} className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-sm font-medium leading-6 text-fg-primary">
        {value}
      </div>
    </div>
  );
}

function UnavailableStateCard({ reason }: { reason: string }) {
  const isQuotaReached = reason.includes("报名人数已满");

  if (isQuotaReached) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-surface-card px-6 py-14 sm:px-10 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-200">
            <span
              aria-hidden
              className="absolute inset-0 rounded-2xl bg-amber-500/10 blur-xl"
            />
            <Icon icon={circleSlashIcon} className="relative h-9 w-9" />
          </div>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.28em] text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
            Capacity Full
          </div>

          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-fg-primary sm:text-[2.4rem]">
            本轮报名名额已满
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-fg-muted sm:text-base">
            报名已结束
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card px-6 py-12 text-center sm:px-10 sm:py-14">
      <div
        aria-hidden
        className="bg-registrations-empty-glow pointer-events-none absolute inset-0 opacity-60"
      />
      <div className="relative mx-auto flex max-w-xl flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border-subtle bg-surface-dark text-fg-muted">
          <Icon icon={circleSlashIcon} className="h-7 w-7" />
        </div>
        <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.28em] text-fg-dim">
          Unavailable · 暂未开放
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-fg-primary sm:text-3xl">
          当前暂不可报名
        </h2>
        <p className="mt-3 text-sm leading-7 text-fg-muted">{reason}</p>
        <div className="mt-6 flex items-center gap-2 rounded-full border border-border-subtle bg-surface-dark px-3.5 py-1.5 text-xs text-fg-muted">
          <Icon icon={clockIcon} className="h-3.5 w-3.5" />
          请留意站内通知，开放后将在此处更新
        </div>
      </div>
    </section>
  );
}

function ExistingUploadState({
  field,
  value,
}: {
  field: RegistrationFormField;
  value: unknown;
}) {
  const files = normalizeExistingUploadEntries(value);
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-dark/60 px-4 py-3 text-sm text-fg-muted">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-fg-dim">
        <Icon icon={paperclipIcon} className="h-3.5 w-3.5" />
        当前已上传
      </div>
      <div className="mt-2.5 space-y-1.5">
        {files.map((file, index) => (
          <div
            key={`${field.key}-${file.fileName}-${index}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-card px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Icon icon={fileTextIcon} className="h-4 w-4 shrink-0 text-primary-300" />
              <span className="truncate text-fg-primary">{file.fileName}</span>
            </div>
            <span className="shrink-0 text-xs text-fg-dim">
              {formatFileSize(file.fileSize)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-fg-dim">
        如需替换该字段，请重新上传；未重新上传则保留当前文件。
      </p>
    </div>
  );
}

function renderFieldControl(
  fieldId: string,
  field: RegistrationFormField,
  value: unknown,
  onChange: (key: string, value: unknown) => void,
) {
  const commonClassName =
    "w-full rounded-lg border border-border-subtle bg-surface-dark px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim transition-colors focus:border-primary-500 focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-primary-500/20";

  if (field.type === "textarea") {
    return (
      <textarea
        id={fieldId}
        rows={4}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(field.key, event.target.value)}
        placeholder={field.placeholder}
        className={`${commonClassName} resize-y leading-6`}
      />
    );
  }

  if (isOptionField(field.type)) {
    if (field.type === "select" || field.type === "user_group_select") {
      return (
        <select
          id={fieldId}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={`${commonClassName} cursor-pointer`}
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
        <div className="flex flex-wrap gap-2">
          {field.options?.map((option) => {
            const checked = value === option.value;
            return (
              <label
                key={option.value}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-colors ${
                  checked
                    ? "border-primary-500/50 bg-primary-500/10 text-primary-100"
                    : "border-border-subtle bg-surface-dark text-fg-muted hover:border-border-subtle/80 hover:bg-surface-card hover:text-fg-primary"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    checked
                      ? "border-primary-400 bg-primary-500"
                      : "border-fg-dim bg-surface-card"
                  }`}
                >
                  {checked ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  ) : null}
                </span>
                <input
                  type="radio"
                  name={field.key}
                  checked={checked}
                  onChange={() => onChange(field.key, option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      );
    }

    const selectedValues = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];

    return (
      <div className="flex flex-wrap gap-2">
        {field.options?.map((option) => {
          const checked = selectedValues.includes(option.value);
          return (
            <label
              key={option.value}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-colors ${
                checked
                  ? "border-primary-500/50 bg-primary-500/10 text-primary-100"
                  : "border-border-subtle bg-surface-dark text-fg-muted hover:border-border-subtle/80 hover:bg-surface-card hover:text-fg-primary"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  checked
                    ? "border-primary-400 bg-primary-500 text-white"
                    : "border-fg-dim bg-surface-card"
                }`}
              >
                {checked ? <Icon icon={checkIcon} className="h-3 w-3" /> : null}
              </span>
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
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    );
  }

  if (isFileField(field.type)) {
    const isImage = field.type === "image";
    return (
      <label
        htmlFor={fieldId}
        className="group flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border-subtle bg-surface-dark px-4 py-3 text-sm text-fg-muted transition-colors hover:border-primary-500/40 hover:bg-surface-card hover:text-fg-primary"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-card text-primary-300 transition-colors group-hover:border-primary-500/30 group-hover:bg-primary-500/10">
          <Icon icon={uploadCloudIcon} className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg-primary">
            {isImage ? "选择图片（可多选）" : "选择文件"}
          </p>
          <p className="mt-0.5 truncate text-xs text-fg-dim">
            点击此区域选择{isImage ? "一张或多张图片" : "一个文件"}进行上传
          </p>
        </div>
        <input
          id={fieldId}
          type="file"
          multiple={isImage}
          className="sr-only"
          onChange={(event) => onChange(field.key, event.target.files)}
        />
      </label>
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
      id={fieldId}
      type={inputType}
      value={typeof value === "string" || typeof value === "number" ? value : ""}
      onChange={(event) => onChange(field.key, event.target.value)}
      placeholder={field.placeholder}
      className={commonClassName}
    />
  );
}

function buildInitialValues(
  fields: RegistrationFormField[],
  existingFormData: Record<string, unknown>,
) {
  return fields.reduce<Record<string, unknown>>((accumulator, field) => {
    const existingValue = existingFormData[field.key];
    if (field.type === "checkbox") {
      accumulator[field.key] = Array.isArray(existingValue)
        ? existingValue.filter((item): item is string => typeof item === "string")
        : [];
      return accumulator;
    }
    if (isFileField(field.type)) {
      accumulator[field.key] = null;
      return accumulator;
    }
    if (typeof existingValue === "string" || typeof existingValue === "number") {
      accumulator[field.key] = existingValue;
      return accumulator;
    }
    accumulator[field.key] = typeof field.default_value === "string" || typeof field.default_value === "number"
      ? field.default_value
      : "";
    return accumulator;
  }, {});
}

function normalizeExistingUploadEntries(value: unknown) {
  if (!value) {
    return [];
  }

  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const fileName = typeof (item as { file_name?: unknown }).file_name === "string"
      ? (item as { file_name: string }).file_name
      : "";
    const fileSize = typeof (item as { file_size?: unknown }).file_size === "number"
      ? (item as { file_size: number }).file_size
      : 0;
    if (!fileName) {
      return [];
    }
    return [{ fileName, fileSize }];
  });
}

function formatFileSize(bytes: number) {
  if (!bytes || bytes <= 0) {
    return "未知大小";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
