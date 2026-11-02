import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { CommunityGrowthProfileSection } from "~/components/community-growth";
import { PersonalTimetableUpload } from "~/components/personal-timetable-upload";
import { getAuthUserRoleLabel, updateProfile, type AuthUser } from "~/lib/auth-client";
import { leaveClient, type CollegeOption, type LeaveProfile } from "~/lib/leave-client";

type LeaveDraft = Pick<LeaveProfile, "studentId" | "collegeCode" | "participantType">;

const emptyLeaveDraft: LeaveDraft = { studentId: "", collegeCode: "", participantType: "other" };
const fieldClass = "admin-field box-border h-11 min-h-11 w-full text-sm";
const readOnlyClass = "flex h-11 min-h-11 min-w-0 items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-subtle)] px-3 text-sm text-[var(--admin-text)]";
const labelClass = "mb-2 block text-xs font-medium text-[var(--admin-muted)]";

export function PersonalProfileSettings({
  user,
  groups,
  onSaved,
}: {
  user: AuthUser;
  groups: string[];
  onSaved: () => void;
}) {
  const [avatar, setAvatar] = useState<File | null>(null);
  const [realNameDraft, setRealNameDraft] = useState(user.realName?.trim() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [leaveProfile, setLeaveProfile] = useState<LeaveProfile | null>(null);
  const [leaveDraft, setLeaveDraft] = useState<LeaveDraft>(emptyLeaveDraft);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [leaveLoadError, setLeaveLoadError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRealNameDraft(user.realName?.trim() ?? "");
  }, [user.id, user.realName]);

  // Leave documents use the account name until an existing request locks its snapshot.
  const accountName = realNameDraft.trim();
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
    const nextRealName = realNameDraft.trim();
    if (!isChineseRealName(nextRealName)) {
      setError("姓名需为 1 至 100 个汉字。");
      return;
    }
    setSaving(true);
    try {
      const updatedUser = await updateProfile({ realName: nextRealName, phone: user.phone ?? "", avatar });
      setRealNameDraft(updatedUser.realName?.trim() ?? nextRealName);
      setAvatar(null);
      onSaved();
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
      <div className="personal-profile-settings min-w-0 space-y-6">
        <form id="profile-account-form" onSubmit={(event) => void handleSubmit(event)} className="min-w-0 space-y-6">
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
              <span className="text-2xl font-semibold text-[var(--admin-text)]">{(accountName || "姓名待核实").charAt(0).toUpperCase()}</span>
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
            <h3 id="profile-account-heading" className="text-sm font-semibold text-[var(--admin-text)]">账号与学籍信息</h3>
              <p className="mt-1 text-xs text-[var(--admin-muted)]">姓名用于社区展示；学号、学院用于请假材料。</p>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className={labelClass}>姓名</span>
                <input className={fieldClass} type="text" autoComplete="name" required maxLength={100} value={realNameDraft} disabled={saving} onChange={(event) => setRealNameDraft(event.target.value)} aria-label="姓名" />
              </label>
              {leaveLoading ? (
                <p role="status" className="self-end py-3 text-sm text-[var(--admin-muted)]">正在读取学籍信息…</p>
              ) : leaveLoadError ? (
                <p role="alert" className="self-end text-sm text-[var(--theme-danger)]">学籍资料暂时无法读取：{leaveLoadError}。仍可保存头像。</p>
              ) : (
                <>
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
                </>
              )}
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
                <span className={labelClass}>战队职务</span>
                <div className={readOnlyClass} role="textbox" aria-readonly="true" aria-label="战队职务">
                  <span className="min-w-0 truncate" title={(user.organizationPositions ?? []).map(({ title }) => title).join("、")}>
                    {user.organizationPositions?.length ? user.organizationPositions.map(({ title }) => title).join("、") : "暂无"}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <span className={labelClass}>账号权限</span>
                <div className={readOnlyClass} role="textbox" aria-readonly="true" aria-label="账号权限">{getAuthUserRoleLabel(user)}</div>
              </div>
            </div>
            {leaveProfile?.identityLocked ? (
              <p className="text-xs leading-relaxed text-[var(--admin-muted)]">
                已有请假记录，学号和假条姓名已锁定；修改账号姓名不会改动已提交的请假记录。
                {leaveProfile.name !== accountName ? " 当前假条姓名为「" + leaveProfile.name + "」，与账号姓名不一致。" : ""}
              </p>
            ) : null}
          </section>

          {error ? <p role="alert" className="rounded-xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-surface)] px-3 py-2.5 text-sm text-[var(--theme-danger)]">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="submit" disabled={saving || leaveLoading} className="admin-button admin-button--primary">{saving ? "保存中…" : "保存账号与学籍信息"}</button>
          </div>
        </form>
        <CommunityGrowthProfileSection />
        <div id="timetable" className="scroll-mt-8"><PersonalTimetableUpload userId={user.id} /></div>
      </div>
  );
}

function isChineseRealName(value: string) {
  const characters = [...value];
  return characters.length >= 1 && characters.length <= 100 && characters.every((character) => /\p{Script=Han}/u.test(character));
}
