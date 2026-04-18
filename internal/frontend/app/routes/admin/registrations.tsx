import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router";
import { ModalShell } from "~/components/modal-shell";
import { ApiError, buildApiUrl } from "~/lib/api-client";
import {
  deleteAdminRegistration,
  getAdminRegistration,
  listAdminRegistrations,
  reviewAdminRegistration,
  type RegistrationDetail,
  type RegistrationFileMeta,
  type RegistrationGroupRef,
  type RegistrationListItem,
  type RegistrationPagination,
  type RegistrationReviewerRef,
  type RegistrationSummary,
} from "~/lib/registrations-client";
import {
  listAdminRegistrationForms,
  type RegistrationFormField,
  type RegistrationFormListItem,
} from "~/lib/registration-forms-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [
    { title: "报名列表 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 报名管理" },
  ];
}

type FlashState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type DeleteTarget = {
  id: number;
  label: string;
};

type ImagePreviewState = {
  fileName: string;
  fileSize: number;
  fileUrl: string;
};

const defaultSummary: RegistrationSummary = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
};

const defaultPagination: RegistrationPagination = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
};

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "0", label: "待审核" },
  { value: "1", label: "已通过" },
  { value: "2", label: "已拒绝" },
  { value: "3", label: "已取消" },
];

/* ────────────────────────────────────────────────────── */
/*  SVG Icons                                             */
/* ────────────────────────────────────────────────────── */

function IconSearch() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function IconForm() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────── */
/*  Main Page Component                                   */
/* ────────────────────────────────────────────────────── */

export default function RegistrationsPage() {
  useOutletContext<DashboardLayoutOutletContext>();
  const navigate = useNavigate();

  const [keywordInput, setKeywordInput] = useState("");
  const [statusFilterInput, setStatusFilterInput] = useState("");
  const [formIdFilterInput, setFormIdFilterInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formIdFilter, setFormIdFilter] = useState("");
  const [page, setPage] = useState(defaultPagination.page);
  const [pageSize, setPageSize] = useState(defaultPagination.pageSize);
  const [forms, setForms] = useState<RegistrationFormListItem[]>([]);
  const [summary, setSummary] = useState<RegistrationSummary>(defaultSummary);
  const [pagination, setPagination] = useState<RegistrationPagination>(defaultPagination);
  const [items, setItems] = useState<RegistrationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailClosing, setDetailClosing] = useState(false);
  const detailCloseTimerRef = useRef<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeRegistrationId, setActiveRegistrationId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RegistrationDetail | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<ImagePreviewState | null>(null);
  const nextTableLoadMinimumMsRef = useRef(0);

  const extraSubmittedFields = useMemo(() => {
    if (!detail) {
      return [];
    }
    const schemaKeys = new Set(detail.fieldsSchema.map((field) => field.key));
    return Object.entries(detail.formData).filter(([key]) => !schemaKeys.has(key));
  }, [detail]);

  useEffect(() => {
    let cancelled = false;

    async function loadForms() {
      try {
        const response = await listAdminRegistrationForms();
        if (!cancelled) {
          setForms(response.items);
        }
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setFlash);
        }
      }
    }

    void loadForms();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    async function loadRegistrations() {
      const startedAt = Date.now();
      const minimumLoadingMs = nextTableLoadMinimumMsRef.current;
      nextTableLoadMinimumMsRef.current = 0;

      try {
        setLoading(true);
        setFlash(null);
        const response = await listAdminRegistrations({
          page,
          pageSize,
          keyword,
          status: statusFilter === "" ? "" : Number(statusFilter),
          formId: formIdFilter === "" ? "" : Number(formIdFilter),
        });
        if (cancelled) {
          return;
        }
        setItems(response.items);
        setSummary(response.summary);
        setPagination(response.pagination);
        if (response.pagination.page !== page) {
          setPage(response.pagination.page);
        }
        if (response.pagination.pageSize !== pageSize) {
          setPageSize(response.pagination.pageSize);
        }
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setFlash);
          setItems([]);
          setSummary(defaultSummary);
          setPagination((current) => ({
            ...current,
            page,
            pageSize,
            total: 0,
            totalPages: 0,
          }));
        }
      } finally {
        const remainingMs = minimumLoadingMs - (Date.now() - startedAt);
        if (remainingMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingMs));
        }
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRegistrations();

    return () => {
      cancelled = true;
    };
  }, [formIdFilter, keyword, navigate, page, pageSize, statusFilter]);

  useEffect(() => {
    if (!detailOpen || activeRegistrationId === null) {
      setDetail(null);
      return;
    }

    const registrationId = activeRegistrationId;
    let cancelled = false;

    async function loadDetail() {
      try {
        setDetailLoading(true);
        const nextDetail = await getAdminRegistration(registrationId);
        if (!cancelled) {
          setDetail(nextDetail);
        }
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setFlash);
          setDetail(null);
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
  }, [activeRegistrationId, detailOpen, navigate]);

  function openDetail(registrationId: number) {
    if (detailCloseTimerRef.current !== null) {
      window.clearTimeout(detailCloseTimerRef.current);
      detailCloseTimerRef.current = null;
    }
    setDetailClosing(false);
    setActiveRegistrationId(registrationId);
    setDetailOpen(true);
  }

  function closeDetail() {
    if (!detailOpen || detailClosing) return;
    setDetailClosing(true);
    setPreviewImage(null);
    if (detailCloseTimerRef.current !== null) {
      window.clearTimeout(detailCloseTimerRef.current);
    }
    detailCloseTimerRef.current = window.setTimeout(() => {
      setDetailOpen(false);
      setDetailClosing(false);
      setActiveRegistrationId(null);
      setDetail(null);
      detailCloseTimerRef.current = null;
    }, 250);
  }

  function openImagePreview(file: RegistrationFileMeta) {
    setPreviewImage({
      fileName: file.file_name,
      fileSize: file.file_size,
      fileUrl: buildApiUrl(file.file_url),
    });
  }

  function closeImagePreview() {
    setPreviewImage(null);
  }

  function applyFilters() {
    nextTableLoadMinimumMsRef.current = 500;
    const nextKeyword = keywordInput.trim();
    setKeywordInput(nextKeyword);
    setKeyword(nextKeyword);
    setStatusFilter(statusFilterInput);
    setFormIdFilter(formIdFilterInput);
    setPage(1);
  }

  function resetFilters() {
    nextTableLoadMinimumMsRef.current = 500;
    setKeywordInput("");
    setStatusFilterInput("");
    setFormIdFilterInput("");
    setKeyword("");
    setStatusFilter("");
    setFormIdFilter("");
    setPage(1);
  }

  async function handleReview(registrationId: number, decision: "approve" | "reject") {
    try {
      setReviewingId(registrationId);
      setFlash(null);
      const nextDetail = await reviewAdminRegistration(registrationId, { decision });
      if (detailOpen && activeRegistrationId === registrationId) {
        setDetail(nextDetail);
      }

      const response = await listAdminRegistrations({
        page,
        pageSize,
        keyword,
        status: statusFilter === "" ? "" : Number(statusFilter),
        formId: formIdFilter === "" ? "" : Number(formIdFilter),
      });
      setSummary(response.summary);
      setItems(response.items);
      setPagination(response.pagination);
      if (response.pagination.page !== page) {
        setPage(response.pagination.page);
      }
      if (response.pagination.pageSize !== pageSize) {
        setPageSize(response.pagination.pageSize);
      }
      setFlash({
        type: "success",
        message: decision === "approve" ? "审核已通过。" : "审核已拒绝。",
      });
    } catch (error) {
      handlePageError(error, navigate, setFlash);
    } finally {
      setReviewingId(null);
    }
  }

  function openDeleteModal(target: {
    id: number;
    contactName?: string | null;
    formTitle: string;
  }) {
    setDeleteTarget({
      id: target.id,
      label: buildRegistrationDeleteLabel(target.contactName, target.formTitle),
    });
  }

  async function handleDeleteRegistration() {
    if (!deleteTarget) {
      return;
    }

    try {
      setDeletingId(deleteTarget.id);
      setFlash(null);
      await deleteAdminRegistration(deleteTarget.id);

      if (activeRegistrationId === deleteTarget.id) {
        closeDetail();
      }

      const response = await listAdminRegistrations({
        page,
        pageSize,
        keyword,
        status: statusFilter === "" ? "" : Number(statusFilter),
        formId: formIdFilter === "" ? "" : Number(formIdFilter),
      });
      setSummary(response.summary);
      setItems(response.items);
      setPagination(response.pagination);
      if (response.pagination.page !== page) {
        setPage(response.pagination.page);
      }
      if (response.pagination.pageSize !== pageSize) {
        setPageSize(response.pagination.pageSize);
      }
      setFlash({ type: "success", message: "报名记录已删除。" });
      setDeleteTarget(null);
    } catch (error) {
      handlePageError(error, navigate, setFlash);
    } finally {
      setDeletingId(null);
    }
  }

  const hasActiveFilters = keyword !== "" || statusFilter !== "" || formIdFilter !== "";

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-400">
          <IconClipboard />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-fg-primary">报名列表</h1>
          <p className="mt-0.5 text-sm text-fg-dim">
            查看所有报名记录，支持按状态、关键字和报名表筛选，并按页浏览结果
          </p>
        </div>
      </div>

      {/* ── Flash message ── */}
      {flash ? (
        <div
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
            flash.type === "success"
              ? "border-accent-tertiary/20 bg-accent-tertiary/10 text-emerald-200"
              : "border-rose-500/20 bg-rose-500/10 text-rose-200"
          }`}
        >
          {flash.type === "success" ? (
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          )}
          {flash.message}
        </div>
      ) : null}

      {/* ── Summary cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="总报名数"
          value={summary.total}
          iconColor="text-primary-400"
          iconBg="bg-primary-500/15"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          }
        />
        <SummaryCard
          label="待审核"
          value={summary.pending}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/15"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <SummaryCard
          label="已通过"
          value={summary.approved}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/15"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <SummaryCard
          label="已拒绝"
          value={summary.rejected}
          iconColor="text-rose-400"
          iconBg="bg-rose-500/15"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <SummaryCard
          label="已取消"
          value={summary.cancelled}
          iconColor="text-fg-dim"
          iconBg="bg-gray-500/15"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
      </div>

      {/* ── Filters ── */}
      <section className="rounded-xl border border-border-subtle bg-surface-card p-4">
        <div className="flex items-center gap-2 mb-3 text-xs font-medium uppercase tracking-wider text-fg-dim">
          <IconFilter />
          <span>筛选条件</span>
          {hasActiveFilters && (
            <span className="ml-1 rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-semibold text-primary-400">
              已筛选
            </span>
          )}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_200px_220px_auto]">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-fg-dim">
              <IconSearch />
            </div>
            <input
              value={keywordInput}
              onChange={(event) => {
                setKeywordInput(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyFilters();
                }
              }}
              placeholder="搜索姓名、手机号、邮箱或报名表..."
              className="w-full rounded-lg border border-border-subtle bg-surface-light pl-9 pr-3 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 transition-colors"
            />
          </div>
          <select
            value={statusFilterInput}
            onChange={(event) => {
              setStatusFilterInput(event.target.value);
            }}
            className="w-full rounded-lg border border-border-subtle bg-surface-light px-3 py-2.5 text-sm text-fg-primary focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 transition-colors"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={formIdFilterInput}
            onChange={(event) => {
              setFormIdFilterInput(event.target.value);
            }}
            className="w-full rounded-lg border border-border-subtle bg-surface-light px-3 py-2.5 text-sm text-fg-primary focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 transition-colors"
          >
            <option value="">全部报名表</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.title}
              </option>
            ))}
          </select>
          <div className="flex gap-2 lg:justify-end">
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-400 lg:flex-none"
            >
              <IconSearch />
              搜索
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-surface-light px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-white/5 hover:text-fg-primary lg:flex-none"
            >
              <IconRefresh />
              重置
            </button>
          </div>
        </div>
      </section>

      {/* ── Data table ── */}
      <section className="overflow-hidden rounded-xl border border-border-subtle bg-surface-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-dark/60">
                {[
                  { title: "姓名", align: "left" },
                  { title: "手机号", align: "left" },
                  { title: "邮箱", align: "left" },
                  { title: "意向组别(1)", align: "left" },
                  { title: "组别(1)状态", align: "left" },
                  { title: "意向组别(2)", align: "left" },
                  { title: "组别(2)状态", align: "left" },
                  { title: "报名表", align: "left" },
                  { title: "状态", align: "left" },
                  { title: "提交时间", align: "left" },
                  { title: "操作", align: "right" },
                ].map((col) => (
                  <th
                    key={col.title}
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-fg-dim ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 animate-pulse rounded bg-gray-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-fg-dim">
                      <svg className="w-10 h-10 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                      <span className="text-sm">当前筛选条件下暂无报名记录</span>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-fg-primary">{item.contactName ?? <span className="text-fg-dim">未填写</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-fg-muted">{item.contactPhone ?? <span className="text-fg-dim">未填写</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-fg-muted">{item.contactEmail ?? <span className="text-fg-dim">未填写</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-fg-muted">{registrationGroupLabel(item.group1)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5"><StatusBadge status={item.group1Status} /></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-fg-muted">{registrationGroupLabel(item.group2)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5"><StatusBadge status={item.group2Status} /></td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="inline-flex rounded-md bg-surface-light px-2 py-0.5 text-xs font-medium text-fg-muted">{item.formTitle}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5"><StatusBadge status={item.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-fg-dim text-xs">{formatDateTime(item.submittedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <ActionButton
                          title="通过"
                          onClick={() => void handleReview(item.id, "approve")}
                          disabled={!item.canApprove || reviewingId === item.id}
                          variant="approve"
                        >
                          <IconCheck />
                        </ActionButton>
                        <ActionButton
                          title="拒绝"
                          onClick={() => void handleReview(item.id, "reject")}
                          disabled={!item.canReject || reviewingId === item.id}
                          variant="reject"
                        >
                          <IconX />
                        </ActionButton>
                        <ActionButton
                          title="删除"
                          onClick={() => openDeleteModal(item)}
                          disabled={deletingId === item.id}
                          variant="delete"
                        >
                          <IconTrash />
                        </ActionButton>
                        <ActionButton
                          title="详情"
                          onClick={() => openDetail(item.id)}
                          variant="default"
                        >
                          <IconEye />
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && items.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border-subtle bg-surface-dark/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-fg-dim">
              第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页，共 {pagination.total} 条记录
            </div>
            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(event) => {
                  setPage(1);
                  setPageSize(Number(event.target.value));
                }}
                className="rounded-lg border border-border-subtle bg-surface-dark px-3 py-2 text-sm text-fg-muted"
              >
                {[10, 20, 50].map((value) => (
                  <option key={value} value={value}>
                    {value} / 页
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-white/5 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                上一页
              </button>
              <span className="rounded-lg bg-accent-primary/10 px-2.5 py-1 text-xs font-medium text-accent-primary">
                {pagination.page}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || pagination.totalPages === 0}
                onClick={() =>
                  setPage((current) => Math.min(current + 1, Math.max(pagination.totalPages, 1)))
                }
                className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-white/5 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Detail drawer ── */}
      {detailOpen ? (
        <OverlayPortal>
          <div className="fixed inset-0 z-40 lg:left-64">
            {/* Backdrop */}
            <div
              className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${
                detailClosing ? "animate-drawer-backdrop-out" : "animate-drawer-backdrop-in"
              }`}
              onClick={closeDetail}
            />

            {/* Drawer panel */}
            <aside className={`absolute inset-y-0 left-0 flex w-full max-w-2xl flex-col bg-surface-primary shadow-2xl shadow-black/40 ${
              detailClosing ? "animate-drawer-slide-out" : "animate-drawer-slide-in"
            }`}>
              {detailLoading ? (
                <DrawerSkeleton onClose={closeDetail} />
              ) : !detail ? (
                <DrawerEmpty onClose={closeDetail} />
              ) : (
                <>
                  {/* ── Header: profile hero ── */}
                  <div className="relative shrink-0 border-b border-border-subtle bg-surface-card">
                    {/* Decorative gradient strip */}
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 via-accent-secondary to-accent-tertiary" />

                    <div className="flex items-start gap-4 px-6 pt-5 pb-4">
                      {/* Avatar */}
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-500/15 text-xl font-bold text-primary-400">
                        {(detail.contactName?.trim()?.[0] ?? "?").toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <h2 className="truncate text-lg font-bold text-fg-primary">
                            {detail.contactName?.trim() || "未填写姓名"}
                          </h2>
                          <StatusBadge status={detail.status} />
                        </div>

                        {/* Contact row */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
                          {detail.contactPhone ? (
                            <span className="inline-flex items-center gap-1.5">
                              <IconPhone />
                              {detail.contactPhone}
                            </span>
                          ) : null}
                          {detail.contactEmail ? (
                            <span className="inline-flex items-center gap-1.5">
                              <IconMail />
                              {detail.contactEmail}
                            </span>
                          ) : null}
                        </div>

                        {/* Meta tags row */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-fg-dim">
                          <span className="inline-flex items-center gap-1 rounded-md bg-surface-light px-2 py-0.5 font-medium text-fg-muted">
                            <IconDocument />
                            {detail.formTitle}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <IconClock />
                            {formatDateTime(detail.submittedAt)}
                          </span>
                          {detail.updatedAt && detail.updatedAt !== detail.submittedAt ? (
                            <span className="inline-flex items-center gap-1">
                              <IconRefresh />
                              更新于 {formatDateTime(detail.updatedAt)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Close button */}
                      <button
                        type="button"
                        title="关闭"
                        onClick={closeDetail}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-white/5 hover:text-fg-primary"
                      >
                        <IconClose />
                      </button>
                    </div>
                  </div>

                  {/* ── Scrollable body ── */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="space-y-5 px-6 py-5">

                      {/* ── Group comparison cards ── */}
                      <section>
                        <DrawerSectionLabel icon={<IconGrid />}>组别志愿</DrawerSectionLabel>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <GroupCard
                            label="第一志愿"
                            groupName={registrationGroupLabel(detail.group1)}
                            status={detail.group1Status}
                            accent="primary"
                          />
                          <GroupCard
                            label="第二志愿"
                            groupName={registrationGroupLabel(detail.group2)}
                            status={detail.group2Status}
                            accent="secondary"
                          />
                        </div>
                      </section>

                      {/* ── Review timeline ── */}
                      <section>
                        <DrawerSectionLabel icon={<IconHistory />}>审核记录</DrawerSectionLabel>
                        <div className="space-y-3">
                          <ReviewTimelineEntry
                            label="第一志愿审核"
                            status={detail.group1Status}
                            reviewer={detail.reviewer1}
                            reviewedAt={detail.reviewedAt1}
                            remark={detail.reviewRemark1}
                          />
                          <ReviewTimelineEntry
                            label="第二志愿审核"
                            status={detail.group2Status}
                            reviewer={detail.reviewer2}
                            reviewedAt={detail.reviewedAt2}
                            remark={detail.reviewRemark2}
                          />
                        </div>
                      </section>

                      {/* ── Form fields ── */}
                      <section>
                        <DrawerSectionLabel icon={<IconForm />}>
                          表单内容
                          <span className="ml-1.5 text-[11px] font-normal text-fg-dim">
                            ({detail.fieldsSchema.length} 个字段)
                          </span>
                        </DrawerSectionLabel>
                        <div className="space-y-2.5">
                          {detail.fieldsSchema.map((field) => (
                            <div
                              key={field.key}
                              className="rounded-lg border border-border-subtle bg-surface-card"
                            >
                              <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
                                <span className="text-sm font-medium text-fg-primary">{field.label}</span>
                                {field.required ? (
                                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                                    必填
                                  </span>
                                ) : null}
                                <span className="ml-auto text-[11px] font-mono text-fg-dim">{field.key}</span>
                              </div>
                              <div className="px-4 py-3">
                          {renderSubmittedFieldValue(
                            field,
                            detail.formData[field.key],
                            openImagePreview,
                          )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* ── Extra submitted fields ── */}
                      {extraSubmittedFields.length > 0 ? (
                        <section>
                          <DrawerSectionLabel icon={<IconMore />}>其他已提交字段</DrawerSectionLabel>
                          <div className="space-y-2.5">
                            {extraSubmittedFields.map(([key, value]) => (
                              <div
                                key={key}
                                className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3"
                              >
                                <div className="text-xs font-medium text-fg-dim mb-1.5">{key}</div>
                                <div className="text-sm text-fg-primary">
                                  {renderUnknownValue(value)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  </div>

                  {/* ── Sticky action bar ── */}
                  <div className="shrink-0 border-t border-border-subtle bg-surface-card px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="mr-auto text-xs font-medium text-fg-dim">审核操作</span>
                      <button
                        type="button"
                        onClick={() => void handleReview(detail.id, "approve")}
                        disabled={!detail.canApprove || reviewingId === detail.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <IconCheck /> 通过
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReview(detail.id, "reject")}
                        disabled={!detail.canReject || reviewingId === detail.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <IconX /> 拒绝
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteModal(detail)}
                        disabled={deletingId === detail.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <IconTrash /> 删除
                      </button>
                    </div>
                  </div>
                </>
              )}
            </aside>
          </div>
        </OverlayPortal>
      ) : null}

      <ImagePreviewModal preview={previewImage} onClose={closeImagePreview} />

      {/* ── Delete confirmation modal ── */}
      <ModalShell
        open={deleteTarget !== null}
        title="确认删除"
        headerAccent={
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-400">
            <IconWarning />
          </div>
        }
        onClose={() => {
          if (deleteTarget && deletingId === deleteTarget.id) return;
          setDeleteTarget(null);
        }}
        widthClass="max-w-md"
        panelClassName="rounded-xl border border-border-subtle bg-surface-card shadow-2xl"
        backdropClassName="bg-black/70 backdrop-blur-sm"
      >
        {deleteTarget ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3.5 text-sm leading-relaxed text-red-200/90">
              即将硬删除 <span className="font-semibold text-red-200">{deleteTarget.label}</span> 的报名记录，关联上传文件也会一并清理，删除后不可恢复。
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
                className="rounded-lg border border-border-subtle bg-surface-light px-4 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-white/5 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteRegistration()}
                disabled={deletingId === deleteTarget.id}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === deleteTarget.id ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    删除中...
                  </>
                ) : (
                  "确认删除"
                )}
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}

/* ────────────────────────────────────────────────────── */
/*  Rendering Helpers                                     */
/* ────────────────────────────────────────────────────── */

function renderSubmittedFieldValue(
  field: RegistrationFormField,
  value: unknown,
  onPreviewImage: (file: RegistrationFileMeta) => void,
) {
  if (field.type === "image") {
    const files = asFileMetaList(value);
    if (!files.length) {
      return <EmptyValue />;
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {files.map((file, index) => (
          <button
            type="button"
            key={`${file.file_url}-${index}`}
            onClick={() => onPreviewImage(file)}
            className="group overflow-hidden rounded-lg border border-border-subtle bg-surface-dark text-left transition-all hover:border-primary-400/40 hover:shadow-lg hover:shadow-primary-500/5"
          >
            <img
              src={buildApiUrl(file.file_url)}
              alt={file.file_name}
              className="h-36 w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
            <div className="space-y-0.5 px-3 py-2.5">
              <div className="truncate text-sm font-medium text-fg-primary">{file.file_name}</div>
              <div className="flex items-center justify-between gap-3 text-xs text-fg-dim">
                <span>{formatFileSize(file.file_size)}</span>
                <span className="text-primary-300 transition-colors group-hover:text-primary-200">
                  点击预览
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  if (field.type === "file") {
    const file = asSingleFileMeta(value);
    if (!file) {
      return <EmptyValue />;
    }
    return (
      <a
        href={buildApiUrl(file.file_url)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-dark px-4 py-2.5 text-sm text-fg-primary transition-all hover:border-primary-400/40 hover:text-white"
      >
        <svg className="w-4 h-4 shrink-0 text-fg-dim" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <span className="truncate">{file.file_name}</span>
        <span className="text-xs text-fg-dim">{formatFileSize(file.file_size)}</span>
      </a>
    );
  }

  if (Array.isArray(value)) {
    const values = value
      .map((item) => resolveFieldOptionLabel(field, String(item).trim()))
      .filter(Boolean);
    if (!values.length) {
      return <EmptyValue />;
    }
    return <span className="text-sm text-fg-primary">{values.join("、")}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-sm text-fg-primary">{resolveFieldOptionLabel(field, String(value))}</span>;
  }

  if (typeof value === "string" && value.trim()) {
    return (
      <span className="whitespace-pre-wrap text-sm text-fg-primary">
        {resolveFieldOptionLabel(field, value.trim())}
      </span>
    );
  }

  return <EmptyValue />;
}

function renderUnknownValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return (
    <pre className="overflow-x-auto rounded-lg bg-surface-dark p-3 text-xs text-fg-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/* ────────────────────────────────────────────────────── */
/*  Data Helpers                                          */
/* ────────────────────────────────────────────────────── */

function asSingleFileMeta(value: unknown): RegistrationFileMeta | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<RegistrationFileMeta>;
  if (
    typeof candidate.file_name !== "string" ||
    typeof candidate.file_url !== "string" ||
    typeof candidate.file_size !== "number"
  ) {
    return null;
  }
  return candidate as RegistrationFileMeta;
}

function asFileMetaList(value: unknown): RegistrationFileMeta[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asSingleFileMeta(item))
    .filter((item): item is RegistrationFileMeta => item !== null);
}

function registrationStatusLabel(status: number) {
  switch (status) {
    case 1:
      return "已通过";
    case 2:
      return "已拒绝";
    case 3:
      return "已取消";
    default:
      return "待审核";
  }
}

function resolveFieldOptionLabel(field: RegistrationFormField, rawValue: string) {
  if (!rawValue) {
    return rawValue;
  }

  return (
    field.options?.find((option) => option.value === rawValue)?.label ??
    rawValue
  );
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

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

function registrationGroupLabel(group?: RegistrationGroupRef | null) {
  return group?.name?.trim() || "未填写";
}

function registrationReviewerLabel(reviewer?: RegistrationReviewerRef | null) {
  if (!reviewer) {
    return "未审核";
  }
  return reviewer.name?.trim() || reviewer.email || `#${reviewer.id}`;
}

function buildRegistrationDeleteLabel(contactName: string | null | undefined, formTitle: string) {
  const trimmedName = contactName?.trim();
  if (trimmedName) {
    return `${trimmedName} / ${formTitle}`;
  }
  return formTitle;
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

/* ────────────────────────────────────────────────────── */
/*  UI Components                                         */
/* ────────────────────────────────────────────────────── */

function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}

function ImagePreviewModal({
  preview,
  onClose,
}: {
  preview: ImagePreviewState | null;
  onClose: () => void;
}) {
  const open = preview !== null;
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const snapshotRef = useRef<ImagePreviewState | null>(preview);

  if (preview) {
    snapshotRef.current = preview;
  }

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(raf);
    }
    if (!mounted) return;
    setVisible(false);
    const id = window.setTimeout(() => setMounted(false), 200);
    return () => window.clearTimeout(id);
  }, [open, mounted]);

  if (!mounted) return null;
  const snap = snapshotRef.current;
  if (!snap) return null;

  const state = visible ? "open" : "closed";

  return (
    <OverlayPortal>
      <div
        data-state={state}
        className="modal-backdrop fixed inset-0 z-[60] bg-black/80 p-4 backdrop-blur-sm sm:p-6"
        onClick={onClose}
      >
        <div
          data-state={state}
          className="modal-panel mx-auto flex h-full w-full max-w-6xl flex-col gap-4"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-card/95 px-4 py-3 shadow-2xl">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-fg-primary">{snap.fileName}</div>
              <div className="mt-0.5 text-xs text-fg-dim">{formatFileSize(snap.fileSize)}</div>
            </div>
            <button
              type="button"
              title="关闭预览"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-white/5 hover:text-fg-primary"
            >
              <IconClose />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 shadow-2xl sm:p-6">
            <img
              src={snap.fileUrl}
              alt={snap.fileName}
              className="max-h-full w-auto max-w-full rounded-xl border border-white/10 bg-surface-dark object-contain shadow-2xl"
            />
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

function DrawerSectionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-dim">
      <span className="text-fg-muted">{icon}</span>
      <span>{children}</span>
      <span className="ml-1 h-px flex-1 bg-border-subtle" />
    </div>
  );
}

function DrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <>
      {/* Skeleton header */}
      <div className="shrink-0 border-b border-border-subtle bg-surface-card px-6 pt-5 pb-4">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-gray-800" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-5 w-36 animate-pulse rounded bg-gray-800" />
            <div className="h-3 w-48 animate-pulse rounded bg-gray-800" />
            <div className="flex gap-2">
              <div className="h-5 w-20 animate-pulse rounded-md bg-gray-800" />
              <div className="h-5 w-32 animate-pulse rounded-md bg-gray-800" />
            </div>
          </div>
          <button
            type="button"
            title="关闭"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-white/5 hover:text-fg-primary"
          >
            <IconClose />
          </button>
        </div>
      </div>
      {/* Skeleton body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Group cards skeleton */}
        <div>
          <div className="mb-3 h-3 w-20 animate-pulse rounded bg-gray-800" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl border border-border-subtle bg-surface-card p-4 space-y-3">
                <div className="h-3 w-16 animate-pulse rounded bg-gray-800" />
                <div className="h-5 w-24 animate-pulse rounded bg-gray-800" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-gray-800" />
              </div>
            ))}
          </div>
        </div>
        {/* Timeline skeleton */}
        <div>
          <div className="mb-3 h-3 w-20 animate-pulse rounded bg-gray-800" />
          {[0, 1].map((i) => (
            <div key={i} className="mb-3 rounded-lg border border-border-subtle bg-surface-card p-4 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-gray-800" />
              <div className="h-3 w-48 animate-pulse rounded bg-gray-800" />
            </div>
          ))}
        </div>
        {/* Fields skeleton */}
        <div>
          <div className="mb-3 h-3 w-20 animate-pulse rounded bg-gray-800" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="mb-2.5 rounded-lg border border-border-subtle bg-surface-card p-4 space-y-2">
              <div className="h-4 w-28 animate-pulse rounded bg-gray-800" />
              <div className="h-3 w-full animate-pulse rounded bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function DrawerEmpty({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
        <h2 className="text-base font-semibold text-fg-primary">报名详情</h2>
        <button
          type="button"
          title="关闭"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-white/5 hover:text-fg-primary"
        >
          <IconClose />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-fg-dim">
        <svg className="w-14 h-14 text-gray-800" fill="none" viewBox="0 0 24 24" strokeWidth={0.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <span className="text-sm">暂无可展示的报名详情</span>
      </div>
    </>
  );
}

function GroupCard({
  label,
  groupName,
  status,
  accent,
}: {
  label: string;
  groupName: string;
  status: number;
  accent: "primary" | "secondary";
}) {
  const accentColor = accent === "primary" ? "text-primary-400" : "text-accent-secondary";
  const accentBorder = accent === "primary" ? "border-primary-500/20" : "border-accent-secondary/20";

  return (
    <div className={`rounded-xl border bg-surface-card p-4 ${accentBorder}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${accentColor}`}>
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-fg-primary">{groupName}</div>
      <div className="mt-2.5">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function ReviewTimelineEntry({
  label,
  status,
  reviewer,
  reviewedAt,
  remark,
}: {
  label: string;
  status: number;
  reviewer?: RegistrationReviewerRef | null;
  reviewedAt?: string | null;
  remark?: string | null;
}) {
  const dotColor =
    status === 1 ? "bg-emerald-400" : status === 2 ? "bg-rose-400" : "bg-gray-600";
  const hasContent = !!reviewer || !!reviewedAt;

  return (
    <div className="relative flex gap-3 pl-1">
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor} ring-2 ring-surface-primary`} />
        <span className="w-px flex-1 bg-border-subtle" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-4">
        <div className="text-sm font-medium text-fg-primary">{label}</div>

        {hasContent ? (
          <div className="mt-1.5 rounded-lg border border-border-subtle bg-surface-card px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
              {reviewer ? (
                <span className="inline-flex items-center gap-1">
                  <IconUser />
                  {registrationReviewerLabel(reviewer)}
                </span>
              ) : null}
              {reviewedAt ? (
                <span className="inline-flex items-center gap-1">
                  <IconClock />
                  {formatDateTime(reviewedAt)}
                </span>
              ) : null}
            </div>
            {remark?.trim() ? (
              <div className="mt-2 whitespace-pre-wrap border-t border-border-subtle pt-2 text-sm text-fg-muted">
                {remark.trim()}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-1 text-xs text-fg-dim">暂未审核</div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  const config =
    status === 1
      ? { label: "已通过", dot: "bg-emerald-400", text: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/20" }
      : status === 2
        ? { label: "已拒绝", dot: "bg-rose-400", text: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/20" }
        : status === 3
          ? { label: "已取消", dot: "bg-gray-500", text: "text-fg-dim", bg: "bg-gray-500/10", border: "border-gray-500/20" }
          : { label: "待审核", dot: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/20" };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.bg} ${config.border} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function ActionButton({
  children,
  title,
  onClick,
  disabled,
  variant,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  variant: "approve" | "reject" | "delete" | "default";
}) {
  const variantClasses = {
    approve: "text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300",
    reject: "text-rose-400 hover:bg-rose-500/15 hover:text-rose-300",
    delete: "text-red-400 hover:bg-red-500/15 hover:text-red-300",
    default: "text-fg-dim hover:bg-white/5 hover:text-fg-primary",
  };

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]}`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  iconColor,
  iconBg,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-fg-primary tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-fg-dim">{label}</div>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-sm text-fg-dim">未填写</span>;
}
