import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { FileUploadField, type FileUploadStatus } from "~/components/file-upload-field";
import { ApiError } from "~/lib/api-client";
import {
  listAdminUserGroups,
  removeAdminAdmissionQRCode,
  uploadAdminAdmissionQRCode,
  type AdminUserGroupListItem,
} from "~/lib/admin-user-groups-client";

type Flash = { tone: "success" | "error"; message: string } | null;
const ADMISSION_QR_MAX_BYTES = 2 * 1024 * 1024;

export function AdmissionQRCodeSettings() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<AdminUserGroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyGroupId, setBusyGroupId] = useState<number | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [failedPreviewUrls, setFailedPreviewUrls] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Record<number, File[]>>({});
  const [uploadStatuses, setUploadStatuses] = useState<Record<number, FileUploadStatus>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});

  async function loadGroups(showLoader = true) {
    if (showLoader) setLoading(true);
    try {
      const result = await listAdminUserGroups({});
      setGroups(result.items);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", { replace: true });
      } else {
        setFlash({ tone: "error", message: getErrorMessage(error) });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGroups();
  }, []);

  async function upload(group: AdminUserGroupListItem, file: File | undefined) {
    if (!file) return;
    setUploadStatuses((current) => ({ ...current, [group.id]: "uploading" }));
    setUploadErrors((current) => ({ ...current, [group.id]: "" }));
    setBusyGroupId(group.id);
    setFlash(null);
    try {
      await uploadAdminAdmissionQRCode(group.id, file);
      setUploadStatuses((current) => ({ ...current, [group.id]: "uploaded" }));
      setFailedPreviewUrls((current) => current.filter((url) => url !== group.admissionQrCodeUrl));
      setFlash({ tone: "success", message: `「${group.name}」的录取群二维码已更新。` });
      await loadGroups(false);
    } catch (error) {
      const message = getErrorMessage(error);
      setUploadStatuses((current) => ({ ...current, [group.id]: "failed" }));
      setUploadErrors((current) => ({ ...current, [group.id]: message }));
      setFlash({ tone: "error", message });
    } finally {
      setBusyGroupId(null);
    }
  }

  async function remove(group: AdminUserGroupListItem) {
    const confirmed = window.confirm(
      `确定移除「${group.name}」的录取群二维码吗？之后新建的录取通知将无法发送，直到重新配置。待发送通知仍保留创建时的二维码快照，已发送通知记录不会改变。`,
    );
    if (!confirmed) return;
    setBusyGroupId(group.id);
    setFlash(null);
    try {
      await removeAdminAdmissionQRCode(group.id);
      setFlash({ tone: "success", message: `「${group.name}」的当前二维码配置已移除。` });
      await loadGroups(false);
    } catch (error) {
      setFlash({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setBusyGroupId(null);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="admission-qr-heading">
      <header>
        <h2 id="admission-qr-heading" className="text-lg font-semibold text-fg-primary">录取通知设置</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-dim">
          为每个招新组别配置录取群二维码。只有超级管理员可以修改；普通管理员会在发送录取通知前看到对应组别的二维码预览。
          更新配置不会改写已经创建的通知，待发送通知需要在报名详情中显式更新二维码。
        </p>
      </header>

      {flash ? (
        <div role={flash.tone === "error" ? "alert" : "status"} className={`admin-notice ${flash.tone === "error" ? "admin-notice--error" : "admin-notice--success"}`}>
          {flash.message}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2" aria-label="正在加载组别二维码配置" aria-busy="true">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.03]" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] p-5 text-sm text-fg-dim">当前没有招新组别。</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => {
            const url = group.admissionQrCodeUrl ?? "";
            const hasPreview = Boolean(group.admissionQrCodeConfigured && url && !failedPreviewUrls.includes(url));
            const busy = busyGroupId === group.id;
            return (
              <article key={group.id} className="min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-fg-primary">{group.name}</h3>
                    <p className="mt-1 text-sm text-fg-dim">
                      {group.admissionQrCodeConfigured ? "已配置二维码" : "尚未配置二维码"}
                      {group.status === 0 ? " · 已停用组别" : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${group.admissionQrCodeConfigured ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-300/10 text-amber-200"}`}>
                    {group.admissionQrCodeConfigured ? "已配置" : "待配置"}
                  </span>
                </div>

                <div className="mt-4 flex min-h-40 items-center justify-center rounded-lg border border-dashed border-white/[0.12] bg-black/20 p-3">
                  {hasPreview ? (
                    <img
                      key={url}
                      src={url}
                      alt={`${group.name}录取群二维码预览`}
                      className="max-h-48 max-w-full object-contain"
                      onError={() => setFailedPreviewUrls((current) => current.includes(url) ? current : [...current, url])}
                    />
                  ) : (
                    <p className="px-3 text-center text-sm text-fg-dim">
                      {group.admissionQrCodeConfigured ? "当前图片无法预览，请上传有效二维码图片。" : "上传图片后可在此预览。"}
                    </p>
                  )}
                </div>

                {group.admissionQrCodeConfigured ? (
                  <p className="mt-2 break-all text-xs text-fg-dim">邮件发送时还会重新校验图片文件是否可读取。</p>
                ) : null}

                <div className="mt-4 space-y-2">
                  <FileUploadField
                    label={`${group.name}录取群二维码`}
                    files={selectedFiles[group.id] ?? []}
                    onFilesChange={(files) => {
                      setSelectedFiles((current) => ({ ...current, [group.id]: files }));
                      setUploadErrors((current) => ({ ...current, [group.id]: "" }));
                      setUploadStatuses((current) => ({ ...current, [group.id]: "pending" }));
                      if (files[0]) void upload(group, files[0]);
                    }}
                    accept="image/png,image/jpeg"
                    variant="compact"
                    triggerLabel={busy ? "正在保存…" : group.admissionQrCodeConfigured ? "更换二维码" : "上传二维码"}
                    hint="PNG / JPEG，最大 2 MB"
                    error={uploadErrors[group.id]}
                    disabled={busy}
                    status={uploadStatuses[group.id] ?? "pending"}
                    onRetry={() => void upload(group, selectedFiles[group.id]?.[0])}
                    validateSelection={(_nextFiles, incomingFiles) => {
                      const file = incomingFiles[0];
                      if (!file) return null;
                      if (file.type !== "image/png" && file.type !== "image/jpeg") return "请选择 PNG 或 JPEG 图片。";
                      if (file.size > ADMISSION_QR_MAX_BYTES) return "二维码图片不能超过 2 MB。";
                      return null;
                    }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {group.admissionQrCodeConfigured ? (
                    <button type="button" disabled={busy} onClick={() => void remove(group)} className="admin-button admin-button--danger">
                      移除二维码
                    </button>
                  ) : null}
                  <span className="text-xs text-fg-dim">PNG / JPEG，最大 2MB</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}
