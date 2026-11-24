import { useState } from "react";
import { Icon } from "@iconify/react";
import info from "@iconify-icons/lucide/info";
import plus from "@iconify-icons/lucide/plus";
import trash2 from "@iconify-icons/lucide/trash-2";
import chevronDown from "@iconify-icons/lucide/chevron-down";
import chevronUp from "@iconify-icons/lucide/chevron-up";
import {
  buildCustomRegistrationField,
  cloneRegistrationFields,
  isFileField,
  isLockedRegistrationField,
  isOptionField,
  REGISTRATION_FIELD_TYPE_LABELS,
  REGISTRATION_FIELD_TYPE_OPTIONS,
} from "~/lib/registration-form-schema";
import type { RegistrationFormField } from "~/lib/registration-forms-client";

export function RegistrationFieldsEditor({
  fields,
  onChange,
}: {
  fields: RegistrationFormField[];
  onChange: (updater: (current: RegistrationFormField[]) => RegistrationFormField[]) => void;
}) {
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const selectedField = fields.find((field) => field.key === selectedFieldKey) ?? null;
  const allowManualOptions = Boolean(selectedField && isOptionField(selectedField.type) && selectedField.type !== "user_group_select");
  const requiredFieldCount = fields.filter((field) => field.required).length;

  function updateField(
    key: string,
    updater: (field: RegistrationFormField) => RegistrationFormField,
  ) {
    onChange((current) => current.map((field) => field.key === key ? updater(field) : field));
  }

  function moveField(key: string, direction: "up" | "down") {
    onChange((current) => {
      const index = current.findIndex(
        (field) => field.key === key,
      );
      if (index === -1) {
        return current;
      }
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }
      const nextFields = cloneRegistrationFields(current);
      const [item] = nextFields.splice(index, 1);
      nextFields.splice(targetIndex, 0, item);
      return nextFields;
    });
  }

  function removeField(key: string) {
    if (isLockedRegistrationField(key)) {
      return;
    }
    onChange((current) => current.filter((field) => field.key !== key));
    if (selectedFieldKey === key) {
      setSelectedFieldKey("");
    }
  }

  function addField() {
    const field = buildCustomRegistrationField();
    onChange((current) => [...current, field]);
    setSelectedFieldKey(field.key);
  }

  function updateFieldType(nextType: RegistrationFormField["type"]) {
    if (!selectedField || isLockedRegistrationField(selectedField.key)) {
      return;
    }
    updateField(selectedField.key, (field) => ({
      ...field,
      type: nextType,
      options: isOptionField(nextType)
        ? field.options?.length
          ? field.options
          : [
              { label: "选项 1", value: "option_1" },
              { label: "选项 2", value: "option_2" },
            ]
        : undefined,
      file_config: isFileField(nextType) ? field.file_config ?? {} : undefined,
    }));
  }

  function addFieldOption() {
    if (!selectedField || !allowManualOptions) {
      return;
    }
    updateField(selectedField.key, (field) => {
      const nextIndex = (field.options?.length ?? 0) + 1;
      return {
        ...field,
        options: [
          ...(field.options ?? []),
          {
            label: `选项 ${nextIndex}`,
            value: `${field.key}_option_${nextIndex}`,
          },
        ],
      };
    });
  }

  function updateFieldOption(
    optionIndex: number,
    property: "label" | "value",
    nextValue: string,
  ) {
    if (!selectedField || !allowManualOptions) {
      return;
    }
    updateField(selectedField.key, (field) => ({
      ...field,
      options: (field.options ?? []).map((option, index) =>
        index === optionIndex ? { ...option, [property]: nextValue } : option,
      ),
    }));
  }

  function moveFieldOption(optionIndex: number, direction: "up" | "down") {
    if (!selectedField || !allowManualOptions) {
      return;
    }
    updateField(selectedField.key, (field) => {
      const options = [...(field.options ?? [])];
      const targetIndex =
        direction === "up" ? optionIndex - 1 : optionIndex + 1;
      if (targetIndex < 0 || targetIndex >= options.length) {
        return field;
      }
      const [item] = options.splice(optionIndex, 1);
      options.splice(targetIndex, 0, item);
      return { ...field, options };
    });
  }

  function removeFieldOption(optionIndex: number) {
    if (!selectedField || !allowManualOptions) {
      return;
    }
    updateField(selectedField.key, (field) => ({
      ...field,
      options: (field.options ?? []).filter((_, index) => index !== optionIndex),
    }));
  }

  function updateFileConfig(
    key: "max_size_mb" | "max_count" | "allowed_types",
    value: string,
  ) {
    if (!selectedField) {
      return;
    }
    updateField(selectedField.key, (field) => {
      const currentConfig = { ...(field.file_config ?? {}) };
      if (!value.trim()) {
        delete currentConfig[key];
      } else if (key === "allowed_types") {
        currentConfig[key] = value
          .split(/[,\n]/g)
          .map((item) => item.trim())
          .filter(Boolean);
      } else {
        currentConfig[key] = Number(value);
      }
      return {
        ...field,
        file_config: Object.keys(currentConfig).length
          ? currentConfig
          : undefined,
      };
    });
  }


  return (
    <>
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-xs text-fg-dim">
                          姓名、手机号、邮箱为系统锁定字段。已配置{" "}
                          {fields.length} 个字段，
                          {requiredFieldCount} 个必填。
                        </p>
                        <button
                          type="button"
                          onClick={addField}
                          className="btn-glass inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-fg-muted"
                        >
                          <Icon icon={plus} className="h-3 w-3" />
                          添加字段
                        </button>
                      </div>

                      <div className="space-y-2">
                        {fields.map((field, index) => {
                          const active = selectedField?.key === field.key;
                          const locked = isLockedRegistrationField(field.key);

                          return (
                            <div key={field.key}>
                              {/* Field row */}
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedFieldKey(
                                    active ? "" : field.key,
                                  )
                                }
                                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 ${
                                  active
                                    ? "border-[var(--admin-accent)] bg-[color-mix(in_srgb,var(--admin-accent)_8%,var(--admin-surface))]"
                                    : "border-[var(--admin-border-subtle)] bg-[var(--admin-hover-overlay)] hover:border-[var(--admin-border-subtle)] hover:bg-[var(--admin-hover-overlay)]"
                                }`}
                              >
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--admin-surface-subtle)] text-[11px] font-semibold tabular-nums text-fg-dim ring-1 ring-[var(--admin-border-subtle)]">
                                  {index + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-fg-primary">
                                      {field.label}
                                    </span>
                                    {locked ? (
                                      <span className="admin-role--elevated rounded-full px-2 py-0.5 text-[10px] font-medium">
                                        系统字段
                                      </span>
                                    ) : null}
                                    {field.required ? (
                                      <span className="rounded-full border border-[var(--admin-danger-border)] bg-[var(--admin-danger-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--admin-danger)]">
                                        必填
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-0.5 text-xs text-fg-dim">
                                    <span className="font-mono">
                                      {field.key}
                                    </span>{" "}
                                    ·{" "}
                                    {REGISTRATION_FIELD_TYPE_LABELS[field.type]}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    title="上移"
                                    aria-label="上移"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveField(field.key, "up");
                                    }}
                                    className="btn-glass inline-flex h-7 w-7 items-center justify-center rounded-xl text-fg-dim"
                                  >
                                    <Icon
                                      icon={chevronUp}
                                      className="h-3.5 w-3.5"
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    title="下移"
                                    aria-label="下移"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveField(field.key, "down");
                                    }}
                                    className="btn-glass inline-flex h-7 w-7 items-center justify-center rounded-xl text-fg-dim"
                                  >
                                    <Icon
                                      icon={chevronDown}
                                      className="h-3.5 w-3.5"
                                    />
                                  </button>
                                  {!locked ? (
                                    <button
                                      type="button"
                                      title="删除"
                                      aria-label="删除"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeField(field.key);
                                      }}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-surface)] text-[var(--admin-danger)] transition hover:bg-[color-mix(in_srgb,var(--admin-danger)_18%,var(--admin-surface))]"
                                    >
                                      <Icon
                                        icon={trash2}
                                        className="h-3.5 w-3.5"
                                      />
                                    </button>
                                  ) : null}
                                </div>
                              </button>

                              {/* Expanded field editor */}
                              {active ? (
                                <div className="mt-2 space-y-4 rounded-xl border border-[color-mix(in_srgb,var(--admin-accent)_42%,var(--admin-border))] bg-[color-mix(in_srgb,var(--admin-accent)_3%,var(--admin-surface))] p-4">
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                      <FieldLabel label="字段名称" />
                                      <input
                                        type="text"
                                        aria-label="字段名称"
                                        value={selectedField?.label ?? ""}
                                        onChange={(event) =>
                                          updateField(field.key, (f) => ({
                                            ...f,
                                            label: event.target.value,
                                          }))
                                        }
                                        className={InputClassName()}
                                      />
                                    </div>
                                    <div>
                                      <FieldLabel label="字段 KEY" />
                                      <input
                                        type="text"
                                        aria-label="字段 KEY"
                                        value={selectedField?.key ?? ""}
                                        disabled={locked}
                                        onChange={(event) => {
                                          const nextKey = event.target.value
                                            .trim()
                                            .toLowerCase()
                                            .replace(/\s+/g, "_");
                                          onChange((current) =>
                                            current.map((f) =>
                                              f.key === field.key
                                                ? { ...f, key: nextKey || f.key }
                                                : f,
                                            ),
                                          );
                                          setSelectedFieldKey(
                                            nextKey || field.key,
                                          );
                                        }}
                                        className={InputClassName(locked)}
                                      />
                                    </div>
                                    <div>
                                      <FieldLabel label="字段类型" />
                                      <select className={InputClassName(locked)} aria-label="字段类型"
                                        value={selectedField?.type ?? "text"} disabled={locked}
                                        onChange={(event) =>
                                          updateFieldType(event.target.value as RegistrationFormField["type"])
                                        }>
                                        {REGISTRATION_FIELD_TYPE_OPTIONS.map((option) =>
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        )}
                                      </select>
                                    </div>
                                    <div className="flex items-end">
                                      <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[var(--admin-border-subtle)] bg-[var(--admin-input-surface)] px-3.5 py-2.5 text-sm text-fg-primary transition hover:bg-[var(--admin-surface-hover)]">
                                        <input
                                          type="checkbox"
                                          checked={
                                            selectedField?.required ?? false
                                          }
                                          disabled={locked}
                                          onChange={(event) =>
                                            updateField(field.key, (f) => ({
                                              ...f,
                                              required: event.target.checked,
                                            }))
                                          }
                                          className="h-4 w-4 rounded border-[var(--admin-border-subtle)] bg-[var(--admin-input-surface)] text-accent-primary focus:ring-[var(--admin-accent)]/30"
                                        />
                                        必填项
                                      </label>
                                    </div>
                                  </div>

                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                      <FieldLabel label="占位提示" />
                                      <input
                                        type="text"
                                        value={
                                          selectedField?.placeholder ?? ""
                                        }
                                        onChange={(event) =>
                                          updateField(field.key, (f) => ({
                                            ...f,
                                            placeholder: event.target.value,
                                          }))
                                        }
                                        placeholder="输入框占位文字"
                                        className={InputClassName()}
                                      />
                                    </div>
                                    <div>
                                      <FieldLabel label="字段说明" />
                                      <input
                                        type="text"
                                        value={
                                          selectedField?.description ?? ""
                                        }
                                        onChange={(event) =>
                                          updateField(field.key, (f) => ({
                                            ...f,
                                            description: event.target.value,
                                          }))
                                        }
                                        placeholder="对字段的补充说明"
                                        className={InputClassName()}
                                      />
                                    </div>
                                  </div>

                                  {/* Option fields */}
                                  {allowManualOptions ? (
                                    <div>
                                      <FieldLabel label="选项配置" />
                                      <div className="space-y-2">
                                        {(selectedField?.options ?? []).map(
                                          (option, oi) => (
                                            <div
                                              key={`${field.key}-opt-${oi}`}
                                              className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                                            >
                                              <input
                                                type="text"
                                                aria-label={`选项 ${oi + 1} 显示名称`}
                                                value={option.label}
                                                onChange={(event) =>
                                                  updateFieldOption(
                                                    oi,
                                                    "label",
                                                    event.target.value,
                                                  )
                                                }
                                                placeholder="显示名称"
                                                className={InputClassName()}
                                              />
                                              <input
                                                type="text"
                                                aria-label={`选项 ${oi + 1} 提交值`}
                                                value={option.value}
                                                onChange={(event) =>
                                                  updateFieldOption(
                                                    oi,
                                                    "value",
                                                    event.target.value,
                                                  )
                                                }
                                                placeholder="提交值"
                                                className={InputClassName()}
                                              />
                                              <div className="flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  title="上移"
                                                  aria-label="上移选项"
                                                  onClick={() =>
                                                    moveFieldOption(oi, "up")
                                                  }
                                                  className="btn-glass inline-flex h-8 w-8 items-center justify-center rounded-xl text-fg-dim"
                                                >
                                                  <Icon
                                                    icon={chevronUp}
                                                    className="h-3 w-3"
                                                  />
                                                </button>
                                                <button
                                                  type="button"
                                                  title="下移"
                                                  aria-label="下移选项"
                                                  onClick={() =>
                                                    moveFieldOption(oi, "down")
                                                  }
                                                  className="btn-glass inline-flex h-8 w-8 items-center justify-center rounded-xl text-fg-dim"
                                                >
                                                  <Icon
                                                    icon={chevronDown}
                                                    className="h-3 w-3"
                                                  />
                                                </button>
                                                <button
                                                  type="button"
                                                  title="删除选项"
                                                  aria-label="删除选项"
                                                  onClick={() =>
                                                    removeFieldOption(oi)
                                                  }
                                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-surface)] text-[var(--admin-danger)] transition hover:bg-[color-mix(in_srgb,var(--admin-danger)_18%,var(--admin-surface))]"
                                                >
                                                  <Icon
                                                    icon={trash2}
                                                    className="h-3 w-3"
                                                  />
                                                </button>
                                              </div>
                                            </div>
                                          ),
                                        )}
                                        <button
                                          type="button"
                                          onClick={addFieldOption}
                                          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--admin-border-subtle)] px-3 py-2 text-xs text-fg-muted transition hover:border-accent-primary/40 hover:text-accent-primary"
                                        >
                                          <Icon
                                            icon={plus}
                                            className="h-3 w-3"
                                          />
                                          新增选项
                                        </button>
                                      </div>
                                    </div>
                                  ) : selectedField?.type ===
                                    "user_group_select" ? (
                                    <div className="admin-notice admin-notice--warning flex items-start gap-3 text-xs">
                                      <Icon
                                        icon={info}
                                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--admin-warning)]"
                                      />
                                      意向组别字段的下拉选项会自动读取当前"前台展示"状态为展示的用户分组，无需手动维护。
                                    </div>
                                  ) : null}

                                  {/* File config */}
                                  {selectedField &&
                                  isFileField(selectedField.type) ? (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                      <div>
                                        <FieldLabel label="最大文件大小（MB）" />
                                        <input
                                          type="number"
                                          min={1}
                                          aria-label="最大文件大小"
                                          value={
                                            typeof selectedField.file_config
                                              ?.max_size_mb === "number"
                                              ? String(
                                                  selectedField.file_config
                                                    .max_size_mb,
                                                )
                                              : ""
                                          }
                                          onChange={(event) =>
                                            updateFileConfig(
                                              "max_size_mb",
                                              event.target.value,
                                            )
                                          }
                                          className={InputClassName()}
                                        />
                                      </div>
                                      <div>
                                        <FieldLabel label="允许的文件类型" />
                                        <input
                                          type="text"
                                          aria-label="允许的文件类型"
                                          value={
                                            Array.isArray(
                                              selectedField.file_config
                                                ?.allowed_types,
                                            )
                                              ? selectedField.file_config.allowed_types.join(
                                                  ", ",
                                                )
                                              : ""
                                          }
                                          onChange={(event) =>
                                            updateFileConfig(
                                              "allowed_types",
                                              event.target.value,
                                            )
                                          }
                                          placeholder="逗号分隔，例如 pdf, docx"
                                          className={InputClassName()}
                                        />
                                      </div>
                                      {selectedField.type === "image" ? (
                                        <div>
                                          <FieldLabel label="最大上传张数" />
                                          <input
                                            type="number"
                                            min={1}
                                            aria-label="最大上传张数"
                                            value={
                                              typeof selectedField.file_config
                                                ?.max_count === "number"
                                                ? String(
                                                    selectedField.file_config
                                                      .max_count,
                                                  )
                                                : ""
                                            }
                                            onChange={(event) =>
                                              updateFileConfig(
                                                "max_count",
                                                event.target.value,
                                              )
                                            }
                                            className={InputClassName()}
                                          />
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
    </>
  );
}

export function InputClassName(disabled = false) {
  return `admin-field w-full rounded-xl placeholder:text-fg-dim/60 ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
}

export function FieldLabel({ label }: { label: string }) {
  return (
    <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-fg-dim">
      {label}
    </label>
  );
}
