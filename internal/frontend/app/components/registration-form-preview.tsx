import fileText from "@iconify-icons/lucide/file-text";
import { Icon } from "@iconify/react";
import { AnimatedSelect } from "~/components/animated-select";
import { isFileField, isOptionField } from "~/lib/registration-form-schema";
import type { RegistrationFormField } from "~/lib/registration-forms-client";

type PreviewForm = {
  title: string;
  description: string;
  coverImageUrl: string;
  status: string;
  fieldsSchema: RegistrationFormField[];
};

export function RegistrationFormPreview({ form }: { form: PreviewForm }) {
  return (
    <div className="space-y-6">
      {form.coverImageUrl ? (
        <img
          src={form.coverImageUrl}
          alt={form.title}
          className="h-44 w-full rounded-2xl object-cover ring-1 ring-[var(--admin-border-subtle)]"
        />
      ) : null}

      <div>
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-fg-primary">
            {form.title || "未命名报名表"}
          </h3>
          <StatusBadge status={Number(form.status)} />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          {form.description.trim() || "暂无报名说明"}
        </p>
        <div className="mt-3 text-xs text-fg-dim">
          {form.fieldsSchema.length} 个字段 ·{" "}
          {form.fieldsSchema.filter((f) => f.required).length}{" "}
          个必填
        </div>
      </div>

      <div className="space-y-4">
        {form.fieldsSchema.map((field) => (
          <div key={`preview-${field.key}`} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-fg-primary">
              {field.label}
              {field.required ? (
                <span className="text-[11px] text-[var(--admin-danger)]">*</span>
              ) : null}
            </div>
            {field.description ? (
              <p className="text-xs text-fg-dim">{field.description}</p>
            ) : null}
            {renderPreviewControl(field)}
          </div>
        ))}
      </div>
    </div>
  );
}

function getStatusMeta(status: number) {
  if (status === 1) {
    return {
      label: "已发布",
      dotColor: "bg-[var(--admin-success)]",
      className:
        "text-[var(--admin-success)] bg-[var(--admin-success-surface)] border border-[var(--admin-success-border)]",
    };
  }
  if (status === 2) {
    return {
      label: "已关闭",
      dotColor: "bg-[var(--admin-muted)]",
      className: "text-[var(--admin-muted)] bg-[var(--admin-neutral-surface)] border border-[var(--admin-neutral-border)]",
    };
  }
  return {
    label: "草稿",
    dotColor: "bg-[var(--admin-warning)]",
    className: "text-[var(--admin-warning)] bg-[var(--admin-warning-surface)] border border-[var(--admin-warning-border)]",
  };
}


function renderPreviewControl(field: RegistrationFormField) {
  const cls =
    "admin-field w-full rounded-xl placeholder:text-fg-dim/60";

  if (field.type === "textarea") {
    return (
      <textarea
        rows={3}
        readOnly
        value=""
        aria-label={field.label}
        placeholder={field.placeholder || "请输入内容"}
        className={cls}
      />
    );
  }

  if (isOptionField(field.type)) {
    if (field.type === "select" || field.type === "user_group_select") {
      return (
        <AnimatedSelect
          ariaLabel={field.label}
          value=""
          onChange={() => {}}
          disabled
          placeholder="请选择"
          options={(field.options ?? []).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        {field.options?.map((option) => (
          <label
            key={option.value}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--admin-border-subtle)] bg-[var(--admin-input-surface)] px-3 py-2 text-sm text-fg-muted"
          >
            <input
              type={field.type === "radio" ? "radio" : "checkbox"}
              disabled
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (isFileField(field.type)) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--admin-border-subtle)] bg-[var(--admin-surface-subtle)] px-4 py-8 text-sm text-fg-dim">
        <Icon icon={fileText} className="h-6 w-6 text-fg-dim/50" />
        <span>
          {field.type === "image" ? "点击或拖拽上传图片" : "点击或拖拽上传文件"}
        </span>
      </div>
    );
  }

  return (
    <input
      type={
        field.type === "number"
          ? "number"
          : field.type === "date"
            ? "date"
            : field.type === "email"
              ? "email"
              : field.type === "phone"
                ? "tel"
                : "text"
      }
      readOnly
      value=""
      placeholder={field.placeholder || "请输入内容"}
      className={cls}
    />
  );
}

export function StatusBadge({ status }: { status: number }) {
  const meta = getStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
      {meta.label}
    </span>
  );
}
