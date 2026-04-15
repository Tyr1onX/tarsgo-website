import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";

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

const defaultSummary: RegistrationSummary = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
};

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "0", label: "待审核" },
  { value: "1", label: "已通过" },
  { value: "2", label: "已拒绝" },
  { value: "3", label: "已取消" },
];

export default function RegistrationsPage() {
  useOutletContext<DashboardLayoutOutletContext>();
  const navigate = useNavigate();

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formIdFilter, setFormIdFilter] = useState("");
  const [forms, setForms] = useState<RegistrationFormListItem[]>([]);
  const [summary, setSummary] = useState<RegistrationSummary>(defaultSummary);
  const [items, setItems] = useState<RegistrationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeRegistrationId, setActiveRegistrationId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RegistrationDetail | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
      try {
        setLoading(true);
        setFlash(null);
        const response = await listAdminRegistrations({
          keyword,
          status: statusFilter === "" ? "" : Number(statusFilter),
          formId: formIdFilter === "" ? "" : Number(formIdFilter),
        });
        if (cancelled) {
          return;
        }
        setItems(response.items);
        setSummary(response.summary);
      } catch (error) {
        if (!cancelled) {
          handlePageError(error, navigate, setFlash);
          setItems([]);
          setSummary(defaultSummary);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRegistrations();

    return () => {
      cancelled = true;
    };
  }, [formIdFilter, keyword, navigate, statusFilter]);

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
    setActiveRegistrationId(registrationId);
    setDetailOpen(true);
  }

  function closeDetail() {
    setDetailOpen(false);
    setActiveRegistrationId(null);
    setDetail(null);
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
        keyword,
        status: statusFilter === "" ? "" : Number(statusFilter),
        formId: formIdFilter === "" ? "" : Number(formIdFilter),
      });
      setSummary(response.summary);
      setItems(response.items);
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
        keyword,
        status: statusFilter === "" ? "" : Number(statusFilter),
        formId: formIdFilter === "" ? "" : Number(formIdFilter),
      });
      setSummary(response.summary);
      setItems(response.items);
      setFlash({ type: "success", message: "报名记录已删除。" });
      setDeleteTarget(null);
    } catch (error) {
      handlePageError(error, navigate, setFlash);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="motion-fade-up flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">报名列表</h1>
          <p className="mt-1 text-sm text-gray-400">
            查看所有报名记录，支持按状态、关键字和报名表筛选。
          </p>
        </div>
      </div>

      {flash ? (
        <div
          className={`motion-fade-up rounded-lg border px-4 py-3 text-sm ${
            flash.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
              : "border-rose-500/20 bg-rose-500/10 text-rose-100"
          }`}
          style={{ animationDelay: "60ms" }}
        >
          {flash.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="motion-fade-up" style={{ animationDelay: "80ms" }}>
          <SummaryCard label="总报名数" value={summary.total} accent="text-white" />
        </div>
        <div className="motion-fade-up" style={{ animationDelay: "130ms" }}>
          <SummaryCard label="待审核" value={summary.pending} accent="text-amber-300" />
        </div>
        <div className="motion-fade-up" style={{ animationDelay: "180ms" }}>
          <SummaryCard label="已通过" value={summary.approved} accent="text-emerald-300" />
        </div>
        <div className="motion-fade-up" style={{ animationDelay: "230ms" }}>
          <SummaryCard label="已拒绝" value={summary.rejected} accent="text-rose-300" />
        </div>
        <div className="motion-fade-up" style={{ animationDelay: "280ms" }}>
          <SummaryCard label="已取消" value={summary.cancelled} accent="text-gray-300" />
        </div>
      </div>

      <section className="motion-fade-up motion-panel-soft rounded-xl border border-gray-800 bg-gray-900/70 p-4" style={{ animationDelay: "120ms" }}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_240px]">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索姓名、手机号、邮箱或报名表"
            className={inputClassName()}
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={selectClassName()}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={formIdFilter}
            onChange={(event) => setFormIdFilter(event.target.value)}
            className={selectClassName()}
          >
            <option value="">全部报名表</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="motion-fade-up overflow-hidden rounded-xl border border-gray-800 bg-gray-900/70" style={{ animationDelay: "160ms" }}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-950/40">
              <tr>
                {["姓名", "手机号", "邮箱", "意向组别(1)", "意向组别(1)状态", "意向组别(2)", "意向组别(2)状态", "报名表", "状态", "提交时间", "操作"].map((title) => (
                  <th
                    key={title}
                    className={`px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-gray-400 ${
                      title === "操作" ? "text-right" : ""
                    }`}
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-5 py-12 text-center text-sm text-gray-500">
                    正在加载报名列表...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-5 py-12 text-center text-sm text-gray-500">
                    当前筛选条件下暂无报名记录。
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="transition-colors duration-200 hover:bg-white/[0.03]">
                    <td className="px-5 py-4 text-gray-100">{item.contactName ?? "未填写"}</td>
                    <td className="px-5 py-4 text-gray-300">{item.contactPhone ?? "未填写"}</td>
                    <td className="px-5 py-4 text-gray-300">{item.contactEmail ?? "未填写"}</td>
                    <td className="px-5 py-4 text-gray-300">{registrationGroupLabel(item.group1)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.group1Status} />
                    </td>
                    <td className="px-5 py-4 text-gray-300">{registrationGroupLabel(item.group2)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.group2Status} />
                    </td>
                    <td className="px-5 py-4 text-gray-300">{item.formTitle}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-5 py-4 text-gray-400">{formatDateTime(item.submittedAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReview(item.id, "approve")}
                          disabled={!item.canApprove || reviewingId === item.id}
                          className="motion-button rounded-lg border border-emerald-500/30 px-3 py-2 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          通过
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReview(item.id, "reject")}
                          disabled={!item.canReject || reviewingId === item.id}
                          className="motion-button rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-200 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          拒绝
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteModal(item)}
                          disabled={deletingId === item.id}
                          className="motion-button rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          删除
                        </button>
                        <button
                          type="button"
                          onClick={() => openDetail(item.id)}
                          className="motion-button rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/5 hover:text-white"
                        >
                          详情
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div
        className={`fixed inset-0 z-40 transition lg:left-64 ${
          detailOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            detailOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeDetail}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-full max-w-2xl flex-col border-r border-gray-800 bg-gray-950 shadow-2xl transition-transform duration-300 ${
            detailOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-white">报名详情</h2>
              <p className="mt-1 text-sm text-gray-400">
                {detail?.formTitle ?? "正在加载报名内容"}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDetail}
              className="motion-button rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5"
            >
              关闭
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {detailLoading ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-8 text-center text-sm text-gray-500">
                正在加载详情...
              </div>
            ) : !detail ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-8 text-center text-sm text-gray-500">
                暂无可展示的报名详情。
              </div>
            ) : (
              <div className="space-y-6">
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <MetaCard label="姓名" value={detail.contactName ?? "未填写"} />
                  <MetaCard label="手机号" value={detail.contactPhone ?? "未填写"} />
                  <MetaCard label="邮箱" value={detail.contactEmail ?? "未填写"} />
                  <MetaCard label="意向组别(1)" value={registrationGroupLabel(detail.group1)} />
                  <MetaCard label="意向组别(1)状态" value={registrationStatusLabel(detail.group1Status)} />
                  <MetaCard label="意向组别(2)" value={registrationGroupLabel(detail.group2)} />
                  <MetaCard label="意向组别(2)状态" value={registrationStatusLabel(detail.group2Status)} />
                  <MetaCard label="状态" value={registrationStatusLabel(detail.status)} />
                  <MetaCard label="提交时间" value={formatDateTime(detail.submittedAt)} />
                  <MetaCard label="更新时间" value={formatDateTime(detail.updatedAt)} />
                </section>

                <section className="motion-surface rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-gray-300">审核操作</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReview(detail.id, "approve")}
                        disabled={!detail.canApprove || reviewingId === detail.id}
                        className="motion-button rounded-lg border border-emerald-500/30 px-3 py-2 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReview(detail.id, "reject")}
                        disabled={!detail.canReject || reviewingId === detail.id}
                        className="motion-button rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-200 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        拒绝
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteModal(detail)}
                        disabled={deletingId === detail.id}
                        className="motion-button rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2">
                  <MetaCard label="意向组别(1)审核人" value={registrationReviewerLabel(detail.reviewer1)} />
                  <MetaCard label="意向组别(1)审核时间" value={formatDateTime(detail.reviewedAt1)} />
                  <MetaCard label="意向组别(1)备注" value={detail.reviewRemark1?.trim() || "暂无"} />
                  <MetaCard label="意向组别(2)审核人" value={registrationReviewerLabel(detail.reviewer2)} />
                  <MetaCard label="意向组别(2)审核时间" value={formatDateTime(detail.reviewedAt2)} />
                  <MetaCard label="意向组别(2)备注" value={detail.reviewRemark2?.trim() || "暂无"} />
                </section>

                <section className="space-y-4">
                  <h3 className="text-base font-semibold text-white">表单内容</h3>
                  <div className="space-y-4">
                    {detail.fieldsSchema.map((field) => (
                      <div
                        key={field.key}
                        className="motion-surface rounded-lg border border-gray-800 bg-gray-900/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-medium text-white">{field.label}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {field.key}
                              {field.required ? " · 必填" : ""}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4">
                          {renderSubmittedFieldValue(field, detail.formData[field.key])}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {extraSubmittedFields.length > 0 ? (
                  <section className="space-y-4">
                    <h3 className="text-base font-semibold text-white">其他已提交字段</h3>
                    <div className="space-y-4">
                      {extraSubmittedFields.map(([key, value]) => (
                        <div
                          key={key}
                          className="motion-surface rounded-lg border border-gray-800 bg-gray-900/60 p-4"
                        >
                          <div className="text-sm font-medium text-white">{key}</div>
                          <div className="mt-3 text-sm text-gray-300">
                            {renderUnknownValue(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </aside>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 transition-opacity duration-300">
          <div className="motion-fade-up motion-surface w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
              <h2 className="text-base font-semibold text-white">确认删除</h2>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
                className="motion-button rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                关闭
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
                即将硬删除 <span className="font-medium">{deleteTarget.label}</span> 的报名记录，关联上传文件也会一并清理，删除后不可恢复。
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deletingId === deleteTarget.id}
                  className="motion-button rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteRegistration()}
                  disabled={deletingId === deleteTarget.id}
                  className="motion-button rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingId === deleteTarget.id ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderSubmittedFieldValue(
  field: RegistrationFormField,
  value: unknown,
) {
  if (field.type === "image") {
    const files = asFileMetaList(value);
    if (!files.length) {
      return <EmptyValue />;
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {files.map((file, index) => (
          <a
            key={`${file.file_url}-${index}`}
            href={buildApiUrl(file.file_url)}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden rounded-lg border border-gray-800 bg-gray-950/60 transition-colors hover:border-primary-400/60"
          >
            <img
              src={buildApiUrl(file.file_url)}
              alt={file.file_name}
              className="h-40 w-full object-cover"
            />
            <div className="space-y-1 px-3 py-3">
              <div className="truncate text-sm font-medium text-white">{file.file_name}</div>
              <div className="text-xs text-gray-500">{formatFileSize(file.file_size)}</div>
            </div>
          </a>
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
        className="inline-flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-950/60 px-4 py-3 text-sm text-gray-100 transition-colors hover:border-primary-400/60 hover:text-white"
      >
        <span className="truncate">{file.file_name}</span>
        <span className="text-xs text-gray-500">{formatFileSize(file.file_size)}</span>
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
    return <span className="text-sm text-gray-100">{values.join("、")}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-sm text-gray-100">{resolveFieldOptionLabel(field, String(value))}</span>;
  }

  if (typeof value === "string" && value.trim()) {
    return (
      <span className="whitespace-pre-wrap text-sm text-gray-100">
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
    <pre className="overflow-x-auto rounded-lg bg-gray-950/80 p-3 text-xs text-gray-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

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

function inputClassName() {
  return "motion-field w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20";
}

function selectClassName() {
  return `${inputClassName()} motion-select`;
}

function StatusBadge({ status }: { status: number }) {
  const meta = {
    label: registrationStatusLabel(status),
    className:
      status === 1
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
        : status === 2
          ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
          : status === 3
            ? "border-gray-700 bg-gray-800 text-gray-300"
            : "border-amber-500/20 bg-amber-500/10 text-amber-200",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="motion-stat-surface rounded-xl border border-gray-800 bg-gray-900/70 p-5">
      <div className="text-sm text-gray-400">{label}</div>
      <div className={`mt-3 text-3xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="motion-surface rounded-lg border border-gray-800 bg-gray-900/60 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-2 text-sm text-gray-100">{value}</div>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-sm text-gray-500">未填写</span>;
}
