import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ModalShell } from "~/components/modal-shell";
import { PersonalTimetableUpload } from "~/components/personal-timetable-upload";
import { getAuthUserRoleLabel, updateProfile, type AuthUser } from "~/lib/auth-client";

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
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
      await updateProfile({ nickname, phone, avatar });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="个人资料" widthClass="max-w-lg" bodyClassName="min-w-0 max-h-[calc(100dvh-8rem)] overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" onClose={onClose}>
      <form onSubmit={(event) => void handleSubmit(event)} className="min-w-0 space-y-5">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--admin-input-surface)] flex items-center justify-center border border-[var(--admin-border-subtle)]">
            <span className="text-xl font-semibold text-[var(--admin-text)]">{(nickname.trim() || user.email).charAt(0).toUpperCase()}</span>
            {avatarPreview ? (
              <img key={avatarPreview} src={avatarPreview} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />
            ) : null}
          </div>
          <label className="admin-field-label flex-1">
            头像
            <input
              className="admin-field box-border w-full max-w-full min-w-0"
              type="file"
              accept="image/png,image/jpeg"
              disabled={saving}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && (file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(file.type))) {
                  setError("请选择不超过 2MB 的 JPG 或 PNG 图片");
                  setAvatar(null);
                  event.target.value = "";
                  return;
                }
                setError("");
                setAvatar(file);
              }}
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field-label">
            昵称
            <input className="admin-field w-full" maxLength={100} value={nickname} disabled={saving} onChange={(event) => setNickname(event.target.value)} />
          </label>
          <label className="admin-field-label">
            手机号
            <input className="admin-field w-full" type="tel" inputMode="numeric" maxLength={11} pattern="1[3-9][0-9]{9}" value={phone} disabled={saving} onChange={(event) => setPhone(event.target.value)} />
          </label>
        </div>
        <div className="space-y-3 border-t border-[var(--admin-border-subtle)] pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--admin-muted)]">真实姓名</span>
            <span className="text-right text-[var(--admin-text)]">{user.realName || "未设置"} <span className="block text-xs text-[var(--admin-muted)]">修改请联系管理员</span></span>
          </div>
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
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-glass rounded-xl px-4 py-2.5 text-sm">取消</button>
          <button type="submit" disabled={saving} className="btn-primary rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-60">{saving ? "保存中…" : "保存修改"}</button>
        </div>
      </form>
      <PersonalTimetableUpload userId={user.id} />
    </ModalShell>
  );
}
