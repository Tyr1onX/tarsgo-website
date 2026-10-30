import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { ModalShell } from "~/components/modal-shell";
import { PersonalTimetableUpload } from "~/components/personal-timetable-upload";
import { getAuthUserName, getAuthUserRoleLabel, updateProfile, type AuthUser } from "~/lib/auth-client";
import { leaveClient, type CollegeOption, type LeaveProfile } from "~/lib/leave-client";

type LeaveDraft = Pick<LeaveProfile, "studentId" | "collegeCode" | "participantType">;

const emptyLeaveDraft: LeaveDraft = { studentId: "", collegeCode: "", participantType: "other" };
const fieldClass = "admin-field box-border h-11 min-h-11 w-full text-sm";
const readOnlyClass = "flex h-11 min-h-11 min-w-0 items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-subtle)] px-3 text-sm text-[var(--admin-text)]";
const labelClass = "mb-2 block text-xs font-medium text-[var(--admin-muted)]";

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
  const [leaveProfile, setLeaveProfile] = useState<LeaveProfile | null>(null);
  const [leaveDraft, setLeaveDraft] = useState<LeaveDraft>(emptyLeaveDraft);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [leaveLoadError, setLeaveLoadError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Leave documents use the verified account name, never a second editable name.
  const accountName = user.realName?.trim() || user.nickname?.trim() || "";
  const leaveName = leaveProfile?.identityLocked ? leaveProfile.name : accountName;
  const leaveChanged = leaveDraft.studentId.trim() !== (leaveProfile?.studentId ?? "") ||
    leaveDraft.collegeCode !== (leaveProfile?.collegeCode ?? "") ||
    leaveDraft.participantType !== (leaveProfile?.participantType ?? "other") ||
    Boolean(leaveProfile && !leaveProfile.identityLocked && accountName && leaveProfile.name !== accountName);

  const avatarPreview = useMemo(
    () => avatar ? URL.createObjectURL(avatar) : user.avatarUrl ?? "",
    [avatar, user.avatarUrl],
  );

  useEffect(() => {
    if (!avatar) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatar, avatarPreview]);

  useEffect(() => {
    let active = true;
    setLeaveLoading(true);
    setLeaveLoadError("");
    void Promise.all([leaveClient.profile(), leaveClient.colleges()])
      .then(([profile, options]) => {
        if (!active) return;
        setLeaveProfile(profile);
        setLeaveDraft(profile
          ? { studentId: profile.studentId, collegeCode: profile.collegeCode, participantType: profile.participantType }
          : { ...emptyLeaveDraft });
        setColleges(options);
      })
      .catch((cause) => {
        if (active) setLeaveLoadError(cause instanceof Error ? cause.message : "身份信息读取失败");
      })
      .finally(() => { if (active) setLeaveLoading(false); });
    return () => { active = false; };
  }, [user.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (leaveLoading) return;
    setSaving(true);
    try {
      if (!leaveLoadError && leaveChanged) {
        if (!leaveName || [...leaveName].length < 2) {
          throw new Error("请先联系管理员完善账号姓名，再保存学籍资料");
        }
        if (!/^[0-9]{8}$/.test(leaveDraft.studentId.trim()) || !leaveDraft.collegeCode) {
          throw new Error("请填写完整的 8 位学号和学院，再保存学籍资料");
        }
        const saved = await leaveClient.saveProfile({
          name: leaveName,
          studentId: leaveDraft.studentId.trim(),
          collegeCode: leaveDraft.collegeCode,
          participantType: leaveDraft.participantType,
        });
        setLeaveProfile(saved);
      }
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
      return;
    }
    setError("");
    if (file) setAvatar(file);
  }

  return (
    <ModalShell
      title="个人资料"
      description="统一管理账号信息、学籍资料与课程时间"
      widthClass="max-w-2xl"
      bodyClassName="min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6"
      onClose={onClose}
      footerClassName="bg-[var(--admin-surface)]"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="btn-glass min-h-11 rounded-xl px-5 py-2.5 text-sm">取消</button>
          <button form="profile-dialog-form" type="submit" disabled={saving || leaveLoading} className="btn-primary min-h-11 rounded-xl px-6 py-2.5 text-sm font-medium disabled:opacity-60">
            {saving ? "保存中…" : "保存修改"}
          </button>
        </div>
      )}
    >
      <div className="min-w-0 space-y-6">
        <form id="profile-dialog-form" onSubmit={(event) => void handleSubmit(event)} className="min-w-0 space-y-6">
          <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-[var(--admin-border-subtle)] bg-[var(--admin-surface-subtle)] p-4">
            <button
              type="button"
              aria-label="更换头像"
              title="更换头像"
              aria-controls="profile-avatar-file"
              disabled={saving}
              onClick={() => avatarInputRef.current?.click()}
              className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--admin-border)] bg-[var(--admin-input-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-accent)] disabled:cursor-not-allowed"
            >
              <span className="text-2xl font-semibold text-[var(--admin-text)]">{getAuthUserName(user).charAt(0).toUpperCase()}</span>
              {avatarPreview ? (
                <img key={avatarPreview} src={avatarPreview} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />
              ) : null}
              <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/50 text-3xl font-light leading-none text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">+</span>
            </button>
            <input
              ref={avatarInputRef}
              id="profile-avatar-file"
              className="sr-only"
              tabIndex={-1}
              type="file"
              accept="image/png,image/jpeg"
              disabled={saving}
              onChange={handleAvatarChange}
            />
            <div className="min-w-0 space-y-1">
              <p className="truncate text-base font-semibold text-[var(--admin-text)]">{accountName || "姓名未设置"}</p>
              <p className="break-all text-xs text-[var(--admin-muted)]">{user.email}</p>
              <p className="text-xs text-[var(--admin-muted)]">{avatar ? "已选择新头像，保存修改后生效" : "点击头像更换 · JPG / PNG，最大 2 MB"}</p>
            </div>
          </div>

          <section aria-labelledby="profile-account-heading" className="min-w-0 space-y-4">
            <div>
              <h3 id="profile-account-heading" className="text-sm font-semibold text-[var(--admin-text)]">账号信息</h3>
              <p className="mt-1 text-xs text-[var(--admin-muted)]">姓名及组别由管理员维护，手机号可自行更新。</p>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <div className="min-w-0">
                <span className={labelClass}>姓名</span>
                <div className={readOnlyClass} role="textbox" aria-readonly="true" aria-label="姓名">
                  <span className="min-w-0 truncate font-medium">{accountName || "未设置"}</span>
                </div>
              </div>
              <label className="block min-w-0">
                <span className={labelClass}>手机号</span>
                <input className={fieldClass} type="tel" inputMode="numeric" autoComplete="tel" placeholder="填写 11 位手机号" maxLength={11} pattern="1[3-9][0-9]{9}" value={phone} disabled={saving} onChange={(event) => setPhone(event.target.value)} />
              </label>
              <div className="min-w-0">
                <span className={labelClass}>邮箱</span>
                <div className={readOnlyClass} role="textbox" aria-readonly="true" aria-label="邮箱">
                  <span className="min-w-0 truncate" title={user.email}>{user.email}</span>
                </div>
              </div>
              <div className="min-w-0">
                <span className={labelClass}>所属组别</span>
                <div className={readOnlyClass} role="textbox" aria-readonly="true" aria-label="所属组别">
                  <span className="min-w-0 truncate" title={groups.join("、")}>{groups.length ? groups.join("、") : "暂无"}</span>
                </div>
              </div>
              <div className="min-w-0">
                <span className={labelClass}>账号权限</span>
                <div className={readOnlyClass} role="textbox" aria-readonly="true" aria-label="账号权限">{getAuthUserRoleLabel(user)}</div>
              </div>
            </div>
          </section>

          <section aria-labelledby="profile-school-heading" className="min-w-0 space-y-4 border-t border-[var(--admin-border-subtle)] pt-5">
            <div>
              <h3 id="profile-school-heading" className="text-sm font-semibold text-[var(--admin-text)]">学籍与请假信息</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--admin-muted)]">用于生成请假材料，姓名直接使用账号姓名；填写信息不代表已开通请假权限。</p>
            </div>
            {leaveLoading ? (
              <p role="status" className="text-sm text-[var(--admin-muted)]">正在读取学籍信息…</p>
            ) : leaveLoadError ? (
              <p role="alert" className="text-sm text-rose-500">学籍资料暂时无法读取：{leaveLoadError}。仍可保存手机号和头像。</p>
            ) : (
              <>
                <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                  <label className="block min-w-0">
                    <span className={labelClass}>学号</span>
                    <input className={fieldClass} type="text" inputMode="numeric" autoComplete="off" placeholder="8 位学号" maxLength={8} pattern="[0-9]{8}" value={leaveDraft.studentId} readOnly={Boolean(leaveProfile?.identityLocked)} disabled={saving} onChange={(event) => setLeaveDraft((current) => ({ ...current, studentId: event.target.value }))} />
                  </label>
                  <label className="block min-w-0">
                    <span className={labelClass}>学院</span>
                    <select className={fieldClass} value={leaveDraft.collegeCode} disabled={saving} onChange={(event) => setLeaveDraft((current) => ({ ...current, collegeCode: event.target.value }))}>
                      <option value="">请选择学院</option>
                      {colleges.map((college) => <option key={college.code} value={college.code}>{college.name}</option>)}
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <span className={labelClass}>请假身份</span>
                    <select className={fieldClass} value={leaveDraft.participantType} disabled={saving} onChange={(event) => setLeaveDraft((current) => ({ ...current, participantType: event.target.value as LeaveDraft["participantType"] }))}>
                      <option value="formal">正式队员</option>
                      <option value="reserve">预备队员</option>
                      <option value="other">其他</option>
                    </select>
                  </label>
                </div>
                {leaveProfile?.identityLocked ? (
                  <p className="text-xs leading-relaxed text-[var(--admin-muted)]">
                    已有请假记录，学号与用于生成假条的姓名已锁定，修改请联系管理员。
                    {leaveProfile.name !== accountName ? " 当前假条姓名为「" + leaveProfile.name + "」，与账号姓名不一致。" : ""}
                  </p>
                ) : null}
              </>
            )}
          </section>

          {error ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-500">{error}</p> : null}
        </form>
        <PersonalTimetableUpload userId={user.id} />
      </div>
    </ModalShell>
  );
}
