import { hasWorkbenchAccess } from "~/lib/dashboard-navigation";
import { useEffect, useState, type FormEvent } from "react";

import { PersonalTimetableUpload } from "~/components/personal-timetable-upload";
import { type AuthUser } from "~/lib/auth-client";
import { leaveClient, type CollegeOption, type LeaveProfile } from "~/lib/leave-client";

type LeaveDraft = Pick<LeaveProfile, "studentId" | "collegeCode" | "participantType">;

const emptyLeaveDraft: LeaveDraft = { studentId: "", collegeCode: "", participantType: "other" };
const fieldClass = "admin-field box-border h-11 min-h-11 w-full text-sm";
const labelClass = "mb-2 block text-xs font-medium text-[var(--admin-muted)]";

export function PersonalProfileSettings({ user }: { user: AuthUser }) {
  const [leaveProfile, setLeaveProfile] = useState<LeaveProfile | null>(null);
  const [leaveDraft, setLeaveDraft] = useState<LeaveDraft>(emptyLeaveDraft);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [leaveLoadError, setLeaveLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
        if (active) setLeaveLoadError(cause instanceof Error ? cause.message : "学籍资料读取失败");
      })
      .finally(() => { if (active) setLeaveLoading(false); });
    return () => { active = false; };
  }, [user.id]);

  const accountName = user.realName?.trim() ?? "";
  const leaveName = leaveProfile?.identityLocked ? leaveProfile.name : accountName;
  const leaveChanged = leaveDraft.studentId.trim() !== (leaveProfile?.studentId ?? "") ||
    leaveDraft.collegeCode !== (leaveProfile?.collegeCode ?? "") ||
    leaveDraft.participantType !== (leaveProfile?.participantType ?? "other") ||
    Boolean(leaveProfile && !leaveProfile.identityLocked && accountName && leaveProfile.name !== accountName);

  async function saveAcademicProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || leaveLoading || leaveLoadError || !leaveChanged) return;
    setError("");
    if (!leaveName || [...leaveName].length < 2) {
      setError("请先联系管理员完善账号姓名，再保存学籍资料。");
      return;
    }
    if (!/^[0-9]{8}$/.test(leaveDraft.studentId.trim()) || !leaveDraft.collegeCode) {
      setError("请填写完整的 8 位学号和学院。");
      return;
    }

    setSaving(true);
    try {
      const saved = await leaveClient.saveProfile({
        name: leaveName,
        studentId: leaveDraft.studentId.trim(),
        collegeCode: leaveDraft.collegeCode,
        participantType: leaveDraft.participantType,
      });
      setLeaveProfile(saved);
      setLeaveDraft({ studentId: saved.studentId, collegeCode: saved.collegeCode, participantType: saved.participantType });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "学籍资料保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  return <div className="personal-profile-settings min-w-0 space-y-6">
    <section className="min-w-0" aria-labelledby="profile-academic-heading">
      <h3 id="profile-academic-heading" className="text-sm font-semibold text-[var(--admin-text)]">学籍资料</h3>
      {leaveLoading ? <p role="status" className="mt-3 text-sm text-[var(--admin-muted)]">正在读取学籍资料…</p> : null}
      {leaveLoadError ? <p role="alert" className="mt-3 break-words text-sm text-[var(--theme-danger)]">学籍资料暂时无法读取：{leaveLoadError}</p> : null}
      {!leaveLoading && !leaveLoadError ? <form id="profile-academic-form" onSubmit={(event) => void saveAcademicProfile(event)} className="mt-4 min-w-0 space-y-4">
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
        </div>
        {leaveProfile?.identityLocked ? <p className="text-xs leading-relaxed text-[var(--admin-muted)]">
          已有请假记录，学号和假条姓名已锁定；账号姓名修改不会改动已提交的请假记录。
          {leaveProfile.name !== accountName ? ` 当前假条姓名为「${leaveProfile.name}」，与账号姓名不一致。` : ""}
        </p> : null}
        {error ? <p role="alert" className="break-words text-sm text-[var(--theme-danger)]">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="submit" disabled={saving || !leaveChanged} className="admin-button admin-button--primary">{saving ? "保存中…" : "保存学籍资料"}</button>
        </div>
      </form> : null}
      <div className="mt-4 max-w-xl">
        <span className={labelClass}>战队职务</span>
        <div className="flex min-h-11 min-w-0 items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-subtle)] px-3 text-sm text-[var(--admin-text)]" role="textbox" aria-readonly="true" aria-label="战队职务">
          <span className="min-w-0 truncate" title={(user.organizationPositions ?? []).map(({ title }) => title).join("、")}>
            {user.organizationPositions?.length ? user.organizationPositions.map(({ title }) => title).join("、") : "暂无"}
          </span>
        </div>
      </div>
    </section>
    {hasWorkbenchAccess(user) ? <div id="timetable" className="scroll-mt-8"><PersonalTimetableUpload userId={user.id} /></div> : null}
  </div>;
}
