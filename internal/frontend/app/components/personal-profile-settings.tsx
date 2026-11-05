import { BrandLoader } from "~/components/brand-loader";
import { hasWorkbenchAccess } from "~/lib/dashboard-navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams, useOutletContext } from "react-router";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { PersonalTimetableUpload } from "~/components/personal-timetable-upload";
import { Notify } from "~/components/notify";
import { AccountAcademicFields } from "~/components/account-academic-fields";
import { updateProfile, type AuthUser } from "~/lib/auth-client";
import { getAccountProfile, salonReturnPath, type AccountProfile } from "~/lib/account-profile";
import { leaveClient, type LeaveProfile } from "~/lib/leave-client";

const fieldClass = "admin-field box-border h-11 min-h-11 w-full text-sm";
const labelClass = "mb-2 block text-xs font-medium text-[var(--admin-muted)]";

export function PersonalProfileSettings({ user }: { user: AuthUser }) {
  const { refreshAccountProfile } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams] = useSearchParams();
  const returnTo = salonReturnPath(searchParams.get("returnTo"));
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [leaveProfile, setLeaveProfile] = useState<LeaveProfile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setProfile(null); setError("");
    void getAccountProfile().then((p) => { if (active) setProfile(p); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "个人资料读取失败"); });
    void leaveClient.profile().then((p) => { if (active) setLeaveProfile(p); }).catch(() => {});
    return () => { active = false; };
  }, [user.id]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await updateProfile({ realName: user.realName?.trim() || profile.realName, avatar: null, academic: profile });
      setProfile(await getAccountProfile());
      setNotice("个人资料已保存");
      refreshAccountProfile();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试"); }
    finally { setSaving(false); }
  }
  return <div className="personal-profile-settings min-w-0 space-y-6">
    <section className="min-w-0" aria-labelledby="profile-academic-heading">
      <h3 id="profile-academic-heading" className="text-sm font-semibold text-[var(--admin-text)]">个人资料</h3>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--theme-danger)]">{error}</p> : null}
      {!profile && !error ? <BrandLoader label="正在读取个人资料" size="sm" /> : null}
      {profile ? <form onSubmit={(e) => void save(e)} className="mt-4 min-w-0 space-y-4">
        <label className="block"><span className={labelClass}>邮箱</span><input className={fieldClass} type="email" value={profile.email} readOnly /></label>
        <AccountAcademicFields value={profile} onChange={(next) => { setProfile({ ...profile, ...next }); setNotice(""); }} disabled={saving} fieldClass={fieldClass} labelClass={labelClass} />
        {leaveProfile?.identityLocked ? <p className="text-xs leading-relaxed text-[var(--admin-muted)]">已有请假记录的假条身份保持锁定：{leaveProfile.name} · {leaveProfile.studentId}。账号修改不改写已提交的请假材料。</p> : null}
        {notice ? <Notify tone="success" message={notice} onClose={() => setNotice("")} /> : null}
        <div className="flex flex-wrap justify-end gap-2"><button type="submit" disabled={saving} className="admin-button admin-button--primary">{saving ? "保存中…" : "保存个人资料"}</button>
          {returnTo ? <Link className="admin-button" to={returnTo}>返回活动报名</Link> : null}
        </div>
      </form> : null}
      <div className="mt-4 max-w-xl"><span className={labelClass}>战队职务</span><div className="text-sm text-[var(--admin-text)]">{user.organizationPositions?.length ? user.organizationPositions.map(({ title }) => title).join("、") : "暂无"}</div></div>
    </section>
    {hasWorkbenchAccess(user) ? <div id="timetable" className="scroll-mt-8"><PersonalTimetableUpload userId={user.id} /></div> : null}
  </div>;
}
