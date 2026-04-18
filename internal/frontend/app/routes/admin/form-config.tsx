import clock from "@iconify-icons/lucide/clock";
import fileText from "@iconify-icons/lucide/file-text";
import info from "@iconify-icons/lucide/info";
import layers from "@iconify-icons/lucide/layers";
import pencil from "@iconify-icons/lucide/pencil";
import plus from "@iconify-icons/lucide/plus";
import searchIcon from "@iconify-icons/lucide/search";
import settings from "@iconify-icons/lucide/settings";
import trash2 from "@iconify-icons/lucide/trash-2";
import x from "@iconify-icons/lucide/x";
import chevronDown from "@iconify-icons/lucide/chevron-down";
import chevronUp from "@iconify-icons/lucide/chevron-up";
import eye from "@iconify-icons/lucide/eye";
import { Icon, type IconifyIcon } from "@iconify/react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router";
import { ModalShell } from "~/components/modal-shell";
import { Notify } from "~/components/notify";
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

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const DRAWER_ANIMATION_MS = 220;
const FLASH_DURATION_MS = 3000;
const NOTIFY_ANIMATION_MS = 300;

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

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                      */
/* ------------------------------------------------------------------ */

function toEditorState(form: RegistrationFormDetail): FormEditorState {
  return {
    id: form.id,
    title: form.title,
    description: form.description ?? "",
    coverImageUrl: form.coverImageUrl ?? "",
    fieldsSchema: cloneRegistrationFields(form.fieldsSchema),
    maxRegistrations:
      typeof form.maxRegistrations === "number"
        ? String(form.maxRegistrations)
        : "",
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
    return `${startText} — ${endText}`;
  }
  if (start) {
    return `${startText} 起开放`;
  }
  return `${endText} 截止`;
}

function getStatusMeta(status: number) {
  if (status === 1) {
    return {
      label: "已发布",
      dotColor: "bg-emerald-400",
      className:
        "text-emerald-300 bg-emerald-500/10 border border-emerald-500/20",
    };
  }
  if (status === 2) {
    return {
      label: "已关闭",
      dotColor: "bg-gray-400",
      className: "text-gray-300 bg-gray-700/50 border border-gray-700",
    };
  }
  return {
    label: "草稿",
    dotColor: "bg-amber-400",
    className: "text-amber-300 bg-amber-500/10 border border-amber-500/20",
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

/* ================================================================== */
/*  Main Page Component                                               */
/* ================================================================== */

export default function FormConfigPage() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();

  /* ---- list state ---- */
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [forms, setForms] = useState<RegistrationFormListItem[]>([]);
  const [summary, setSummary] =
    useState<RegistrationFormSummary>(defaultSummary);
  const [loadingList, setLoadingList] = useState(false);

  /* ---- drawer state ---- */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editor, setEditor] = useState<FormEditorState | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const drawerOverlayRef = useRef<HTMLDivElement | null>(null);
  const drawerPanelRef = useRef<HTMLElement | null>(null);
  const drawerCloseTimerRef = useRef<number | null>(null);

  /* ---- create modal state ---- */
  const [createOpen, setCreateOpen] = useState(false);
  const [createState, setCreateState] =
    useState<CreateFormState>(defaultCreateState);
  const [creating, setCreating] = useState(false);

  /* ---- flash / notify state ---- */
  const [flash, setFlash] = useState<FlashState>(null);
  const [flashVisible, setFlashVisible] = useState(false);

  /* ---- preview drawer state ---- */
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewClosing, setPreviewClosing] = useState(false);
  const [previewFormId, setPreviewFormId] = useState<number | null>(null);
  const [previewEditor, setPreviewEditor] = useState<FormEditorState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewOverlayRef = useRef<HTMLDivElement | null>(null);
  const previewPanelRef = useRef<HTMLElement | null>(null);
  const previewCloseTimerRef = useRef<number | null>(null);

  const canCreateOrSave = currentUser.role.name !== "user";

  const selectedField = useMemo(() => {
    if (!editor) {
      return null;
    }
    return (
      (selectedFieldKey
        ? editor.fieldsSchema.find((field) => field.key === selectedFieldKey)
        : null) ?? null
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

  /* ================================================================ */
  /*  Data fetching                                                   */
  /* ================================================================ */

  useEffect(() => {
    let cancelled = false;

    async function loadForms() {
      try {
        setLoadingList(true);
        const response = await listAdminRegistrationForms({
          keyword,
          status: statusFilter === "" ? "" : Number(statusFilter),
        });
        if (!cancelled) {
          setForms(response.items);
          setSummary(response.summary);
        }
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

  /* Load detail when drawer opens */
  useEffect(() => {
    if (!drawerOpen || drawerClosing || selectedFormId === null) {
      return;
    }

    const formId = selectedFormId;
    let cancelled = false;

    async function loadDetail() {
      try {
        setDetailLoading(true);
        const detail = await getAdminRegistrationForm(formId);
        if (!cancelled) {
          const next = toEditorState(detail);
          setEditor(next);
          setSelectedFieldKey("");
        }
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setFlash);
          closeDrawer(true);
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
  }, [drawerClosing, drawerOpen, navigate, selectedFormId]);

  /* Load preview detail */
  useEffect(() => {
    if (!previewOpen || previewClosing || previewFormId === null) {
      return;
    }

    const formId = previewFormId;
    let cancelled = false;

    async function loadPreview() {
      try {
        setPreviewLoading(true);
        const detail = await getAdminRegistrationForm(formId);
        if (!cancelled) {
          setPreviewEditor(toEditorState(detail));
        }
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setFlash);
          closePreview(true);
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [previewClosing, previewOpen, navigate, previewFormId]);

  /* Drawer open animation */
  useEffect(() => {
    if (!drawerOpen || drawerClosing) {
      return;
    }
    drawerOverlayRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 180,
      easing: "ease-out",
      fill: "forwards",
    });
    drawerPanelRef.current?.animate(
      [
        { opacity: 0, transform: "translateX(32px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      {
        duration: DRAWER_ANIMATION_MS,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      },
    );
  }, [drawerClosing, drawerOpen, selectedFormId]);

  /* Preview open animation */
  useEffect(() => {
    if (!previewOpen || previewClosing) {
      return;
    }
    previewOverlayRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 180,
      easing: "ease-out",
      fill: "forwards",
    });
    previewPanelRef.current?.animate(
      [
        { opacity: 0, transform: "translateX(32px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      {
        duration: DRAWER_ANIMATION_MS,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      },
    );
  }, [previewClosing, previewOpen, previewFormId]);

  /* Flash → Notify lifecycle */
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

  /* Cleanup timers */
  useEffect(() => {
    return () => {
      if (drawerCloseTimerRef.current !== null) {
        window.clearTimeout(drawerCloseTimerRef.current);
      }
      if (previewCloseTimerRef.current !== null) {
        window.clearTimeout(previewCloseTimerRef.current);
      }
    };
  }, []);

  /* ================================================================ */
  /*  Drawer helpers                                                  */
  /* ================================================================ */

  function clearDrawerCloseTimer() {
    if (drawerCloseTimerRef.current !== null) {
      window.clearTimeout(drawerCloseTimerRef.current);
      drawerCloseTimerRef.current = null;
    }
  }

  function finishCloseDrawer() {
    clearDrawerCloseTimer();
    setDrawerClosing(false);
    setDrawerOpen(false);
    setSelectedFormId(null);
    setEditor(null);
    setSelectedFieldKey("");
  }

  function closeDrawer(immediate = false) {
    if (immediate) {
      finishCloseDrawer();
      return;
    }
    if (!drawerOpen || drawerClosing) {
      return;
    }
    clearDrawerCloseTimer();
    setDrawerClosing(true);
    drawerOverlayRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      easing: "ease-in",
      fill: "forwards",
    });
    drawerPanelRef.current?.animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: "translateX(32px)" },
      ],
      { duration: DRAWER_ANIMATION_MS, easing: "ease-in", fill: "forwards" },
    );
    drawerCloseTimerRef.current = window.setTimeout(() => {
      finishCloseDrawer();
    }, DRAWER_ANIMATION_MS);
  }

  function openDrawer(formId: number) {
    clearDrawerCloseTimer();
    setDrawerClosing(false);
    setDrawerOpen(true);
    setSelectedFormId(formId);
    setEditor(null);
    setSelectedFieldKey("");
  }

  /* Preview drawer helpers */
  function clearPreviewCloseTimer() {
    if (previewCloseTimerRef.current !== null) {
      window.clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
  }

  function finishClosePreview() {
    clearPreviewCloseTimer();
    setPreviewClosing(false);
    setPreviewOpen(false);
    setPreviewFormId(null);
    setPreviewEditor(null);
  }

  function closePreview(immediate = false) {
    if (immediate) {
      finishClosePreview();
      return;
    }
    if (!previewOpen || previewClosing) {
      return;
    }
    clearPreviewCloseTimer();
    setPreviewClosing(true);
    previewOverlayRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      easing: "ease-in",
      fill: "forwards",
    });
    previewPanelRef.current?.animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: "translateX(32px)" },
      ],
      { duration: DRAWER_ANIMATION_MS, easing: "ease-in", fill: "forwards" },
    );
    previewCloseTimerRef.current = window.setTimeout(() => {
      finishClosePreview();
    }, DRAWER_ANIMATION_MS);
  }

  function openPreview(formId: number) {
    clearPreviewCloseTimer();
    setPreviewClosing(false);
    setPreviewOpen(true);
    setPreviewFormId(formId);
    setPreviewEditor(null);
  }

  /* ================================================================ */
  /*  Editor helpers                                                  */
  /* ================================================================ */

  function updateEditor(
    updater: (current: FormEditorState) => FormEditorState,
  ) {
    setEditor((current) => (current ? updater(current) : current));
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
      const index = current.fieldsSchema.findIndex(
        (field) => field.key === key,
      );
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
      return { ...current, fieldsSchema: nextFields };
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

  /* ================================================================ */
  /*  List refresh                                                    */
  /* ================================================================ */

  async function refreshForms(_preferredId?: number | null) {
    const response = await listAdminRegistrationForms({
      keyword,
      status: statusFilter === "" ? "" : Number(statusFilter),
    });
    setForms(response.items);
    setSummary(response.summary);
  }

  /* ================================================================ */
  /*  Handlers                                                        */
  /* ================================================================ */

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    /* keyword / statusFilter are already reactive, no extra action needed */
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
        current && detail.fieldsSchema.some((field) => field.key === current)
          ? current
          : "",
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
      setCreateState(defaultCreateState);
      await refreshForms(detail.id);
      setFlash({ type: "success", message: "报名表创建成功。" });
      openDrawer(detail.id);
    } catch (error) {
      handlePageError(error, navigate, setFlash);
    } finally {
      setCreating(false);
    }
  }

  function clearFlash(immediate = false) {
    if (immediate) {
      setFlashVisible(false);
      setFlash(null);
      return;
    }
    setFlashVisible(false);
  }

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg-primary">
            表单配置
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          disabled={!canCreateOrSave}
          className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent-primary/20 transition hover:bg-accent-primary/90 hover:shadow-accent-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon icon={plus} className="h-4 w-4" />
          新建报名表
        </button>
      </div>

      {/* ---- Notify ---- */}
      {flash ? (
        <Notify
          tone={flash.type}
          title={flash.type === "success" ? "操作成功" : "操作失败"}
          message={flash.message}
          open={flashVisible}
          onClose={() => clearFlash()}
          placement="bottom-right"
        />
      ) : null}

      {/* ---- Stat cards ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="全部表单"
          value={summary.total}
          icon={layers}
          iconBg="bg-accent-primary/10"
          iconText="text-accent-primary"
          barFrom="from-accent-primary/60"
        />
        <StatCard
          label="草稿"
          value={summary.draft}
          icon={fileText}
          iconBg="bg-accent-gold/10"
          iconText="text-accent-gold"
          barFrom="from-accent-gold/60"
        />
        <StatCard
          label="已发布"
          value={summary.published}
          icon={eye}
          iconBg="bg-accent-tertiary/10"
          iconText="text-accent-tertiary"
          barFrom="from-accent-tertiary/60"
        />
        <StatCard
          label="已关闭"
          value={summary.closed}
          icon={clock}
          iconBg="bg-gray-700/30"
          iconText="text-fg-dim"
          barFrom="from-gray-500/40"
        />
      </div>

      {/* ---- Filter bar ---- */}
      <form
        onSubmit={handleSearchSubmit}
        className="rounded-2xl border border-border-subtle bg-surface-card/60 p-5 ring-1 ring-white/[0.03] backdrop-blur-sm"
      >
        <div className="mb-4 flex items-center gap-2 border-b border-border-subtle/40 pb-4">
          <Icon icon={searchIcon} className="h-4 w-4 text-fg-dim" />
          <span className="text-xs font-medium uppercase tracking-wider text-fg-dim">
            筛选条件
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-[2fr_1fr_auto]">
          <div>
            <FieldLabel label="关键词" />
            <input
              type="text"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索标题或描述"
              className={InputClassName()}
            />
          </div>
          <div>
            <FieldLabel label="状态" />
            <select
              aria-label="状态筛选"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={InputClassName()}
            >
              <option value="">全部状态</option>
              {REGISTRATION_FORM_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setStatusFilter("");
              }}
              className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm text-fg-muted transition hover:bg-white/5 hover:text-fg-primary"
            >
              重置
            </button>
          </div>
        </div>
      </form>

      {/* ---- Table ---- */}
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-card/60 shadow-xl shadow-black/20">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-dark/80 text-left text-xs tracking-wider text-fg-dim">
              <tr className="border-b border-border-subtle">
                <th className="px-5 py-4 font-medium">标题</th>
                <th className="px-5 py-4 font-medium">状态</th>
                <th className="px-5 py-4 font-medium">字段</th>
                <th className="px-5 py-4 font-medium">开放时间</th>
                <th className="px-5 py-4 font-medium">更新时间</th>
                <th className="px-5 py-4 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/60">
              {loadingList ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-sm text-fg-dim">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-accent-primary/20 border-t-accent-primary"
                      />
                      <span>正在加载表单列表...</span>
                    </div>
                  </td>
                </tr>
              ) : forms.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-sm text-fg-dim"
                  >
                    当前筛选条件下没有匹配的报名表。
                  </td>
                </tr>
              ) : (
                forms.map((form) => (
                  <tr
                    key={form.id}
                    className="transition-colors duration-150 hover:bg-white/[0.04]"
                  >
                    <td className="px-5 py-4">
                      <div>
                        <div className="font-medium text-fg-primary">
                          {form.title}
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-xs text-fg-dim">
                          {form.description?.trim() || "暂无描述"}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={form.status} />
                    </td>
                    <td className="px-5 py-4 text-fg-muted">
                      {form.fieldCount} 个字段 · {form.requiredCount} 个必填
                    </td>
                    <td className="px-5 py-4 text-fg-muted">
                      {formatSchedule(form.startTime, form.endTime)}
                    </td>
                    <td className="px-5 py-4 text-fg-muted">
                      {formatDateTime(form.updatedAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openPreview(form.id)}
                          title="预览"
                          aria-label="预览"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle text-fg-muted transition-all duration-150 hover:bg-white/[0.06] hover:text-fg-primary"
                        >
                          <Icon icon={eye} className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDrawer(form.id)}
                          title="编辑"
                          aria-label="编辑"
                          disabled={!canCreateOrSave}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle text-fg-muted transition-all duration-150 hover:bg-white/[0.06] hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Icon icon={pencil} className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Create modal ---- */}
      <ModalShell
        open={createOpen}
        title="新建报名表"
        description="创建一张带有系统必填字段的草稿表单，后续再补全详细配置。"
        onClose={() => {
          if (creating) {
            return;
          }
          setCreateOpen(false);
          setCreateState(defaultCreateState);
        }}
      >
            <form className="space-y-5" onSubmit={handleCreateForm}>
              <div>
                <FieldLabel label="报名表标题" />
                <input
                  type="text"
                  value={createState.title}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="例如：2026 春季招新报名表"
                  className={InputClassName()}
                />
              </div>

              <div>
                <FieldLabel label="简介说明" />
                <textarea
                  rows={3}
                  aria-label="简介说明"
                  value={createState.description}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className={InputClassName()}
                />
              </div>

              <div>
                <FieldLabel label="封面图片 URL" />
                <input
                  type="text"
                  value={createState.coverImageUrl}
                  onChange={(event) =>
                    setCreateState((current) => ({
                      ...current,
                      coverImageUrl: event.target.value,
                    }))
                  }
                  placeholder="https://example.com/banner.jpg（可留空）"
                  className={InputClassName()}
                />
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-4 text-sm text-accent-primary/80">
                <Icon
                  icon={info}
                  className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary"
                />
                创建后会自动附带"姓名 / 手机号 / 邮箱 / 意向组别(1) /
                意向组别(2)"五个系统字段，并以草稿状态保存。
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (creating) {
                      return;
                    }
                    setCreateOpen(false);
                    setCreateState(defaultCreateState);
                  }}
                  className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm text-fg-muted transition hover:bg-white/5 hover:text-fg-primary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? "创建中..." : "创建草稿"}
                </button>
              </div>
            </form>
      </ModalShell>

      {/* ---- Edit drawer ---- */}
      {drawerOpen ? (
        <OverlayPortal>
          <div className="fixed inset-0 z-40">
            <div
              ref={drawerOverlayRef}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => closeDrawer()}
            />
            <aside
              ref={drawerPanelRef}
              className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-border-subtle bg-surface-primary shadow-2xl ring-1 ring-white/[0.03]"
            >
              {/* Drawer header */}
              <div className="shrink-0 border-b border-border-subtle bg-surface-primary/95 backdrop-blur">
                <div className="flex items-center justify-between px-6 py-4">
                  <h2 className="text-lg font-semibold text-fg-primary">
                    编辑报名表
                  </h2>
                  <button
                    type="button"
                    onClick={() => closeDrawer()}
                    title="关闭"
                    aria-label="关闭"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim transition hover:bg-white/5 hover:text-fg-primary"
                  >
                    <Icon icon={x} className="h-4 w-4" />
                  </button>
                </div>

                {editor ? (
                  <div className="border-t border-border-subtle/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-primary/20 to-accent-secondary/10 text-sm font-bold text-accent-primary ring-1 ring-accent-primary/15">
                        <Icon icon={fileText} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-base font-semibold text-fg-primary">
                            {editor.title || "未命名报名表"}
                          </span>
                          <StatusBadge status={Number(editor.status)} />
                        </div>
                        <div className="mt-0.5 text-xs text-fg-dim">
                          创建于 {formatDateTime(editor.createdAt)} · 更新于{" "}
                          {formatDateTime(editor.updatedAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Drawer body */}
              <div className="flex-1 overflow-y-auto">
                {detailLoading || !editor ? (
                  <div className="flex flex-col items-center gap-3 py-20 text-sm text-fg-dim">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-accent-primary/20 border-t-accent-primary"
                    />
                    <span>正在加载报名表详情...</span>
                  </div>
                ) : (
                  <form
                    id="form-editor"
                    className="space-y-5 p-6"
                    onSubmit={handleSave}
                  >
                    {/* Basic settings */}
                    <DrawerSection icon={settings} title="基础设置">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <FieldLabel label="报名表标题" />
                          <input
                            type="text"
                            value={editor.title}
                            onChange={(event) =>
                              updateEditor((c) => ({
                                ...c,
                                title: event.target.value,
                              }))
                            }
                            placeholder="例如：2026 春季招新报名表"
                            className={InputClassName()}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <FieldLabel label="报名说明" />
                          <textarea
                            rows={3}
                            aria-label="报名说明"
                            value={editor.description}
                            onChange={(event) =>
                              updateEditor((c) => ({
                                ...c,
                                description: event.target.value,
                              }))
                            }
                            placeholder="介绍报名须知、考核方式与补充说明"
                            className={InputClassName()}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <FieldLabel label="封面图片 URL" />
                          <input
                            type="text"
                            value={editor.coverImageUrl}
                            onChange={(event) =>
                              updateEditor((c) => ({
                                ...c,
                                coverImageUrl: event.target.value,
                              }))
                            }
                            placeholder="https://example.com/banner.jpg"
                            className={InputClassName()}
                          />
                        </div>

                        <div>
                          <FieldLabel label="报名人数上限" />
                          <input
                            type="number"
                            min={1}
                            value={editor.maxRegistrations}
                            onChange={(event) =>
                              updateEditor((c) => ({
                                ...c,
                                maxRegistrations: event.target.value,
                              }))
                            }
                            placeholder="留空表示不限"
                            className={InputClassName()}
                          />
                        </div>

                        <div>
                          <FieldLabel label="报名状态" />
                          <select
                            aria-label="报名状态"
                            value={editor.status}
                            onChange={(event) =>
                              updateEditor((c) => ({
                                ...c,
                                status: event.target.value,
                              }))
                            }
                            className={InputClassName()}
                          >
                            {REGISTRATION_FORM_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <FieldLabel label="报名开始时间" />
                          <input
                            type="datetime-local"
                            aria-label="报名开始时间"
                            value={editor.startTime}
                            onChange={(event) =>
                              updateEditor((c) => ({
                                ...c,
                                startTime: event.target.value,
                              }))
                            }
                            className={InputClassName()}
                          />
                        </div>

                        <div>
                          <FieldLabel label="报名截止时间" />
                          <input
                            type="datetime-local"
                            aria-label="报名截止时间"
                            value={editor.endTime}
                            onChange={(event) =>
                              updateEditor((c) => ({
                                ...c,
                                endTime: event.target.value,
                              }))
                            }
                            className={InputClassName()}
                          />
                        </div>
                      </div>
                    </DrawerSection>

                    {/* Field configuration */}
                    <DrawerSection icon={layers} title="字段配置">
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-xs text-fg-dim">
                          姓名、手机号、邮箱为系统锁定字段。已配置{" "}
                          {editor.fieldsSchema.length} 个字段，
                          {requiredFieldCount} 个必填。
                        </p>
                        <button
                          type="button"
                          onClick={addField}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-fg-muted transition hover:bg-white/5 hover:text-fg-primary"
                        >
                          <Icon icon={plus} className="h-3 w-3" />
                          添加字段
                        </button>
                      </div>

                      <div className="space-y-2">
                        {editor.fieldsSchema.map((field, index) => {
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
                                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-150 ${
                                  active
                                    ? "border-accent-primary/30 bg-accent-primary/5"
                                    : "border-border-subtle/60 bg-surface-dark/30 hover:border-border-subtle hover:bg-surface-dark/60"
                                }`}
                              >
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-dark/60 text-[11px] font-semibold tabular-nums text-fg-dim ring-1 ring-white/[0.05]">
                                  {index + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-fg-primary">
                                      {field.label}
                                    </span>
                                    {locked ? (
                                      <span className="rounded-full border border-accent-primary/20 bg-accent-primary/10 px-2 py-0.5 text-[10px] font-medium text-accent-primary">
                                        系统字段
                                      </span>
                                    ) : null}
                                    {field.required ? (
                                      <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
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
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle text-fg-dim transition hover:bg-white/5 hover:text-fg-primary"
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
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle text-fg-dim transition hover:bg-white/5 hover:text-fg-primary"
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
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
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
                                <div className="mt-2 space-y-4 rounded-xl border border-accent-primary/20 bg-accent-primary/[0.03] p-4">
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
                                          updateEditor((c) => ({
                                            ...c,
                                            fieldsSchema:
                                              c.fieldsSchema.map((f) =>
                                                f.key === field.key
                                                  ? {
                                                      ...f,
                                                      key:
                                                        nextKey || f.key,
                                                    }
                                                  : f,
                                              ),
                                          }));
                                          setSelectedFieldKey(
                                            nextKey || field.key,
                                          );
                                        }}
                                        className={InputClassName(locked)}
                                      />
                                    </div>
                                    <div>
                                      <FieldLabel label="字段类型" />
                                      <select
                                        aria-label="字段类型"
                                        value={selectedField?.type ?? "text"}
                                        disabled={locked}
                                        onChange={(event) =>
                                          updateFieldType(
                                            event.target
                                              .value as RegistrationFormField["type"],
                                          )
                                        }
                                        className={InputClassName(locked)}
                                      >
                                        {REGISTRATION_FIELD_TYPE_OPTIONS.map(
                                          (option) => (
                                            <option
                                              key={option.value}
                                              value={option.value}
                                            >
                                              {option.label}
                                            </option>
                                          ),
                                        )}
                                      </select>
                                    </div>
                                    <div className="flex items-end">
                                      <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border-subtle bg-surface-dark px-3.5 py-2.5 text-sm text-fg-primary transition hover:bg-surface-dark/80">
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
                                          className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-accent-primary focus:ring-accent-primary/30"
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
                                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle text-fg-dim transition hover:bg-white/5"
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
                                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle text-fg-dim transition hover:bg-white/5"
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
                                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
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
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-subtle px-3 py-2 text-xs text-fg-muted transition hover:border-accent-primary/40 hover:text-accent-primary"
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
                                    <div className="flex items-start gap-3 rounded-xl border border-accent-primary/20 bg-accent-primary/5 p-3 text-xs text-accent-primary/80">
                                      <Icon
                                        icon={info}
                                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-primary"
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
                    </DrawerSection>
                  </form>
                )}
              </div>

              {/* Drawer footer */}
              {editor ? (
                <div className="shrink-0 border-t border-border-subtle bg-surface-primary/95 px-6 py-4 backdrop-blur">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => closeDrawer()}
                      className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm text-fg-muted transition hover:bg-white/5 hover:text-fg-primary"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      form="form-editor"
                      disabled={saving || !canCreateOrSave}
                      className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white"
                          />
                          保存中...
                        </>
                      ) : (
                        "保存更改"
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </OverlayPortal>
      ) : null}

      {/* ---- Preview drawer ---- */}
      {previewOpen ? (
        <OverlayPortal>
          <div className="fixed inset-0 z-40">
            <div
              ref={previewOverlayRef}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => closePreview()}
            />
            <aside
              ref={previewPanelRef}
              className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-border-subtle bg-surface-primary shadow-2xl ring-1 ring-white/[0.03]"
            >
              <div className="shrink-0 border-b border-border-subtle bg-surface-primary/95 px-6 py-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-fg-primary">
                    表单预览
                  </h2>
                  <button
                    type="button"
                    onClick={() => closePreview()}
                    title="关闭"
                    aria-label="关闭"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim transition hover:bg-white/5 hover:text-fg-primary"
                  >
                    <Icon icon={x} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {previewLoading || !previewEditor ? (
                  <div className="flex flex-col items-center gap-3 py-20 text-sm text-fg-dim">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-accent-primary/20 border-t-accent-primary"
                    />
                    <span>正在加载表单预览...</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {previewEditor.coverImageUrl ? (
                      <img
                        src={previewEditor.coverImageUrl}
                        alt={previewEditor.title}
                        className="h-44 w-full rounded-2xl object-cover ring-1 ring-white/10"
                      />
                    ) : null}

                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-fg-primary">
                          {previewEditor.title || "未命名报名表"}
                        </h3>
                        <StatusBadge status={Number(previewEditor.status)} />
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                        {previewEditor.description.trim() || "暂无报名说明"}
                      </p>
                      <div className="mt-3 text-xs text-fg-dim">
                        {previewEditor.fieldsSchema.length} 个字段 ·{" "}
                        {previewEditor.fieldsSchema.filter((f) => f.required).length}{" "}
                        个必填
                      </div>
                    </div>

                    <div className="space-y-4">
                      {previewEditor.fieldsSchema.map((field) => (
                        <div key={`preview-${field.key}`} className="space-y-1.5">
                          <div className="flex items-center gap-2 text-sm font-medium text-fg-primary">
                            {field.label}
                            {field.required ? (
                              <span className="text-[11px] text-rose-400">*</span>
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
                )}
              </div>
            </aside>
          </div>
        </OverlayPortal>
      ) : null}
    </div>
  );
}

/* ================================================================== */
/*  Preview control renderer                                          */
/* ================================================================== */

function renderPreviewControl(field: RegistrationFormField) {
  const cls =
    "w-full rounded-xl border border-border-subtle bg-surface-dark px-3.5 py-2.5 text-sm text-fg-muted placeholder:text-fg-dim/60";

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
        <select value="" disabled aria-label={field.label} className={cls}>
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
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-dark px-3 py-2 text-sm text-fg-muted"
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
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-subtle bg-surface-dark/50 px-4 py-8 text-sm text-fg-dim">
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

/* ================================================================== */
/*  Shared UI primitives (matching users.tsx design language)          */
/* ================================================================== */

function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

function InputClassName(disabled = false) {
  return `w-full rounded-xl border border-border-subtle bg-surface-dark px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim/60 transition focus:border-accent-primary/60 focus:ring-1 focus:ring-accent-primary/20 focus:outline-none ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
}

function FieldLabel({ label }: { label: string }) {
  return (
    <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-fg-dim">
      {label}
    </label>
  );
}

function StatusBadge({ status }: { status: number }) {
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

function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconText,
  barFrom,
}: {
  label: string;
  value: number;
  icon: IconifyIcon;
  iconBg: string;
  iconText: string;
  barFrom: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card/80 backdrop-blur-sm transition hover:border-gray-700">
      <div className={`h-0.5 bg-gradient-to-r ${barFrom} to-transparent`} />
      <div className="p-5">
        <div
          className={`absolute right-4 top-5 flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon icon={icon} className={`h-5 w-5 ${iconText}`} />
        </div>
        <div className="text-xs font-medium uppercase tracking-wider text-fg-dim">
          {label}
        </div>
        <div className="mt-3 font-mono text-3xl font-semibold tabular-nums text-fg-primary">
          {value}
        </div>
      </div>
    </div>
  );
}

function DrawerSection({
  icon,
  title,
  children,
}: {
  icon: IconifyIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card/60 backdrop-blur-sm">
      <div className="flex items-center gap-2.5 border-b border-border-subtle/60 px-5 py-3.5">
        <Icon icon={icon} className="h-4 w-4 text-fg-dim" />
        <h3 className="text-sm font-medium text-fg-muted">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}
