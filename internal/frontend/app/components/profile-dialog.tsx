import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { ModalShell } from "~/components/modal-shell";
import { PersonalTimetableUpload } from "~/components/personal-timetable-upload";
import { getAuthUserName, getAuthUserRoleLabel, updateProfile, type AuthUser } from "~/lib/auth-client";

export function ProfileDialog({
  user,
  groups,
  onClose,
  onSaved,
}: {
  user: AuthUser;
  groups: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState(user.phone ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarPreview = useMemo(
    () => avatar ? URL.createObjectURL(avatar) : user.avatarUrl ?? "",
    [avatar, user.avatarUrl],
  );

  useEffect(() => {
    if (!avatar) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatar, avatarPreview]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      // Keep sending the legacy field unchanged so older API contracts remain compatible.
      await updateProfile({ nickname: user.nickname ?? "", phone, avatar });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (file && (file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(file.type))) {
      setError("请选择不超过 2MB 的 JPG 或 PNG 图片");
      setAvatar(null);
      return;
    }
    setError("");
    setAvatar(file);
  }

  return (
    <ModalShell
      title="个人资料"
      widthClass="max-w-lg"
      bodyClassName="min-w-0 max-h-[calc(100dvh-8rem)] overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
      onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-glass rounded-xl px-4 py-2.5 text-sm">取消</button>
          <button form="profile-dialog-form" type="submit" disabled={saving} className="btn-primary rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-60">{saving ? "保存中…" : "保存修改"}</button>
        </div>
      )}
    >
      <div className="min-w-0 space-y-5">
        <form id="profile-dialog-form" onSubmit={(event) => void handleSubmit(event)} className="min-w-0 space-y-5">
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <button
                type="button"
                aria-label="更换头像"
                title="更换头像"
                aria-controls="profile-avatar-file"
                disabled={saving}
                onClick={() => avatarInputRef.current?.click()}
                className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[var(--admin-border-subtle)] bg-[var(--admin-input-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-accent)] disabled:cursor-not-allowed"
              >
                <span className="text-xl font-semibold text-[var(--admin-text)]">{getAuthUserName(user).charAt(0).toUpperCase()}</span>
                {avatarPreview ? (
                  <img key={avatarPreview} src={avatarPreview} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />
                ) : null}
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/45 text-3xl font-light leading-none text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">+</span>
              </button>
              <input
                ref={avatarInputRef}
                id="profile-avatar-file"
                className="hidden"
                type="file"
                accept="image/png,image/jpeg"
                disabled={saving}
                onChange={handleAvatarChange}
              />
            </div>
            <span className="text-sm text-[var(--admin-muted)]">头像</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="admin-field-label">
              姓名
              <div className="mt-1 min-h-10 rounded-lg border border-[var(--admin-border-subtle)] bg-[var(--admin-input-surface)] px-3 py-2.5 text-sm text-[var(--admin-text)]">
                {user.realName?.trim() || user.nickname?.trim() || "未设置"}
                <span className="ml-2 text-xs text-[var(--admin-muted)]">修改请联系管理员</span>
              </div>
            </div>
            <label className="admin-field-label">
              手机号
              <input className="admin-field w-full" type="tel" inputMode="numeric" maxLength={11} pattern="1[3-9][0-9]{9}" value={phone} disabled={saving} onChange={(event) => setPhone(event.target.value)} />
            </label>
          </div>
          <div className="space-y-3 border-t border-[var(--admin-border-subtle)] pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[var(--admin-muted)]">邮箱</span>
              <span className="break-all text-right text-[var(--admin-text)]">{user.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--admin-muted)]">所属组别</span>
              <span className="text-right text-[var(--admin-text)]">{groups.length ? groups.join("、") : "暂无"}<span className="block text-xs text-[var(--admin-muted)]">组别有误请联系管理员</span></span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--admin-muted)]">账号权限</span>
              <span className="text-[var(--admin-text)]">{getAuthUserRoleLabel(user)}</span>
            </div>
          </div>
          {error ? <p role="alert" className="text-sm text-rose-400">{error}</p> : null}
        </form>
        <PersonalTimetableUpload userId={user.id} />
      </div>
    </ModalShell>
  );
}
