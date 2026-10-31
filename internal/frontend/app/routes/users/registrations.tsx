import "./registrations.css";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { redirect, useOutletContext, useRevalidator } from "react-router";
import { Icon, type IconifyIcon } from "@iconify/react";
import alertTriangle from "@iconify-icons/lucide/alert-triangle";
import x from "@iconify-icons/lucide/x";
import calendarIcon from "@iconify-icons/lucide/calendar-days";
import clockIcon from "@iconify-icons/lucide/clock";
import usersIcon from "@iconify-icons/lucide/users";
import shieldCheckIcon from "@iconify-icons/lucide/shield-check";
import infoIcon from "@iconify-icons/lucide/info";
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
import { useModalAccessibility } from "~/components/modal-shell";
import { FileUploadField, type FileUploadStatus } from "~/components/file-upload-field";
import {
  isFileField,
  isOptionField,
} from "~/lib/registration-form-schema";
import type {
  RecruitmentPageData,
  RecruitmentRegistrationGroupRef,
  RecruitmentPageRegistrationSummary,
  RegistrationFormField,
} from "~/lib/registration-forms-client";
import { getRecruitmentProgress } from "~/lib/recruitment-progress";
import {
  submitRecruitmentRegistration,
  cancelRecruitmentRegistration,
  getRecruitmentInterviewAttendance,
  updateRecruitmentInterviewAttendance,
  type InterviewAttendanceResult,
  type InterviewSession,
} from "~/lib/registrations-client";

const FLASH_DURATION_MS = 3000;
const NOTIFY_ANIMATION_MS = 300;
const MODAL_ANIMATION_MS = 220;

type FlashState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type StatusMeta = {
  badgeClassName: string;
};

const registrationStatusMeta: Record<RecruitmentPageRegistrationSummary["status"], StatusMeta> = {
  pending_screening: { badgeClassName: "admin-status--screening" },
  pending_interview: { badgeClassName: "admin-status--interview" },
  admitted: { badgeClassName: "admin-status--admitted" },
  rejected: { badgeClassName: "admin-status--rejected" },
  withdrawn: { badgeClassName: "admin-status--withdrawn" },
};

export function meta() {
  return [
    { title: "我的招新 | TARSGO" },
    { name: "description", content: "查看吉甲大师招新进度并完成后续确认" },
  ];
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const currentUrl = new URL(request.url);
  const redirectTarget = `${currentUrl.pathname}${currentUrl.search}`;

  try {
    return await fetchLoaderApi<RecruitmentPageData>("/api/recruitment/form");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw redirect(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
    }
    throw error;
  }
}

clientLoader.hydrate = true;

export default function UserRegistrations({
  loaderData,
}: Route.ComponentProps) {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const { revalidate } = useRevalidator();
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
  const [fileUploadStatus, setFileUploadStatus] = useState<FileUploadStatus>("pending");
  const [flash, setFlash] = useState<FlashState>(null);
  const [flashVisible, setFlashVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [interviewAttendance, setInterviewAttendance] = useState<InterviewAttendanceResult | null>(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewSaving, setInterviewSaving] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmCancelClosing, setConfirmCancelClosing] = useState(false);

  useEffect(() => {
    setPageData(loaderData);
  }, [loaderData]);

  useEffect(() => {
    if (pageData.pageMode !== "submitted") return;
    const refreshStatus = () => revalidate();
    const timer = window.setInterval(refreshStatus, 30_000);
    window.addEventListener("focus", refreshStatus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshStatus);
    };
  }, [pageData.pageMode, revalidate]);

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

  useEffect(() => {
    if (!submittedSummary || submittedSummary.status !== "pending_interview") {
      setInterviewAttendance(null);
      return;
    }
    let cancelled = false;
    setInterviewLoading(true);
    getRecruitmentInterviewAttendance(submittedSummary.id)
      .then((result) => {
        if (!cancelled) setInterviewAttendance(result);
      })
      .catch((error) => {
        if (!cancelled) setFlash({ type: "error", message: getErrorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setInterviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submittedSummary?.id, submittedSummary?.status]);
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
    if (pageData.form?.fieldsSchema.some((field) => field.key === key && isFileField(field.type))) {
      setFileUploadStatus("pending");
    }
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
    const hasUploadFiles = Object.values(formValues).some((value) => Array.isArray(value) && value.some(isFileValue));

    try {
      setSubmitting(true);
      setFileUploadStatus(hasUploadFiles ? "uploading" : "pending");
      setFlash(null);
      setFlashVisible(false);
      const payload = buildRegistrationSubmitPayload(
        targetForm.id,
        targetForm.fieldsSchema,
        formValues,
      );
      const result = await submitRecruitmentRegistration(payload);
      setFileUploadStatus(hasUploadFiles ? "uploaded" : "pending");
      const preferredGroup = resolveSelectedRecruitmentGroup(targetForm.fieldsSchema, "preferred_group", formValues.preferred_group);
      setPageData((current) => ({
        ...current,
        pageMode: "submitted",
        registrationSummary: {
          id: result.id,
          formId: result.formId,
          formTitle: current.form?.title ?? submittedSummary?.formTitle ?? "当前报名",
          preferredGroup,
          status: result.status,
          canEdit: true,
          canCancel: true,
          submittedAt: result.submittedAt,
          updatedAt: result.updatedAt,
        },
      }));
      setFlash({
        type: "success",
        message: "报名提交成功，当前状态为待初筛。",
      });
    } catch (error) {
      if (hasUploadFiles) setFileUploadStatus("failed");
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

  async function saveInterviewAttendance(attendance: "attending" | "not_attending", interviewSessionId?: number | null) {
    if (!submittedSummary || submittedSummary.status !== "pending_interview") return;
    try {
      setInterviewSaving(true);
      const result = await updateRecruitmentInterviewAttendance(submittedSummary.id, { attendance, interviewSessionId });
      setInterviewAttendance(result);
      setFlash({ type: "success", message: attendance === "attending" ? "面试安排已保存。" : "已记录本次暂不参加面试。" });
    } catch (error) {
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setInterviewSaving(false);
    }
  }

  async function confirmCancelRegistration() {
    if (!submittedSummary || !canCancelSubmitted || cancelling) {
      return;
    }

    try {
      setCancelling(true);
      setFlash(null);
      setFlashVisible(false);
      await cancelRecruitmentRegistration(submittedSummary.id);
      setPageData((current) => ({
        ...current,
        pageMode: "submitted",
        registrationSummary: current.registrationSummary
          ? {
              ...current.registrationSummary,
              status: "withdrawn",
              canEdit: false,
              canCancel: false,
              updatedAt: new Date().toISOString(),
            }
          : current.registrationSummary,
      }));
      setConfirmCancelClosing(true);
      window.setTimeout(() => {
        setConfirmCancelOpen(false);
        setConfirmCancelClosing(false);
      }, MODAL_ANIMATION_MS);
      setFlash({
        type: "success",
        message: "报名已撤回，历史记录已保留。",
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
    <div className="admin-design candidate-recruitment space-y-6 pb-8 sm:space-y-8 sm:pb-10">
      <PageHero
        chipTone={headerChip.tone}
        chipLabel={headerChip.label}
      />

      {pageMode === "submitted" && submittedSummary ? (
        <>
          <SubmittedStateCard
            summary={submittedSummary}
            canCancel={canCancelSubmitted}
            cancelling={cancelling}
            onCancel={requestCancelRegistration}
            interviewAttendance={interviewAttendance}
            interviewLoading={interviewLoading}
          />
          {submittedSummary.status === "pending_interview" ? (
            <InterviewAttendanceCard
              data={interviewAttendance}
              loading={interviewLoading}
              saving={interviewSaving}
              onSave={saveInterviewAttendance}
            />
          ) : null}
          <RecruitmentProgressCard
            summary={submittedSummary}
            interviewAttendance={interviewAttendance}
            interviewLoading={interviewLoading}
          />
        </>
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
          fileUploadStatus={fileUploadStatus}
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
  const chipClassName = chipTone === "unavailable"
    ? "admin-status--withdrawn"
    : "admin-status--screening";
  const description = chipTone === "form"
    ? "填写报名信息，并在这里查看后续审核与面试安排。"
    : chipTone === "submitted"
      ? "查看当前审核进度、下一步安排与最终结果。"
      : "当前没有开放的报名表；开放后会在此处更新。";

  return (
    <section className="candidate-page-header admin-panel">
      <div className="candidate-page-intro-copy">
        <p className="candidate-eyebrow">TARSGO <span aria-hidden="true">/</span> 候选人服务</p>
        <h1 className="candidate-page-title">纳新报名</h1>
        <p className="candidate-page-description">{description}</p>
      </div>
      <span className={`admin-status ${chipClassName}`}>{chipLabel}</span>
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
  fileUploadStatus,
}: {
  form: NonNullable<RecruitmentPageData["form"]>;
  scheduleText: string;
  formValues: Record<string, unknown>;
  registrationFormData: Record<string, unknown> | null;
  onFieldChange: (key: string, value: unknown) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  fileUploadStatus: FileUploadStatus;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const totalFields = form.fieldsSchema.length;
  const requiredFields = form.fieldsSchema.filter((f) => f.required).length;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <FormCoverCard form={form} />

        <form ref={formRef} className="admin-panel candidate-form" onSubmit={onSubmit}>
          <div className="candidate-section-header">
            <div className="flex items-center gap-3">
              <div className="candidate-icon-box h-9 w-9">
                <Icon icon={clipboardListIcon} className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-fg-primary">报名信息</h3>
                <p className="text-xs text-fg-dim">
                  共 {totalFields} 项 · 其中 {requiredFields} 项必填
                </p>
              </div>
            </div>
          </div>

          {registrationFormData ? (
            <div className="admin-notice admin-notice--warning candidate-form-notice mx-5 mt-5 sm:mx-7">
              <Icon
                icon={infoIcon}
                className="mt-0.5 h-4 w-4 shrink-0 text-primary-300"
              />
              <span>
                这是你在待初筛阶段保存的报名内容，可在进入后续流程前继续修改。
              </span>
            </div>
          ) : null}

          <div className="candidate-field-list">
            {form.fieldsSchema.map((field, index) => (
              <FieldRow
                key={field.key}
                index={index + 1}
                field={field}
                value={formValues[field.key]}
                existingUpload={registrationFormData?.[field.key]}
                fileUploadStatus={fileUploadStatus}
                onChange={onFieldChange}
                onRetry={() => formRef.current?.requestSubmit()}
              />
            ))}
          </div>

          <div className="candidate-form-footer">
            <p className="flex items-center gap-2 text-xs text-fg-dim">
              <Icon icon={shieldCheckIcon} className="h-3.5 w-3.5" />
              提交后进入待初筛状态，可在结果页查看进度
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="admin-button admin-button--primary group"
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

      <aside className="candidate-form-aside space-y-4 lg:sticky lg:top-6 lg:self-start">
        <SidebarCard
          icon={calendarIcon}
          label="开放时间"
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

        <div className="admin-panel candidate-reminders">
          <div className="flex items-center gap-2.5">
            <div className="candidate-icon-box h-8 w-8">
              <Icon icon={infoIcon} className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-fg-primary">填写提醒</h3>
          </div>
          <ul className="mt-4 space-y-3 text-xs leading-6 text-fg-muted">{[
            "系统字段「姓名 / 手机号 / 邮箱 / 意向组」为必填项。",
            "文件与图片字段会随本次报名一起上传，通过后台受保护接口访问。",
            "提交成功后页面切换为结果页，展示当前招新阶段与提交时间。",
            "待初筛阶段可以修改或撤回报名；进入面试阶段后不可再修改。",
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
      <section className="admin-panel candidate-cover-card overflow-hidden">
        <div className="relative">
          <img
            src={form.coverImageUrl}
            alt={form.title}
            className="h-48 w-full object-cover sm:h-60"
          />
          <div className="candidate-cover-image-caption absolute bottom-0 left-0 right-0 p-5 sm:p-7">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary-200 sm:text-[11px] sm:tracking-[0.28em]">
              当前报名
            </p>
            <h2 className="mt-1.5 text-xl font-semibold text-white sm:mt-2 sm:text-3xl">
              {form.title}
            </h2>
          </div>
        </div>
        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6 sm:py-5">
          <p className="text-sm leading-6 text-fg-muted sm:leading-7">
            {form.description?.trim() || "请按要求填写纳新报名信息。"}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-panel candidate-cover-card relative overflow-hidden">
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
}: {
  icon: IconifyIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-panel candidate-info-card">
      <div className="flex items-center gap-2.5">
        <div
          className="candidate-icon-box flex h-8 w-8 items-center justify-center rounded-lg"
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
      <span className="candidate-bullet" />
      <span>{children}</span>
    </li>
  );
}

function FieldRow({
  index,
  field,
  value,
  existingUpload,
  fileUploadStatus,
  onChange,
  onRetry,
}: {
  index: number;
  field: RegistrationFormField;
  value: unknown;
  existingUpload: unknown;
  fileUploadStatus: FileUploadStatus;
  onChange: (key: string, value: unknown) => void;
  onRetry: () => void;
}) {
  const fieldId = `field-${field.key}`;
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.03] text-[11px] font-mono text-fg-dim ring-1 ring-inset ring-white/[0.08]">
          {index}
        </span>
        <label
          htmlFor={fieldId}
          className="text-sm font-medium text-fg-primary"
        >
          {field.label}
        </label>
        {field.required ? (
          <span className="candidate-required">
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
      {renderFieldControl(fieldId, field, value, onChange, fileUploadStatus, onRetry)}
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
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useModalAccessibility(mounted && !closing, dialogRef, onClose);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  if (typeof document === "undefined") {
    return null;
  }

  const visible = mounted && !closing;
  const overlayClass = visible ? "bg-black/70" : "bg-black/0";

  return createPortal(
    <div
      ref={dialogRef}
      className={`admin-design candidate-recruitment-modal fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain p-3 sm:p-4 transition-opacity duration-150 ${overlayClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-registration-title"
      aria-describedby="cancel-registration-description"
      tabIndex={-1}
      onClick={() => {
        if (!cancelling) {
          onClose();
        }
      }}
    >
      <div
        className={`admin-panel candidate-modal-panel w-full max-w-md overflow-hidden transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/20">
              <Icon icon={alertTriangle} className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="cancel-registration-title"
                className="text-base font-semibold text-fg-primary"
              >
                确认撤回报名
              </h2>
              <p className="mt-0.5 text-xs text-fg-dim">撤回后保留历史记录</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={cancelling}
            title="关闭"
            aria-label="关闭"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl text-fg-dim transition hover:bg-white/5 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon icon={x} className="h-4 w-4" />
          </button>
        </div>

        <div id="cancel-registration-description" className="candidate-modal-body relative space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3.5 text-sm leading-6 text-rose-100/90">
            即将撤回
            <span className="mx-1 font-semibold text-fg-primary">{formTitle}</span>
            的报名记录。撤回后该条记录不再进入后续初筛与面试，但历史记录会继续保留。
          </div>
          <ul className="space-y-2 text-xs leading-6 text-fg-muted">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400/70" />
              只有待初筛状态可以撤回
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400/70" />
              撤回不会删除已提交的报名资料与文件记录
            </li>
          </ul>
        </div>

        <div className="relative flex items-center justify-end gap-3 border-t border-white/[0.06] bg-black/20 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={cancelling}
            className="admin-button admin-button--secondary"
          >
            保留报名
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={cancelling}
            className="admin-button admin-button--danger"
          >
            {cancelling ? (
              <>
                <Icon icon={loaderIcon} className="h-4 w-4 animate-spin" />
                撤回中...
              </>
            ) : (
              "确认撤回报名"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InterviewAttendanceCard({
  data,
  loading,
  saving,
  onSave,
}: {
  data: InterviewAttendanceResult | null;
  loading: boolean;
  saving: boolean;
  onSave: (attendance: "attending" | "not_attending", interviewSessionId?: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  useEffect(() => {
    const currentSessionId = data?.session?.id ?? null;
    const currentSessionIsSelectable = currentSessionId != null && data?.availableSessions.some((session) => session.id === currentSessionId);
    setSelectedSessionId(currentSessionIsSelectable ? currentSessionId : null);
    setEditing(false);
  }, [data?.attendance, data?.session?.id, data?.availableSessions]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, InterviewSession[]>();
    for (const session of data?.availableSessions ?? []) {
      const items = groups.get(session.date) ?? [];
      items.push(session);
      groups.set(session.date, items);
    }
    return Array.from(groups.entries());
  }, [data?.availableSessions]);

  if (loading || !data) {
    return (
      <section className="admin-panel candidate-panel candidate-interview-card p-5 text-sm text-fg-dim">
        正在加载面试安排...
      </section>
    );
  }

  const hasAvailableSessions = data.availableSessions.length > 0;

  if (data.attendance === "pending" && !hasAvailableSessions) {
    return (
      <section className="admin-panel candidate-panel candidate-interview-card p-5">
        <h2 className="text-lg font-semibold text-fg-primary">线下面试</h2>
        <p className="mt-2 text-sm text-fg-muted">你已通过初筛，面试时间尚未开放，请等待后续通知。</p>
      </section>
    );
  }

  if (!editing && data.attendance === "attending" && data.session) {
    return (
      <section className="admin-panel candidate-panel candidate-interview-card p-5">
        <h2 className="text-lg font-semibold text-fg-primary">面试安排</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <InterviewInfo label="日期" value={data.session.date} />
          <InterviewInfo label="时段" value={data.session.label + " " + data.session.startTime + "–" + data.session.endTime} />
          <div className="sm:col-span-2">
            <InterviewInfo label="地点" value={data.session.location} />
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {hasAvailableSessions ? (
            <button type="button" onClick={() => setEditing(true)} className="admin-button admin-button--secondary">
              修改选择
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave("not_attending", null)}
            className="admin-button admin-button--secondary"
          >
            暂不参加
          </button>
        </div>
      </section>
    );
  }

  if (!editing && data.attendance === "not_attending") {
    return (
      <section className="admin-panel candidate-panel candidate-interview-card p-5">
        <h2 className="text-lg font-semibold text-fg-primary">线下面试</h2>
        <p className="mt-2 text-sm text-fg-muted">已记录：本次暂不参加。</p>
        {hasAvailableSessions ? (
          <button type="button" onClick={() => setEditing(true)} className="admin-button admin-button--primary mt-4">
            重新参加
          </button>
        ) : (
          <p className="mt-2 text-sm text-fg-dim">当前没有开放的面试时段。</p>
        )}
      </section>
    );
  }

  if (!editing && data.attendance === "pending") {
    return (
      <section className="admin-panel candidate-panel candidate-interview-card p-5">
        <h2 className="text-lg font-semibold text-fg-primary">线下面试</h2>
        <p className="mt-2 text-sm text-fg-muted">你已通过初筛。</p>
        <p className="mt-1 text-sm text-fg-primary">是否参加本次线下面试？</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className="admin-button admin-button--primary">
            参加面试
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave("not_attending", null)}
            className="admin-button admin-button--secondary"
          >
            暂不参加
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-panel candidate-panel candidate-interview-card p-5">
      <h2 className="text-lg font-semibold text-fg-primary">选择面试时段</h2>
      <div className="mt-4 space-y-5">
        {groupedSessions.map(([date, sessions]) => (
          <div key={date}>
            <div className="mb-2 text-sm font-medium text-fg-primary">{date}</div>
            <div className="space-y-2">
              {sessions.map((session) => (
                <label
                  key={session.id}
                  className="candidate-session-option flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3"
                >
                  <input
                    type="radio"
                    name="interview-session"
                    checked={selectedSessionId === session.id}
                    onChange={() => setSelectedSessionId(session.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-fg-primary">
                      {session.label} {session.startTime}–{session.endTime}
                    </span>
                    <span className="mt-1 block text-xs text-fg-dim">{session.location}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || selectedSessionId == null}
          onClick={() => selectedSessionId != null && void onSave("attending", selectedSessionId)}
          className="admin-button admin-button--primary"
        >
          {saving ? "保存中..." : "确认时段"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave("not_attending", null)}
          className="admin-button admin-button--secondary"
        >
          暂不参加
        </button>
        {data.attendance !== "pending" ? (
          <button type="button" disabled={saving} onClick={() => setEditing(false)} className="admin-button admin-button--secondary">
            取消
          </button>
        ) : null}
      </div>
    </section>
  );
}

function InterviewInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-dim">{label}</dt>
      <dd className="mt-1 text-sm text-fg-primary">{value}</dd>
    </div>
  );
}

function SubmittedStateCard({
  summary,
  canCancel,
  cancelling,
  onCancel,
  interviewAttendance,
  interviewLoading,
}: {
  summary: RecruitmentPageRegistrationSummary;
  canCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
  interviewAttendance: InterviewAttendanceResult | null;
  interviewLoading: boolean;
}) {
  const status = registrationStatusMeta[summary.status];
  const progress = getRecruitmentProgress(summary, interviewAttendance, interviewLoading);

  return (
    <section className="admin-panel candidate-status-card">
      <div className="candidate-status-heading">
        <div className="min-w-0">
          <p className="candidate-eyebrow">当前报名状态</p>
          <h2 className="candidate-current-status">{progress.currentStage}</h2>
          <p className="candidate-status-summary">
            <span className="font-medium text-white">{summary.formTitle}</span>
          </p>
        </div>
        <span className={`admin-status ${status.badgeClassName}`}>{progress.isTerminal ? "流程已结束" : "流程进行中"}</span>
      </div>

      <div className="candidate-next-action" aria-live="polite">
        <p className="candidate-next-action-label">{progress.isTerminal ? "招新结果" : "下一步"}</p>
        <p className="candidate-next-action-text">{progress.nextAction}</p>
      </div>

      {canCancel ? (
        <div className="candidate-cancel-row">
          <p>撤回后会保留本次报名历史；撤回后不会继续进入初筛。</p>
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="admin-button admin-button--danger"
          >
            {cancelling ? (
              <><Icon icon={loaderIcon} className="h-4 w-4 animate-spin" />撤回中...</>
            ) : (
              <><Icon icon={x} className="h-4 w-4" />撤回报名</>
            )}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RecruitmentProgressCard({
  summary,
  interviewAttendance,
  interviewLoading,
}: {
  summary: RecruitmentPageRegistrationSummary;
  interviewAttendance: InterviewAttendanceResult | null;
  interviewLoading: boolean;
}) {
  const progress = getRecruitmentProgress(summary, interviewAttendance, interviewLoading);
  const progressScrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scroller = progressScrollerRef.current;
    if (!scroller) return;

    const centerActiveStep = () => {
      const activeStep = scroller.querySelector<HTMLElement>('[aria-current="step"]');
      if (!activeStep || scroller.scrollWidth <= scroller.clientWidth) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const stepRect = activeStep.getBoundingClientRect();
      const left = scroller.scrollLeft + stepRect.left - scrollerRect.left - (scroller.clientWidth - activeStep.clientWidth) / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: "auto" });
    };

    centerActiveStep();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", centerActiveStep);
      return () => window.removeEventListener("resize", centerActiveStep);
    }

    const observer = new ResizeObserver(centerActiveStep);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [progress.activeStepIndex]);

  return (
    <section className="admin-panel candidate-progress-card">
      <div className="candidate-progress-section">
        <div className="candidate-section-heading">
          <h3>招新流程</h3>
        </div>
        <div
          ref={progressScrollerRef}
          aria-label="招新流程步骤"
          className="candidate-progress-scroll"
          role="region"
          tabIndex={0}
        >
          <ol aria-label="招新流程进度" className="candidate-progress-list">
            {progress.steps.map((step, index) => (
              <li
                key={step.label}
                aria-current={index === progress.activeStepIndex ? "step" : undefined}
                className={`candidate-step candidate-step--${step.state}`}
              >
                <span aria-hidden="true" className="candidate-step-marker">
                  {step.state === "complete"
                    ? "✓"
                    : step.state === "skipped"
                      ? "–"
                      : step.state === "rejected" || step.state === "result"
                        ? "!"
                        : step.state === "withdrawn"
                          ? "撤"
                          : step.state === "admitted"
                            ? "★"
                            : index + 1}
                </span>
                <span className="candidate-step-label">{step.label}</span>
                <span className="candidate-step-state">{step.status}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="candidate-meta-grid">
        <div className="candidate-meta-item">
          <span>报名时间</span>
          <strong>{formatDateTime(summary.submittedAt) || "—"}</strong>
        </div>
        <div className="candidate-meta-item">
          <span>最近更新</span>
          <strong>{formatDateTime(summary.updatedAt) || "—"}</strong>
        </div>
        <div className="candidate-meta-item">
          <span>当前意向组</span>
          <strong>{summary.preferredGroup?.name ?? "未设置"}</strong>
        </div>
      </div>
    </section>
  );
}

function UnavailableStateCard({ reason }: { reason: string }) {
  const isQuotaReached = reason.includes("报名人数已满");

  return (
    <section className="admin-panel candidate-unavailable-card">
      <span className="admin-status admin-status--withdrawn">{isQuotaReached ? "报名已结束" : "暂未开放"}</span>
      <h2>{isQuotaReached ? "本轮报名名额已满" : "当前暂不可报名"}</h2>
      <p>{isQuotaReached ? "本轮报名已结束，感谢关注 TARSGO。" : reason}</p>
      {!isQuotaReached ? <p className="candidate-unavailable-hint"><Icon icon={clockIcon} className="h-4 w-4" />请留意站内通知，开放后会在此处更新。</p> : null}
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
    <div className="candidate-upload-summary rounded-lg border px-4 py-3 text-sm text-fg-muted">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-fg-dim">
        <Icon icon={paperclipIcon} className="h-3.5 w-3.5" />
        当前已上传
      </div>
      <div className="mt-2.5 space-y-1.5">
        {files.map((file, index) => (
          <div
            key={`${field.key}-${file.fileName}-${index}`}
            className="candidate-upload-file flex items-center justify-between gap-3 rounded-md border px-3 py-2"
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
  fileUploadStatus: FileUploadStatus,
  onRetry: () => void,
) {
  const commonClassName =
    "admin-field candidate-field";

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
                className={`candidate-choice ${checked ? "candidate-choice--selected" : ""}`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    checked
                      ? "border-primary-400 bg-primary-500"
                      : "border-fg-dim bg-black/20"
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
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                checked
                  ? "border-primary-500/50 bg-primary-500/10 text-primary-100"
                  : "border-white/[0.08] bg-black/20 text-fg-muted hover:border-white/[0.1] hover:bg-white/[0.03] hover:text-fg-primary"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  checked
                    ? "border-primary-400 bg-primary-500 text-white"
                    : "border-fg-dim bg-black/20"
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
    const selectedFiles = Array.isArray(value) ? value.filter(isFileValue) : [];
    const fileConfig = field.file_config ?? {};
    const allowedTypes = Array.isArray(fileConfig.allowed_types)
      ? fileConfig.allowed_types.filter((item): item is string => typeof item === "string")
      : [];
    const accept = allowedTypes.length
      ? allowedTypes.map((item) => normalizeUploadAcceptType(item)).join(",")
      : isImage ? "image/*" : undefined;
    const maxSizeMB = positiveConfigNumber(fileConfig.max_size_mb);
    const maxCount = isImage ? positiveConfigNumber(fileConfig.max_count) : null;
    const hint = [isImage ? "图片" : "单个文件", maxSizeMB ? `最大 ${maxSizeMB} MB` : "", maxCount ? `最多 ${maxCount} 张` : ""].filter(Boolean).join(" · ");
    return (
      <FileUploadField
        label={field.label}
        id={fieldId}
        files={selectedFiles}
        onFilesChange={(files) => onChange(field.key, files)}
        accept={accept}
        multiple={isImage}
        variant="compact"
        disabled={fileUploadStatus === "uploading"}
        status={fileUploadStatus}
        onRetry={onRetry}
        triggerLabel={selectedFiles.length ? "继续添加" : isImage ? "选择图片" : "选择文件"}
        hint={hint}
        validateSelection={(nextFiles, incomingFiles) => {
          if (!isImage && nextFiles.length > 1) return "单个文件字段只能选择一个文件。";
          if (maxCount && nextFiles.length > maxCount) return `最多上传 ${maxCount} 张图片。`;
          for (const file of incomingFiles) {
            if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) return `单个文件不能超过 ${maxSizeMB} MB。`;
            if (isImage && !isRegistrationImageFile(file)) return "请选择图片文件。";
            if (allowedTypes.length && !isRegistrationAllowedFileType(file, allowedTypes)) return `「${file.name}」的文件类型不符合要求。`;
          }
          return null;
        }}
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
      const files = Array.isArray(value) ? value.filter(isFileValue) : [];
      files.forEach((file) => {
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

function positiveConfigNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function isFileValue(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function normalizeUploadAcceptType(value: string) {
  const normalized = value.trim();
  return normalized.includes("/") ? normalized : `.${normalized.replace(/^\./, "")}`;
}

function isRegistrationImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(extension));
}

function isRegistrationAllowedFileType(file: File, allowedTypes: string[]) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = file.type.toLowerCase();
  return allowedTypes.some((item) => {
    const allowed = item.trim().toLowerCase().replace(/^\./, "");
    return allowed === extension || allowed === contentType || (allowed.endsWith("/*") && contentType.startsWith(allowed.slice(0, -1)));
  });
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

function resolveSelectedRecruitmentGroup(
  fields: RegistrationFormField[],
  fieldKey: string,
  value: unknown,
): RecruitmentRegistrationGroupRef | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const field = fields.find((item) => item.key === fieldKey);
  const option = field?.options?.find((item) => item.value === value);
  if (!option) {
    return null;
  }

  const id = Number(option.value);
  if (!Number.isFinite(id)) {
    return null;
  }

  return {
    id,
    name: option.label,
  };
}

async function fetchLoaderApi<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
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
