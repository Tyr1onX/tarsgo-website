import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { downloadLeaveFile, leaveClient, type CampDetail, type CampEvent, type CollegeOption, type DailyEntry, type DailyWindow, type LeaveProfile, type LeaveRequest, type SchoolRun } from "~/lib/leave-client";

type Tab = "daily" | "camp" | "records";
type LeaveProfileDraft = Omit<LeaveProfile, "identityLocked">;
const inputClass = "admin-field";
const button = "admin-button admin-button--small";

function localDateTime(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function dateText(value?: string) { return value ? value.slice(0, 16).replace("T", " ") : "—"; }
function statusText(value: string) {
  return ({ pending: "待汇总", included: "已纳入汇总", withdrawn: "已撤回", ready: "待下载", awaiting_return: "回传处理中", completed: "已完成", cancelled: "已取消", open: "收集中", closed: "已关闭", collecting: "收集中" } as Record<string, string>)[value] ?? value;
}
function publicURL(path?: string) { return path && typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : ""; }

export function meta() { return [{ title: "请假工作台 | TARSGO" }, { name: "description", content: "日常请假、集中请假与请假记录" }]; }

export default function LeaveWorkbench() {
  const { currentUser, refreshLeaveUnreadCount } = useOutletContext<DashboardLayoutOutletContext>();
  const isAdmin = currentUser.role.name === "admin" || currentUser.role.name === "super_admin";
  const [tab, setTab] = useState<Tab>("daily");
  const [profile, setProfile] = useState<LeaveProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<LeaveProfileDraft>({ name: "", studentId: "", collegeCode: "", participantType: "other" });
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [adminRequests, setAdminRequests] = useState<LeaveRequest[]>([]);
  const [runs, setRuns] = useState<SchoolRun[]>([]);
  const [runReasonDraft, setRunReasonDraft] = useState<Record<number, string>>({});
  const [myWindows, setMyWindows] = useState<DailyWindow[]>([]);
  const [adminWindows, setAdminWindows] = useState<DailyWindow[]>([]);
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [campEvents, setCampEvents] = useState<CampEvent[]>([]);
  const [myCampEvents, setMyCampEvents] = useState<CampEvent[]>([]);
  const [selectedCamp, setSelectedCamp] = useState<CampDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [schoolDraft, setSchoolDraft] = useState({ startAt: "", endAt: "" });
  const [dailyDraft, setDailyDraft] = useState({ startAt: "", endAt: "" });
  const [windowDraft, setWindowDraft] = useState({ title: "", startAt: "", endAt: "", openUntil: "" });
  const [campDraft, setCampDraft] = useState({ title: "", type: "winter" as "winter" | "summer", startDate: "", endDate: "", collectionDeadline: "" });

  const profileReady = useMemo(() => Boolean(profile?.name && /^[0-9]{8}$/.test(profile.studentId) && profile.collegeCode), [profile]);

  async function load() {
    setLoading(true); setError("");
    try {
      const [nextProfile, nextColleges, nextRequests, nextWindows, nextDaily, nextCamps] = await Promise.all([
        leaveClient.profile(), leaveClient.colleges(), leaveClient.schoolRequests(), leaveClient.dailyWindows(), leaveClient.myDailyRecords(), leaveClient.campEvents(),
      ]);
      setProfile(nextProfile);
      setProfileDraft(nextProfile ? { name: nextProfile.name, studentId: nextProfile.studentId, collegeCode: nextProfile.collegeCode, participantType: nextProfile.participantType } : { name: "", studentId: "", collegeCode: "", participantType: "other" });
      setColleges(nextColleges); setRequests(nextRequests); setMyWindows(nextWindows); setDailyEntries(nextDaily); setMyCampEvents(nextCamps);
      if (isAdmin) {
        const [nextAdminRequests, nextRuns, nextAdminWindows, nextAdminDaily, nextAdminCamps] = await Promise.all([
          leaveClient.adminSchoolRequests(), leaveClient.schoolRuns(), leaveClient.adminDailyWindows(), leaveClient.dailyRecords(), leaveClient.adminCampEvents(),
        ]);
        setAdminRequests(nextAdminRequests); setRuns(nextRuns); setRunReasonDraft(Object.fromEntries(nextRuns.map((run) => [run.id, run.reason]))); setAdminWindows(nextAdminWindows); setDailyEntries(nextAdminDaily); setCampEvents(nextAdminCamps);
      } else { setCampEvents(nextCamps); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "请假工作台暂时无法加载"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [currentUser.id]);
  useEffect(() => {
    const now = new Date();
    setDailyDraft({ startAt: localDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0)), endAt: localDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 10)) });
    setSchoolDraft({ startAt: localDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0)), endAt: localDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 10)) });
  }, []);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); await load(); if (isAdmin) await refreshLeaveUnreadCount(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => { const saved = await leaveClient.saveProfile(profileDraft); setProfile(saved); }, "请假资料已保存。");
  }

  async function makeDaily(offline = false) {
    if (!profileReady) { setError("请先完善请假资料中的姓名、8 位学号和学院。"); return; }
    setBusy(true); setError(""); setNotice("");
    try { const ready = await leaveClient.prepareDailySelf(dailyDraft, offline); await downloadLeaveFile(ready.downloadUrl, ready.filename); setNotice("请假条已生成并开始下载。"); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "请假条生成失败"); }
    finally { setBusy(false); }
  }

  async function makeShared(window: DailyWindow, offline = false) {
    if (!profileReady) { setError("请先完善请假资料中的姓名、8 位学号和学院。"); return; }
    setBusy(true); setError(""); setNotice("");
    try { const ready = await leaveClient.prepareDailyWindow(window.id, offline); await downloadLeaveFile(ready.downloadUrl, ready.filename); setNotice("共享报名已保存，材料已开始下载。"); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "请假条生成失败"); }
    finally { setBusy(false); }
  }

  async function makeCampDocument(eventId: number, college: string, offline = false) {
    const suffix = offline ? "?offline=true" : "";
    await runAction(() => downloadLeaveFile(`/api/admin/camp-leave/events/${eventId}/colleges/${encodeURIComponent(college)}/document${suffix}`, "集中请假名单.docx"), "材料已开始下载。");
  }

  async function uploadGroupResult(run: SchoolRun, groupIndex: number, file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch(`/api/admin/school-leave/runs/${run.id}/groups/${groupIndex}/result`, { method: "POST", credentials: "include", body: form });
      const payload = await response.json() as { code?: number; message?: string };
      if (!response.ok || (payload.code ?? 200) >= 400) throw new Error(payload.message || "签回材料上传失败");
      setNotice("签回材料已保存，有效期为 72 小时。"); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "签回材料上传失败"); }
    finally { setBusy(false); }
  }

  async function showCamp(id: number) {
    setSelectedCamp(null); setError("");
    try { setSelectedCamp(await leaveClient.campDetail(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "活动名单加载失败"); }
  }

  return <div className="admin-design space-y-5">
    <header className="admin-page-header">
      <div className="admin-eyebrow">吉甲 · 管理工作台</div>
      <h1 className="admin-page-title">请假工作台</h1>
      <p className="admin-page-description">日常材料、集中活动报名与历史记录都在这里办理。</p>
    </header>

    <nav aria-label="请假分类" className="flex flex-wrap gap-2 border-b border-[var(--admin-border-subtle)] pb-3">
      {([ ["daily", "日常请假"], ["camp", "集中请假"], ...(isAdmin ? [["records", "请假记录"]] : []) ] as Array<[Tab, string]>).map(([key, label]) =>
        <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)} className={`${button} ${tab === key ? "admin-button--primary" : "admin-button--secondary"}`}>{label}</button>)}
    </nav>

    {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</p> : null}
    {loading ? <p className="py-8 text-sm text-[var(--admin-muted)]">正在加载请假数据…</p> : null}

    {!loading ? <>
      <section className="admin-panel space-y-4 p-4 sm:p-5" aria-labelledby="leave-profile-title">
        <div className="admin-section-heading"><div><h2 id="leave-profile-title">请假资料</h2><p>此资料仅用于生成请假材料，与登录账号和招新权限分开保存。</p></div>{profile?.identityLocked ? <span className="admin-status">身份信息已锁定</span> : null}</div>
        <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="admin-field-label">姓名<input className={inputClass} required minLength={2} maxLength={50} value={profileDraft.name} readOnly={Boolean(profile?.identityLocked)} onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })} /></label>
          <label className="admin-field-label">学号<input className={inputClass} required inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={profileDraft.studentId} readOnly={Boolean(profile?.identityLocked)} onChange={(e) => setProfileDraft({ ...profileDraft, studentId: e.target.value })} /></label>
          <label className="admin-field-label">学院<select className={inputClass} required value={profileDraft.collegeCode} onChange={(e) => setProfileDraft({ ...profileDraft, collegeCode: e.target.value })}><option value="">选择学院</option>{colleges.map((college) => <option key={college.code} value={college.code}>{college.name}</option>)}</select></label>
          <div className="flex items-end"><button className={`${button} admin-button--primary`} disabled={busy}>保存请假资料</button></div>
        </form>
      </section>

      {tab === "daily" ? <div className="space-y-4">
        <section className="admin-panel space-y-4 p-4 sm:p-5">
          <div className="admin-section-heading"><div><h2>学校请假申请</h2><p>申请经管理员汇总后生成学校材料；待汇总前可以修改或撤回。</p></div></div>
          <form onSubmit={(e) => { e.preventDefault(); void runAction(() => leaveClient.createSchoolRequest(schoolDraft), "学校请假申请已提交。"); }} className="grid gap-3 sm:grid-cols-2">
            <label className="admin-field-label">开始时间<input className={inputClass} type="datetime-local" required value={schoolDraft.startAt} onChange={(e) => setSchoolDraft({ ...schoolDraft, startAt: e.target.value })} /></label>
            <label className="admin-field-label">结束时间<input className={inputClass} type="datetime-local" required value={schoolDraft.endAt} onChange={(e) => setSchoolDraft({ ...schoolDraft, endAt: e.target.value })} /></label>
            <div><button className={`${button} admin-button--secondary`} disabled={busy || !profileReady}>提交请假申请</button></div>
          </form>
          {!profileReady ? <p className="text-xs text-[var(--admin-muted)]">先完善请假资料，再提交申请。</p> : null}
          <div className="divide-y divide-[var(--admin-border-subtle)]">{requests.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span>{dateText(item.startAt)} 至 {dateText(item.endAt)} · {statusText(item.status)}</span>{item.status === "pending" ? <button type="button" className={`${button} admin-button--quiet`} disabled={busy} onClick={() => void runAction(() => leaveClient.withdrawSchoolRequest(item.id), "请假申请已撤回。")}>撤回</button> : null}</div>)}</div>
        </section>
        <section className="admin-panel space-y-4 p-4 sm:p-5">
          <div className="admin-section-heading"><div><h2>个人日常请假条</h2><p>填写时段后生成可下载的 Word 材料。再次下载会复用同一条记录。</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="admin-field-label">开始时间<input className={inputClass} type="datetime-local" value={dailyDraft.startAt} onChange={(e) => setDailyDraft({ ...dailyDraft, startAt: e.target.value })} /></label>
            <label className="admin-field-label">结束时间<input className={inputClass} type="datetime-local" value={dailyDraft.endAt} onChange={(e) => setDailyDraft({ ...dailyDraft, endAt: e.target.value })} /></label>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" className={`${button} admin-button--primary`} disabled={busy} onClick={() => void makeDaily()}>生成并下载</button><button type="button" className={`${button} admin-button--secondary`} disabled={busy} onClick={() => void makeDaily(true)}>线下签章版</button></div>
          {!profileReady ? <p className="text-xs text-[var(--admin-muted)]">完善上方姓名、学号和学院后即可生成。</p> : null}
        </section>
        {isAdmin ? <section className="admin-panel space-y-4 p-4 sm:p-5">
          <div className="admin-section-heading"><div><h2>共享请假活动</h2><p>活动链接可发给队员；公开链接允许未登录报名并限时下载材料。</p></div></div>
          <form onSubmit={(e) => { e.preventDefault(); void runAction(async () => { await leaveClient.createDailyWindow(windowDraft); setWindowDraft({ title: "", startAt: "", endAt: "", openUntil: "" }); }, "共享活动已创建。"); }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="admin-field-label">活动名称<input className={inputClass} required maxLength={100} value={windowDraft.title} onChange={(e) => setWindowDraft({ ...windowDraft, title: e.target.value })} /></label>
            <label className="admin-field-label">请假开始<input className={inputClass} type="datetime-local" required value={windowDraft.startAt} onChange={(e) => setWindowDraft({ ...windowDraft, startAt: e.target.value })} /></label>
            <label className="admin-field-label">请假结束<input className={inputClass} type="datetime-local" required value={windowDraft.endAt} onChange={(e) => setWindowDraft({ ...windowDraft, endAt: e.target.value })} /></label>
            <label className="admin-field-label">报名截止<input className={inputClass} type="datetime-local" required value={windowDraft.openUntil} onChange={(e) => setWindowDraft({ ...windowDraft, openUntil: e.target.value })} /></label>
            <div><button className={`${button} admin-button--primary`} disabled={busy}>创建共享活动</button></div>
          </form>
          <div className="divide-y divide-[var(--admin-border-subtle)]">
            {adminWindows.map((item) => <article key={item.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between"><div><strong className="text-sm">{item.title}</strong><p className="mt-1 text-xs text-[var(--admin-muted)]">{dateText(item.startAt)} 至 {dateText(item.endAt)} · {item.participantCount ?? 0} 人 · {item.acceptingParticipants ? "开放中" : statusText(item.status)}</p>{item.publicPath ? <p className="mt-1 break-all text-xs text-[var(--admin-muted)]">{publicURL(item.publicPath)}</p> : null}</div><div className="flex flex-wrap gap-2">{item.publicEnabled ? <button className={`${button} admin-button--secondary`} onClick={() => void navigator.clipboard.writeText(publicURL(item.publicPath))}>复制公开链接</button> : item.acceptingParticipants ? <button className={`${button} admin-button--secondary`} disabled={busy} onClick={() => void runAction(() => leaveClient.enableDailyPublicLink(item.id), "临时公开链接已开启。")}>开启公开链接</button> : null}{item.status === "open" ? <button className={`${button} admin-button--danger`} disabled={busy} onClick={() => void runAction(() => leaveClient.closeDailyWindow(item.id), "共享活动已关闭。")}>关闭</button> : null}</div></article>)}
            {!adminWindows.length ? <p className="py-3 text-sm text-[var(--admin-muted)]">还没有共享活动。</p> : null}
          </div>
        </section> : <section className="admin-panel space-y-4 p-4 sm:p-5"><div className="admin-section-heading"><div><h2>共享请假活动</h2><p>选择活动后生成同一时段的请假材料。</p></div></div><div className="divide-y divide-[var(--admin-border-subtle)]">{myWindows.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong className="text-sm">{item.title}</strong><p className="mt-1 text-xs text-[var(--admin-muted)]">{dateText(item.startAt)} 至 {dateText(item.endAt)}</p></div><button className={`${button} admin-button--primary`} disabled={busy || !item.acceptingParticipants} onClick={() => void makeShared(item)}>{item.acceptingParticipants ? "生成并下载" : "报名已截止"}</button></article>)}{!myWindows.length ? <p className="py-3 text-sm text-[var(--admin-muted)]">目前没有开放的共享活动。</p> : null}</div></section>}
        <section className="admin-panel p-4 sm:p-5"><div className="admin-section-heading"><div><h2>{isAdmin ? "请假条生成记录" : "我的请假记录"}</h2><p>保留个人与共享活动的材料生成历史。</p></div></div><div className="divide-y divide-[var(--admin-border-subtle)]">{dailyEntries.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{item.name} · {item.studentId}</span><span className="text-xs text-[var(--admin-muted)]">{item.startAt && item.endAt ? `${dateText(item.startAt)} 至 ${dateText(item.endAt)}` : "共享活动材料"} · {dateText(item.submittedAt)}</span></div>)}{!dailyEntries.length ? <p className="py-3 text-sm text-[var(--admin-muted)]">暂无生成记录。</p> : null}</div></section>
      </div> : null}

      {tab === "camp" ? <div className="space-y-4">
        {isAdmin ? <section className="admin-panel p-4 sm:p-5"><div className="admin-section-heading"><div><h2>创建集中请假活动</h2><p>设置活动日期和报名截止时间，系统生成可分享报名链接。</p></div></div><form onSubmit={(e) => { e.preventDefault(); void runAction(async () => { const created = await leaveClient.createCampEvent(campDraft); setCampDraft({ title: "", type: "winter", startDate: "", endDate: "", collectionDeadline: "" }); await showCamp(created.id); }, "集中请假活动已创建。"); }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="admin-field-label">活动名称<input className={inputClass} required maxLength={100} value={campDraft.title} onChange={(e) => setCampDraft({ ...campDraft, title: e.target.value })} /></label><label className="admin-field-label">活动类型<select className={inputClass} value={campDraft.type} onChange={(e) => setCampDraft({ ...campDraft, type: e.target.value as "winter" | "summer" })}><option value="winter">冬令营</option><option value="summer">夏令营</option></select></label><label className="admin-field-label">开始日期<input className={inputClass} type="date" required value={campDraft.startDate} onChange={(e) => setCampDraft({ ...campDraft, startDate: e.target.value })} /></label><label className="admin-field-label">结束日期<input className={inputClass} type="date" required value={campDraft.endDate} onChange={(e) => setCampDraft({ ...campDraft, endDate: e.target.value })} /></label><label className="admin-field-label">报名截止<input className={inputClass} type="datetime-local" required value={campDraft.collectionDeadline} onChange={(e) => setCampDraft({ ...campDraft, collectionDeadline: e.target.value })} /></label><div><button className={`${button} admin-button--primary`} disabled={busy}>创建活动</button></div></form></section> : null}
        <section className="admin-panel p-4 sm:p-5"><div className="admin-section-heading"><div><h2>集中请假活动</h2><p>报名结束后可按学院生成名单材料。</p></div></div><div className="divide-y divide-[var(--admin-border-subtle)]">{campEvents.map((event) => { const own = myCampEvents.find((item) => item.id === event.id); const isAccepting = event.acceptingParticipants; return <article key={event.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between"><div><strong className="text-sm">{event.title}</strong><p className="mt-1 text-xs text-[var(--admin-muted)]">{event.type === "winter" ? "冬令营" : "夏令营"} · {event.startDate.slice(0, 10)} 至 {event.endDate.slice(0, 10)} · {isAccepting ? "报名中" : statusText(event.status)}{own?.joined ? " · 已报名" : ""}</p>{isAdmin && event.publicPath ? <p className="mt-1 break-all text-xs text-[var(--admin-muted)]">{publicURL(event.publicPath)}</p> : null}</div><div className="flex flex-wrap gap-2">{isAdmin ? <><button className={`${button} admin-button--secondary`} onClick={() => void navigator.clipboard.writeText(publicURL(event.publicPath))}>复制报名链接</button><button className={`${button} admin-button--secondary`} onClick={() => void showCamp(event.id)}>查看名单</button>{isAccepting ? <button className={`${button} admin-button--danger`} disabled={busy} onClick={() => void runAction(() => leaveClient.closeCamp(event.id), "报名已关闭。")}>关闭报名</button> : null}</> : null}{isAccepting ? <button className={`${button} ${own?.joined ? "admin-button--secondary" : "admin-button--primary"}`} disabled={busy} onClick={() => void runAction(() => own?.joined ? leaveClient.leaveCamp(event.id) : leaveClient.joinCamp(event.id), own?.joined ? "已取消参加。" : "已确认参加。")}>{own?.joined ? "取消参加" : "确认参加"}</button> : null}{own?.joined && !isAccepting ? <button className={`${button} admin-button--secondary`} disabled={busy} onClick={() => void runAction(() => downloadLeaveFile(`/api/camp-leave/events/${event.id}/document`, "集中请假名单.docx"), "名单材料已开始下载。")}>下载本学院材料</button> : null}</div></article>; })}{!campEvents.length ? <p className="py-3 text-sm text-[var(--admin-muted)]">暂无开放或历史活动。</p> : null}</div></section>
        {isAdmin && selectedCamp ? <section className="admin-panel p-4 sm:p-5"><div className="admin-section-heading"><div><h2>{selectedCamp.event.title} · 报名名单</h2><p>共 {selectedCamp.event.participantCount ?? selectedCamp.groups.reduce((total, group) => total + group.count, 0)} 人。材料仅在收集结束后开放。</p></div><button className={`${button} admin-button--quiet`} onClick={() => setSelectedCamp(null)}>收起</button></div><div className="space-y-4">{selectedCamp.groups.map((group) => <div key={group.college} className="rounded-lg border border-[var(--admin-border-subtle)] p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{group.collegeName} · {group.count} 人</strong><div className="flex gap-2"><button className={`${button} admin-button--secondary`} disabled={selectedCamp.event.acceptingParticipants} onClick={() => void makeCampDocument(selectedCamp.event.id, group.college)}>下载名单</button><button className={`${button} admin-button--secondary`} disabled={selectedCamp.event.acceptingParticipants} onClick={() => void makeCampDocument(selectedCamp.event.id, group.college, true)}>线下签章版</button></div></div><div className="divide-y divide-[var(--admin-border-subtle)]">{group.participants.map((person) => <div key={person.id} className="flex items-center justify-between gap-2 py-2 text-xs"><span>{person.name} · {person.studentId}</span><button className={`${button} admin-button--danger`} disabled={!selectedCamp.event.acceptingParticipants || busy} onClick={() => void runAction(() => leaveClient.removeCampParticipant(selectedCamp.event.id, person.id), "报名记录已移除。")}>移除</button></div>)}</div></div>)}{!selectedCamp.groups.length ? <p className="text-sm text-[var(--admin-muted)]">暂时没有报名。</p> : null}</div></section> : null}
      </div> : null}

      {tab === "records" && isAdmin ? <div className="space-y-4">
        <section className="admin-panel p-4 sm:p-5"><div className="admin-section-heading"><div><h2>学校请假申请</h2><p>成员提交的待汇总申请；汇总后生成按时段分组的假条。</p></div><button className={`${button} admin-button--primary`} disabled={busy || !adminRequests.some((item) => item.status === "pending")} onClick={() => void runAction(async () => { await leaveClient.collectSchool(); }, "待处理申请已汇总。")}>汇总待处理申请</button></div><div className="divide-y divide-[var(--admin-border-subtle)]">{adminRequests.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span>{item.name} · {item.studentId}{item.isUnread ? <span className="ml-2 rounded-full bg-[var(--admin-surface-subtle)] px-2 py-0.5 text-xs text-amber-600">新事项</span> : null}</span><span className="flex flex-wrap items-center gap-2 text-xs text-[var(--admin-muted)]">{dateText(item.startAt)} 至 {dateText(item.endAt)} · {statusText(item.status)}{item.isUnread ? <button className={`${button} admin-button--quiet`} disabled={busy} onClick={() => void runAction(() => leaveClient.markAdminRecordRead("school_leave_request", item.id), "请假事项已标记为已读。")}>标记已读</button> : null}</span></div>)}{!adminRequests.length ? <p className="py-3 text-sm text-[var(--admin-muted)]">暂无正式请假申请。</p> : null}</div></section>
        <section className="admin-panel p-4 sm:p-5"><div className="admin-section-heading"><div><h2>汇总历史</h2><p>整批材料按时段分页，签回件保存在官网数据库并于 72 小时后失效。</p></div></div><div className="space-y-3">{runs.map((run) => <article key={run.id} className="rounded-lg border border-[var(--admin-border-subtle)] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="text-sm">{dateText(run.collectedAt)} · {run.memberCount} 人</strong><p className="mt-1 text-xs text-[var(--admin-muted)]">{run.requestCount} 条申请 · {statusText(run.status)}</p></div><div className="flex flex-wrap gap-2">{run.documentReady && run.status !== "cancelled" ? <button className={`${button} admin-button--primary`} disabled={busy} onClick={() => void runAction(() => downloadLeaveFile(`/api/admin/school-leave/runs/${run.id}/document`, `请假条_${run.id}.docx`), "整批假条已开始下载。")}>下载整批假条</button> : null}{run.status !== "completed" && run.status !== "cancelled" ? <button className={`${button} admin-button--danger`} disabled={busy} onClick={() => void runAction(() => leaveClient.cancelSchoolRun(run.id), "汇总已取消，申请已恢复待处理。")}>取消汇总</button> : null}{run.status === "cancelled" ? <button className={`${button} admin-button--danger`} disabled={busy} onClick={() => void runAction(() => leaveClient.deleteSchoolRun(run.id), "已取消的汇总历史已删除。")}>删除历史</button> : null}</div></div><div className="mt-3 space-y-2">{run.groups.map((group) => <div key={group.index} className="flex flex-col gap-2 rounded-md bg-[var(--admin-surface-subtle)] p-3 md:flex-row md:items-center md:justify-between"><div><strong className="text-xs">第 {group.index} 组 · {group.count} 人</strong><p className="mt-1 text-xs text-[var(--admin-muted)]">{group.timeText}</p><p className="mt-1 text-xs text-[var(--admin-muted)]">{group.members.map((person) => `${person.name}（${person.studentId}）`).join("、")}</p></div><div className="flex flex-wrap items-center gap-2">{group.result.available ? <button className={`${button} admin-button--secondary`} onClick={() => void runAction(() => downloadLeaveFile(`/api/admin/school-leave/runs/${run.id}/groups/${group.index}/result`, group.result.filename || "签回材料"), "签回材料已开始下载。")}>下载签回件</button> : null}{run.status === "awaiting_return" || run.status === "completed" ? <label className={`${button} admin-button--secondary cursor-pointer`}>上传签回件<input className="sr-only" type="file" accept=".jpg,.jpeg,.png,.pdf" disabled={busy} onChange={(e) => void uploadGroupResult(run, group.index, e.currentTarget.files?.[0])} /></label> : null}</div></div>)}</div></article>)}{!runs.length ? <p className="text-sm text-[var(--admin-muted)]">暂无汇总历史。</p> : null}</div></section>
        <section className="admin-panel p-4 sm:p-5"><div className="admin-section-heading"><div><h2>调整请假事由</h2><p>待下载或等待回传的汇总可以修改材料中的事由。</p></div></div><div className="divide-y divide-[var(--admin-border-subtle)]">{runs.filter((run) => run.status === "ready" || run.status === "awaiting_return").map((run) => <form key={run.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void runAction(() => leaveClient.updateSchoolReason(run.id, runReasonDraft[run.id] ?? run.reason), "请假事由已更新。"); }}><label className="admin-field-label flex-1">{dateText(run.collectedAt)} · 请假事由<input className={inputClass} required maxLength={500} value={runReasonDraft[run.id] ?? run.reason} onChange={(e) => setRunReasonDraft({ ...runReasonDraft, [run.id]: e.target.value })} /></label><button className={`${button} admin-button--secondary`} disabled={busy}>保存事由</button></form>)}{!runs.some((run) => run.status === "ready" || run.status === "awaiting_return") ? <p className="py-3 text-sm text-[var(--admin-muted)]">没有可调整事由的汇总。</p> : null}</div></section>
        <section className="admin-panel p-4 sm:p-5"><div className="admin-section-heading"><div><h2>日常请假历史</h2><p>最近生成的日常假条与共享活动材料记录。</p></div></div><div className="divide-y divide-[var(--admin-border-subtle)]">{dailyEntries.map((item) => <div key={item.id} className="py-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{item.name} · {item.studentId} · {colleges.find((c) => c.code === item.collegeCode)?.name ?? item.collegeCode}{item.isUnread ? <span className="ml-2 rounded-full bg-[var(--admin-surface-subtle)] px-2 py-0.5 text-xs text-amber-600">新事项</span> : null}</span><span className="flex flex-wrap items-center gap-2 text-xs text-[var(--admin-muted)]">{item.startAt && item.endAt ? `${dateText(item.startAt)} 至 ${dateText(item.endAt)}` : "共享活动"} · {dateText(item.submittedAt)}{item.isUnread ? <button className={`${button} admin-button--quiet`} disabled={busy} onClick={() => void runAction(() => leaveClient.markAdminRecordRead("daily_leave_entry", item.id), "请假事项已标记为已读。")}>标记已读</button> : null}</span></div>{item.documentRequests?.length ? <details className="mt-2 text-xs text-[var(--admin-muted)]"><summary className="cursor-pointer">查看文件请求（{item.documentRequests.length}）</summary><ul className="mt-2 space-y-1 pl-5">{item.documentRequests.map((request) => <li key={request.id}>{dateText(request.requestedAt)} · {request.requestStage === "prepare" ? "准备请求" : "文件下载"} · {request.requestType.includes("first_generation") ? "首次生成" : "重复请求"} · {request.fileVersion}{request.offline ? " · 线下签章版" : ""}</li>)}</ul></details> : null}</div>)}{!dailyEntries.length ? <p className="py-3 text-sm text-[var(--admin-muted)]">暂无日常请假历史。</p> : null}</div></section>
      </div> : null}
    </> : null}
  </div>;
}
