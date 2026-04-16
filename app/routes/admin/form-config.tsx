import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router";
import { AnimatedSelect } from "~/components/animated-select";
import { MotionDateInput } from "~/components/motion-date-input";
import { useModalPresence } from "~/components/modal-shell";
import { ApiError } from "~/lib/api-client";
import {
  buildCustomRegistrationField,
  buildLockedRegistrationFields,
  cloneRegistrationFields,
  isFileField,
  isLockedRegistrationField,
  isOptionField,
  REGISTRATION_FIELD_TYPE_LABELS,
  REGISTRATION_FIELD_TYPE_OPTIONS,
  REGISTRATION_FORM_STATUS_OPTIONS,
} from "~/lib/registration-form-schema";
import {
  createAdminRegistrationForm,
  getAdminRegistrationForm,
  listAdminRegistrationForms,
  updateAdminRegistrationForm,
  type RegistrationFormDetail,
  type RegistrationFormField,
  type RegistrationFormListItem,
  type RegistrationFormSummary,
} from "~/lib/registration-forms-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [
    { title: "表单配置 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 报名表单配置与发布管理" },
  ];
}

type FlashState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type FormEditorState = {
  id: number;
  title: string;
  description: string;
  coverImageUrl: string;
  fieldsSchema: RegistrationFormField[];
  maxRegistrations: string;
  startTime: string;
  endTime: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type CreateFormState = {
  title: string;
  description: string;
  coverImageUrl: string;
};

const defaultSummary: RegistrationFormSummary = {
  total: 0,
  draft: 0,
  published: 0,
  closed: 0,
};

const defaultCreateState: CreateFormState = {
  title: "",
  description: "",
  coverImageUrl: "",
};

export default function FormConfigPage() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [forms, setForms] = useState<RegistrationFormListItem[]>([]);
  const [summary, setSummary] = useState<RegistrationFormSummary>(defaultSummary);
  const [loadingList, setLoadingList] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [editor, setEditor] = useState<FormEditorState | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createState, setCreateState] = useState<CreateFormState>(defaultCreateState);
  const [creating, setCreating] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const createModalVisible = useModalPresence(createOpen);

  useEffect(() => {
    if (!createOpen && !createModalVisible) {
      setCreateState(defaultCreateState);
    }
  }, [createModalVisible, createOpen]);

  const selectedField = useMemo(() => {
    if (!editor) {
      return null;
    }
    return (
      editor.fieldsSchema.find((field) => field.key === selectedFieldKey) ??
      editor.fieldsSchema[0] ??
      null
    );
}, [editor, selectedFieldKey]);

const allowManualOptions = useMemo(
  () =>
    Boolean(
      selectedField &&
        isOptionField(selectedField.type) &&
        selectedField.type !== "user_group_select",
    ),
  [selectedField],
);

const requiredFieldCount = useMemo(
    () => editor?.fieldsSchema.filter((field) => field.required).length ?? 0,
    [editor],
  );

  const canCreateOrSave = currentUser.role.name !== "user";

  useEffect(() => {
    let cancelled = false;

    async function loadForms() {
      try {
        setLoadingList(true);
        const response = await listAdminRegistrationForms({
          keyword,
          status: statusFilter === "" ? "" : Number(statusFilter),
        });

        if (cancelled) {
          return;
        }

        setForms(response.items);
        setSummary(response.summary);
        setSelectedFormId((current) => {
          if (current && response.items.some((item) => item.id === current)) {
            return current;
          }
          return response.items[0]?.id ?? null;
        });
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setFlash);
        }
      } finally {
        if (!cancelled) {
          setLoadingList(false);
        }
      }
    }

    void loadForms();

    return () => {
      cancelled = true;
    };
  }, [keyword, navigate, statusFilter]);

  useEffect(() => {
    if (selectedFormId === null) {
      setEditor(null);
      setSelectedFieldKey("");
      return;
    }

    const formId = selectedFormId;
    let cancelled = false;

    async function loadDetail() {
      try {
        setDetailLoading(true);
        const detail = await getAdminRegistrationForm(formId);
        if (cancelled) {
          return;
        }

        const nextEditor = toEditorState(detail);
        setEditor(nextEditor);
        setSelectedFieldKey((current) =>
          nextEditor.fieldsSchema.some((field) => field.key === current)
            ? current
            : nextEditor.fieldsSchema[0]?.key ?? "",
        );
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setFlash);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [navigate, selectedFormId]);

  async function refreshForms(preferredId?: number | null) {
    const response = await listAdminRegistrationForms({
      keyword,
      status: statusFilter === "" ? "" : Number(statusFilter),
    });
    setForms(response.items);
    setSummary(response.summary);
    setSelectedFormId(() => {
      if (preferredId && response.items.some((item) => item.id === preferredId)) {
        return preferredId;
      }
      return response.items[0]?.id ?? null;
    });
  }

  function updateEditor(
    updater: (current: FormEditorState) => FormEditorState,
  ) {
    setEditor((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
  }

  function updateField(
    key: string,
    updater: (field: RegistrationFormField) => RegistrationFormField,
  ) {
    updateEditor((current) => ({
      ...current,
      fieldsSchema: current.fieldsSchema.map((field) =>
        field.key === key ? updater(field) : field,
      ),
    }));
  }

  function moveField(key: string, direction: "up" | "down") {
    updateEditor((current) => {
      const index = current.fieldsSchema.findIndex((field) => field.key === key);
      if (index === -1) {
        return current;
      }
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.fieldsSchema.length) {
        return current;
      }
      const nextFields = cloneRegistrationFields(current.fieldsSchema);
      const [item] = nextFields.splice(index, 1);
      nextFields.splice(targetIndex, 0, item);
      return {
        ...current,
        fieldsSchema: nextFields,
      };
    });
  }

  function removeField(key: string) {
    if (isLockedRegistrationField(key)) {
      return;
    }

    updateEditor((current) => ({
      ...current,
      fieldsSchema: current.fieldsSchema.filter((field) => field.key !== key),
    }));

    if (selectedFieldKey === key) {
      setSelectedFieldKey("");
    }
  }

  function addField() {
    const field = buildCustomRegistrationField();
    updateEditor((current) => ({
      ...current,
      fieldsSchema: [...current.fieldsSchema, field],
    }));
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
      const targetIndex = direction === "up" ? optionIndex - 1 : optionIndex + 1;
      if (targetIndex < 0 || targetIndex >= options.length) {
        return field;
      }

      const [item] = options.splice(optionIndex, 1);
      options.splice(targetIndex, 0, item);

      return {
        ...field,
        options,
      };
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
        file_config: Object.keys(currentConfig).length ? currentConfig : undefined,
      };
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !canCreateOrSave) {
      return;
    }

    try {
      setSaving(true);
      const detail = await updateAdminRegistrationForm(
        editor.id,
        buildUpdatePayload(editor),
      );
      setEditor(toEditorState(detail));
      setSelectedFieldKey((current) =>
        detail.fieldsSchema.some((field) => field.key === current)
          ? current
          : detail.fieldsSchema[0]?.key ?? "",
      );
      await refreshForms(detail.id);
      setFlash({ type: "success", message: "报名表已保存。" });
    } catch (error) {
      handlePageError(error, navigate, setFlash);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateOrSave) {
      return;
    }

    try {
      setCreating(true);
      const detail = await createAdminRegistrationForm({
        title: createState.title.trim(),
        description: createState.description.trim(),
        coverImageUrl: createState.coverImageUrl.trim(),
        fieldsSchema: buildLockedRegistrationFields(),
        maxRegistrations: null,
        status: 0,
      });

      setCreateOpen(false);
      setEditor(toEditorState(detail));
      setSelectedFormId(detail.id);
      setSelectedFieldKey(detail.fieldsSchema[0]?.key ?? "");
      await refreshForms(detail.id);
      setFlash({ type: "success", message: "报名表创建成功。" });
    } catch (error) {
      handlePageError(error, navigate, setFlash);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">表单配置</h1>
          <p className="mt-1 text-sm text-gray-400">
            管理多张报名表，配置字段、开放时间与发布状态。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!canCreateOrSave}
            className="motion-button rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            新建报名表
          </button>
        </div>
      </div>

      {flash ? (
        <div
          className={`motion-fade-up rounded-lg border px-4 py-3 text-sm ${
            flash.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
              : "border-rose-500/20 bg-rose-500/10 text-rose-100"
          }`}
        >
          {flash.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="全部表单" value={summary.total} hint="已创建的报名表数量" />
        <StatCard label="草稿" value={summary.draft} hint="尚未对外开放" />
        <StatCard label="已发布" value={summary.published} hint="允许前台访问" />
        <StatCard label="已关闭" value={summary.closed} hint="保留历史配置" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="motion-fade-up motion-panel-soft rounded-xl border border-gray-800 bg-gray-900/70 p-4" style={{ animationDelay: "120ms" }}>
            <div className="grid gap-3">
              <div>
                <FieldLabel label="搜索表单" htmlFor="form-keyword" />
                <input
                  id="form-keyword"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="标题或描述"
                  className={inputClassName()}
                />
              </div>

              <div>
                <FieldLabel label="状态筛选" htmlFor="status-filter" />
                <AnimatedSelect
                  id="status-filter"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "", label: "全部状态" },
                    ...REGISTRATION_FORM_STATUS_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    })),
                  ]}
                />
              </div>
            </div>
          </section>

          <section className="motion-fade-up motion-surface rounded-xl border border-gray-800 bg-gray-900/70 p-4" style={{ animationDelay: "160ms" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">表单列表</h2>
              {loadingList ? (
                <span className="text-xs text-gray-500">刷新中...</span>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {forms.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
                  当前没有匹配的报名表。
                </div>
              ) : (
                forms.map((form) => {
                  const active = selectedFormId === form.id;
                  return (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => setSelectedFormId(form.id)}
                      className={`motion-button w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                        active
                          ? "border-primary-500/40 bg-primary-500/10"
                          : "border-gray-800 bg-gray-950/60 hover:border-gray-700 hover:bg-gray-950"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white">
                            {form.title}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {form.fieldCount} 个字段 · {form.requiredCount} 个必填
                          </div>
                        </div>
                        <FormStatusBadge status={form.status} />
                      </div>

                      <div className="mt-3 text-xs leading-5 text-gray-400">
                        {form.description?.trim() || "暂无描述"}
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-gray-500">
                        <div>开放时间：{formatSchedule(form.startTime, form.endTime)}</div>
                        <div>更新时间：{formatDateTime(form.updatedAt)}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </aside>

        <section className="motion-fade-up motion-panel-soft rounded-xl border border-gray-800 bg-gray-900/70 p-5 sm:p-6" style={{ animationDelay: "200ms" }}>
          {!editor ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-gray-800 bg-gray-950/40 px-6 py-10 text-center text-sm text-gray-500">
              {loadingList || detailLoading ? "正在加载报名表..." : "请选择左侧报名表开始编辑。"}
            </div>
          ) : detailLoading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-gray-800 bg-gray-950/40 px-6 py-10 text-center text-sm text-gray-500">
              正在加载报名表详情...
            </div>
          ) : (
            <form className="space-y-8" onSubmit={handleSave}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold text-white">
                      {editor.title || "未命名报名表"}
                    </h2>
                    <FormStatusBadge status={Number(editor.status)} />
                  </div>
                  <div className="mt-2 text-sm text-gray-400">
                    创建于 {formatDateTime(editor.createdAt)} · 更新于{" "}
                    {formatDateTime(editor.updatedAt)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving || !canCreateOrSave}
                    className="motion-button rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "保存中..." : "保存更改"}
                  </button>
                </div>
              </div>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">基础设置</h3>
                  <span className="text-xs text-gray-500">
                    已配置 {editor.fieldsSchema.length} 个字段
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <FieldLabel label="报名表标题" htmlFor="form-title" />
                    <input
                      id="form-title"
                      value={editor.title}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="例如：2026 春季招新报名表"
                      className={inputClassName()}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel label="报名说明" htmlFor="form-description" />
                    <textarea
                      id="form-description"
                      rows={4}
                      value={editor.description}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="介绍报名须知、考核方式与补充说明"
                      className={inputClassName()}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel
                      label="封面图片 URL"
                      hint="Round 1 仅支持外链图片"
                      htmlFor="cover-url"
                    />
                    <input
                      id="cover-url"
                      value={editor.coverImageUrl}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          coverImageUrl: event.target.value,
                        }))
                      }
                      placeholder="https://example.com/banner.jpg"
                      className={inputClassName()}
                    />
                  </div>

                  <div>
                    <FieldLabel label="报名人数上限" hint="留空表示不限" htmlFor="max-registrations" />
                    <input
                      id="max-registrations"
                      type="number"
                      min={1}
                      value={editor.maxRegistrations}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          maxRegistrations: event.target.value,
                        }))
                      }
                      placeholder="120"
                      className={inputClassName()}
                    />
                  </div>

                  <div>
                    <FieldLabel label="报名状态" htmlFor="form-status" />
                    <AnimatedSelect
                      id="form-status"
                      value={editor.status}
                      onChange={(value) =>
                        updateEditor((current) => ({
                          ...current,
                          status: value,
                        }))
                      }
                      options={REGISTRATION_FORM_STATUS_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                    />
                  </div>

                  <div>
                    <FieldLabel label="报名开始时间" hint="留空表示立即开始" htmlFor="start-time" />
                    <MotionDateInput
                      id="start-time"
                      type="datetime-local"
                      value={editor.startTime}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          startTime: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel label="报名截止时间" hint="留空表示长期开放" htmlFor="end-time" />
                    <MotionDateInput
                      id="end-time"
                      type="datetime-local"
                      value={editor.endTime}
                      onChange={(event) =>
                        updateEditor((current) => ({
                          ...current,
                          endTime: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

              </section>

              <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-white">字段配置</h3>
                    <p className="mt-1 text-sm text-gray-400">
                      姓名、手机号、邮箱为系统锁定字段，始终保留且必填。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addField}
                    className="motion-button rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-200 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    添加字段
                  </button>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                  <div className="space-y-3">
                    {editor.fieldsSchema.map((field, index) => {
                      const active = selectedField?.key === field.key;
                      const locked = isLockedRegistrationField(field.key);

                      return (
                        <button
                          key={field.key}
                          type="button"
                          onClick={() => setSelectedFieldKey(field.key)}
                          className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                            active
                              ? "border-primary-500/40 bg-primary-500/10"
                              : "border-gray-800 bg-gray-950/60 hover:border-gray-700 hover:bg-gray-950"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-white">
                                  {field.label}
                                </span>
                                {locked ? (
                                  <span className="rounded-full border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-[11px] text-primary-200">
                                    系统字段
                                  </span>
                                ) : null}
                                {field.required ? (
                                  <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
                                    必填
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 text-xs text-gray-500">
                                key：{field.key} · 类型：
                                {REGISTRATION_FIELD_TYPE_LABELS[field.type]}
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  moveField(field.key, "up");
                                }}
                                          className="motion-button rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-white/5"
                              >
                                上移
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  moveField(field.key, "down");
                                }}
                                          className="motion-button rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-white/5"
                              >
                                下移
                              </button>
                              {!locked ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeField(field.key);
                                  }}
                                  className="motion-button rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 transition-colors hover:bg-rose-500/20"
                                >
                                  删除
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-gray-500">
                            排序位置：#{index + 1}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-5 rounded-lg border border-gray-800 bg-gray-950/50 p-4">
                    {selectedField ? (
                      <>
                        <div>
                          <h4 className="text-sm font-semibold text-white">字段编辑</h4>
                          <p className="mt-1 text-xs text-gray-500">
                            修改当前选中字段的展示与校验属性。
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <FieldLabel label="字段名称" htmlFor="field-label" />
                            <input
                              id="field-label"
                              value={selectedField.label}
                              onChange={(event) =>
                                updateField(selectedField.key, (field) => ({
                                  ...field,
                                  label: event.target.value,
                                }))
                              }
                              className={inputClassName()}
                            />
                          </div>

                          <div>
                            <FieldLabel label="字段 key" htmlFor="field-key" />
                            <input
                              id="field-key"
                              value={selectedField.key}
                              disabled={isLockedRegistrationField(selectedField.key)}
                              onChange={(event) => {
                                const nextKey = event.target.value
                                  .trim()
                                  .toLowerCase()
                                  .replace(/\s+/g, "_");

                                updateEditor((current) => ({
                                  ...current,
                                  fieldsSchema: current.fieldsSchema.map((field) =>
                                    field.key === selectedField.key
                                      ? { ...field, key: nextKey || field.key }
                                      : field,
                                  ),
                                }));
                                setSelectedFieldKey(nextKey || selectedField.key);
                              }}
                              className={inputClassName(
                                isLockedRegistrationField(selectedField.key),
                              )}
                            />
                          </div>

                          <div>
                            <FieldLabel label="字段类型" htmlFor="field-type" />
                            <AnimatedSelect
                              id="field-type"
                              value={selectedField.type}
                              disabled={isLockedRegistrationField(selectedField.key)}
                              onChange={(value) =>
                                updateFieldType(value as RegistrationFormField["type"])
                              }
                              options={REGISTRATION_FIELD_TYPE_OPTIONS.map((option) => ({
                                value: option.value,
                                label: option.label,
                              }))}
                            />
                          </div>

                          <label className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-3 text-sm text-gray-200">
                            <input
                              type="checkbox"
                              checked={selectedField.required}
                              disabled={isLockedRegistrationField(selectedField.key)}
                              onChange={(event) =>
                                updateField(selectedField.key, (field) => ({
                                  ...field,
                                  required: event.target.checked,
                                }))
                              }
                            />
                            当前字段为必填项
                          </label>

                          <div>
                            <FieldLabel label="占位提示" htmlFor="field-placeholder" />
                            <input
                              id="field-placeholder"
                              value={selectedField.placeholder ?? ""}
                              onChange={(event) =>
                                updateField(selectedField.key, (field) => ({
                                  ...field,
                                  placeholder: event.target.value,
                                }))
                              }
                              className={inputClassName()}
                            />
                          </div>

                          <div>
                            <FieldLabel label="字段说明" htmlFor="field-description" />
                            <textarea
                              id="field-description"
                              rows={3}
                              value={selectedField.description ?? ""}
                              onChange={(event) =>
                                updateField(selectedField.key, (field) => ({
                                  ...field,
                                  description: event.target.value,
                                }))
                              }
                              className={inputClassName()}
                            />
                          </div>

              {allowManualOptions ? (
                <div>
                  <FieldLabel
                    label="选项配置"
                    hint="分别维护显示名称与提交值"
                              />
                              <div className="space-y-3">
                                {(selectedField.options ?? []).map((option, index) => (
                                  <div
                                    key={`${selectedField.key}-option-${index}`}
                                    className="motion-surface rounded-lg border border-gray-800 bg-gray-900/60 p-3"
                                  >
                                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                      <input
                                        value={option.label}
                                        onChange={(event) =>
                                          updateFieldOption(index, "label", event.target.value)
                                        }
                                        placeholder="显示名称"
                                        className={inputClassName()}
                                      />
                                      <input
                                        value={option.value}
                                        onChange={(event) =>
                                          updateFieldOption(index, "value", event.target.value)
                                        }
                                        placeholder="提交值"
                                        className={inputClassName()}
                                      />
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => moveFieldOption(index, "up")}
                                          className="rounded-md border border-gray-700 px-2 py-2 text-xs text-gray-300 transition-colors hover:bg-white/5"
                                        >
                                          上移
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => moveFieldOption(index, "down")}
                                          className="rounded-md border border-gray-700 px-2 py-2 text-xs text-gray-300 transition-colors hover:bg-white/5"
                                        >
                                          下移
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeFieldOption(index)}
                                          className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-2 text-xs text-rose-200 transition-colors hover:bg-rose-500/20"
                                        >
                                          删除
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  onClick={addFieldOption}
                                  className="motion-button rounded-lg border border-dashed border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:border-primary-400 hover:text-white"
                                >
                                  新增选项
                                </button>
                  </div>
                </div>
              ) : selectedField.type === "user_group_select" ? (
                <div className="rounded-lg border border-primary-500/20 bg-primary-500/10 px-4 py-3 text-sm text-primary-100">
                  意向组别字段的下拉选项会自动读取当前“前台展示”状态为展示的用户分组，这里无需手动维护。
                </div>
              ) : null}

                          {isFileField(selectedField.type) ? (
                            <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                              <div>
                                <FieldLabel
                                  label="最大文件大小（MB）"
                                  htmlFor="file-max-size"
                                />
                                <input
                                  id="file-max-size"
                                  type="number"
                                  min={1}
                                  value={
                                    typeof selectedField.file_config?.max_size_mb === "number"
                                      ? String(selectedField.file_config.max_size_mb)
                                      : ""
                                  }
                                  onChange={(event) =>
                                    updateFileConfig("max_size_mb", event.target.value)
                                  }
                                  className={inputClassName()}
                                />
                              </div>

                              <div>
                                <FieldLabel
                                  label="允许的文件类型"
                                  hint="逗号分隔，例如 pdf, docx"
                                  htmlFor="file-types"
                                />
                                <input
                                  id="file-types"
                                  value={
                                    Array.isArray(selectedField.file_config?.allowed_types)
                                      ? selectedField.file_config.allowed_types.join(", ")
                                      : ""
                                  }
                                  onChange={(event) =>
                                    updateFileConfig("allowed_types", event.target.value)
                                  }
                                  className={inputClassName()}
                                />
                              </div>

                              {selectedField.type === "image" ? (
                                <div>
                                  <FieldLabel
                                    label="最大上传张数"
                                    htmlFor="image-max-count"
                                  />
                                  <input
                                    id="image-max-count"
                                    type="number"
                                    min={1}
                                    value={
                                      typeof selectedField.file_config?.max_count === "number"
                                        ? String(selectedField.file_config.max_count)
                                        : ""
                                    }
                                    onChange={(event) =>
                                      updateFileConfig("max_count", event.target.value)
                                    }
                                    className={inputClassName()}
                                  />
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
                        请选择一个字段查看详情。
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">表单预览</h3>
                  <span className="text-xs text-gray-500">
                    {editor.fieldsSchema.length} 个字段 · {requiredFieldCount} 个必填
                  </span>
                </div>

                <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-950/60 p-5">
                  {editor.coverImageUrl ? (
                    <img
                      src={editor.coverImageUrl}
                      alt={editor.title}
                      className="h-40 w-full rounded-lg object-cover"
                    />
                  ) : null}

                  <div>
                    <div className="text-lg font-semibold text-white">
                      {editor.title || "未命名报名表"}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-gray-400">
                      {editor.description.trim() || "暂无报名说明"}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {editor.fieldsSchema.map((field) => (
                      <div key={`preview-${field.key}`} className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-100">
                          {field.label}
                          {field.required ? (
                            <span className="text-xs text-rose-300">必填</span>
                          ) : null}
                        </div>
                        {renderPreviewControl(field)}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </form>
          )}
        </section>
      </div>

      {createModalVisible ? (
        <ModalShell
          open={createOpen}
          title="新建报名表"
          description="先创建一张带有系统必填字段的草稿表单，后续再补全详细配置。"
          onClose={() => {
            if (creating) {
              return;
            }
            setCreateOpen(false);
          }}
        >
          <form className="space-y-4" onSubmit={handleCreateForm}>
            <div>
              <FieldLabel label="报名表标题" htmlFor="create-form-title" />
              <input
                id="create-form-title"
                value={createState.title}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="例如：2026 春季招新报名表"
                className={inputClassName()}
              />
            </div>

            <div>
              <FieldLabel label="简介说明" htmlFor="create-form-description" />
              <textarea
                id="create-form-description"
                rows={3}
                value={createState.description}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className={inputClassName()}
              />
            </div>

            <div>
              <FieldLabel
                label="封面图片 URL"
                hint="可留空"
                htmlFor="create-cover-url"
              />
              <input
                id="create-cover-url"
                value={createState.coverImageUrl}
                onChange={(event) =>
                  setCreateState((current) => ({
                    ...current,
                    coverImageUrl: event.target.value,
                  }))
                }
                placeholder="https://example.com/banner.jpg"
                className={inputClassName()}
              />
            </div>

            <div className="rounded-lg border border-primary-500/20 bg-primary-500/10 px-4 py-3 text-sm text-primary-100">
              创建后会自动附带“姓名 / 手机号 / 邮箱 / 意向组别(1) / 意向组别(2)”五个系统字段，并以草稿状态保存。
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (creating) {
                    return;
                  }
                  setCreateOpen(false);
                }}
                className="motion-button rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating}
                className="motion-button rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "创建中..." : "创建草稿"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </div>
  );
}

function toEditorState(form: RegistrationFormDetail): FormEditorState {
  return {
    id: form.id,
    title: form.title,
    description: form.description ?? "",
    coverImageUrl: form.coverImageUrl ?? "",
    fieldsSchema: cloneRegistrationFields(form.fieldsSchema),
    maxRegistrations:
      typeof form.maxRegistrations === "number" ? String(form.maxRegistrations) : "",
    startTime: toDateTimeLocalValue(form.startTime),
    endTime: toDateTimeLocalValue(form.endTime),
    status: String(form.status),
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

function buildUpdatePayload(editor: FormEditorState) {
  const maxRegistrations = editor.maxRegistrations.trim();

  return {
    title: editor.title.trim(),
    description: editor.description.trim(),
    coverImageUrl: editor.coverImageUrl.trim(),
    fieldsSchema: cloneRegistrationFields(editor.fieldsSchema),
    maxRegistrations: maxRegistrations ? Number(maxRegistrations) : null,
    startTime: editor.startTime || undefined,
    endTime: editor.endTime || undefined,
    status: Number(editor.status),
  };
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "暂无";
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

function formatSchedule(start?: string | null, end?: string | null) {
  const startText = formatDateTime(start);
  const endText = formatDateTime(end);
  if (!start && !end) {
    return "发布后立即开放";
  }
  if (start && end) {
    return `${startText} - ${endText}`;
  }
  if (start) {
    return `${startText} 起开放`;
  }
  return `${endText} 截止`;
}

function renderPreviewControl(field: RegistrationFormField) {
  const className =
    "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-400";

  if (field.type === "textarea") {
    return (
      <textarea
        rows={3}
        readOnly
        value=""
        placeholder={field.placeholder || "请输入内容"}
        className={className}
      />
    );
  }

  if (isOptionField(field.type)) {
    if (field.type === "select" || field.type === "user_group_select") {
      return (
        <select value="" disabled className={`${className} motion-select`}>
          <option value="">请选择</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        {field.options?.map((option) => (
          <label
            key={option.value}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300"
          >
            <input type={field.type === "radio" ? "radio" : "checkbox"} disabled />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (isFileField(field.type)) {
    return (
      <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800 px-3 py-6 text-center text-sm text-gray-500">
        {field.type === "image" ? "图片上传控件" : "文件上传控件"}
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
      className={className}
    />
  );
}

function getStatusMeta(status: number) {
  if (status === 1) {
    return {
      label: "已发布",
      className: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    };
  }
  if (status === 2) {
    return {
      label: "已关闭",
      className: "border border-gray-700 bg-gray-800/80 text-gray-300",
    };
  }
  return {
    label: "草稿",
    className: "border border-amber-500/20 bg-amber-500/10 text-amber-200",
  };
}

function shouldRedirectToLogin(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.message === "账号已停用")
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function handlePageError(
  error: unknown,
  navigate: ReturnType<typeof useNavigate>,
  setFlash: (state: FlashState) => void,
) {
  if (shouldRedirectToLogin(error)) {
    navigate("/login", { replace: true });
    return;
  }
  setFlash({ type: "error", message: getErrorMessage(error) });
}

function inputClassName(disabled = false) {
  return `motion-field w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
    disabled ? "cursor-not-allowed opacity-60" : ""
  }`;
}

function FieldLabel({
  label,
  hint,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-baseline gap-2 text-sm font-medium text-gray-200"
    >
      {label}
      {hint ? <span className="text-xs font-normal text-gray-500">{hint}</span> : null}
    </label>
  );
}

function FormStatusBadge({ status }: { status: number }) {
  const meta = getStatusMeta(status);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="motion-stat-surface rounded-xl border border-gray-800 bg-gray-900/70 p-5">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs text-gray-500">{hint}</div>
    </div>
  );
}

function ModalShell({
  title,
  description,
  open = true,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-state={open ? "open" : "closed"}>
      <div className="motion-dialog motion-dialog-surface w-full max-w-2xl rounded-xl border border-gray-800 bg-gray-900 shadow-2xl" data-state={open ? "open" : "closed"}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {description ? <p className="mt-1 text-sm text-gray-400">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="motion-button rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5"
          >
            关闭
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
