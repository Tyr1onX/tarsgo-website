import { BrandLoader } from "~/components/brand-loader";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { listAdminUsers, type AdminUserListItem } from "~/lib/admin-users-client";
import { Notify } from "~/components/notify";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { downloadLeaveFile, leaveClient, type CollegeOption, type DailyEntry, type LeaveAccessRequest, type LeaveAccessState, type LeaveProfile } from "~/lib/leave-client";

const inputClass = "admin-field";
const button = "admin-button admin-button--small";

function localDateTime(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function dateText(value?: string) { return value ? value.slice(0, 16).replace("T", " ") : "—"; }
export function meta() { return [{ title: "请假工作台 | TARSGO" }, { name: "description", content: "日常请假" }]; }

export default function LeaveWorkbench() {
  const { currentUser, openMyProfile, profileRevision } = useOutletContext<DashboardLayoutOutletContext>();
  const isAdmin = currentUser.role.name === "admin" || currentUser.role.name === "super_admin";
  const isSuperAdmin = currentUser.role.name === "super_admin";
  const [accessState, setAccessState] = useState<LeaveAccessState | null>(null);
  const [accessRequests, setAccessRequests] = useState<LeaveAccessRequest[]>([]);
  const [permissions, setPermissions] = useState<LeaveAccessRequest[]>([]);
  const [accountKeyword, setAccountKeyword] = useState("");
  const [accountResults, setAccountResults] = useState<AdminUserListItem[]>([]);
  const [delegateKeyword, setDelegateKeyword] = useState("");
  const [delegateResults, setDelegateResults] = useState<AdminUserListItem[]>([]);
  const [delegateAccount, setDelegateAccount] = useState<AdminUserListItem | null>(null);
  const [delegateProfile, setDelegateProfile] = useState<LeaveProfile | null>(null);
  const [delegateDraft, setDelegateDraft] = useState({ startAt: "", endAt: "" });
  const [profile, setProfile] = useState<LeaveProfile | null>(null);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [historyCursor, setHistoryCursor] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const loadSequence = useRef(0);
  const historySequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dailyDraft, setDailyDraft] = useState({ startAt: "", endAt: "" });

  const profileReady = useMemo(() => Boolean(profile?.name && /^[0-9]{8}$/.test(profile.studentId) && profile.collegeCode), [profile]);

  async function load() {
    const generation = ++loadSequence.current;
    historySequence.current++;
    setHistoryLoading(false); setHistoryError("");
    setLoading(true); setError("");
    try {
      const nextAccessState = await leaveClient.leaveAccess();
      if (generation !== loadSequence.current) return;
      setAccessState(nextAccessState);
      if (!isSuperAdmin && !["granted", "pending", "approved"].includes(nextAccessState.status)) return;
      const [nextProfile, nextColleges, nextDaily, nextAccessRequests, nextPermissions] = await Promise.all([
        leaveClient.profile(), leaveClient.colleges(), leaveClient.dailyRecordsPage(isAdmin),
        isSuperAdmin ? leaveClient.pendingLeaveAccessRequests() : Promise.resolve([]),
        isSuperAdmin ? leaveClient.leavePermissions() : Promise.resolve([]),
      ]);
      if (generation !== loadSequence.current) return;
      setProfile(nextProfile);
      setColleges(nextColleges); setDailyEntries(nextDaily.items); setHistoryCursor(nextDaily.nextCursor ?? "");
      setAccessRequests(nextAccessRequests);
      setPermissions(nextPermissions);
    } catch (reason) { if (generation === loadSequence.current) setError(reason instanceof Error ? reason.message : "请假工作台暂时无法加载"); }
    finally { if (generation === loadSequence.current) setLoading(false); }
  }

  async function loadOlderHistory() {
    if (!historyCursor || historyLoading) return;
    const generation = ++historySequence.current;
    setHistoryLoading(true); setHistoryError("");
    try {
      const page = await leaveClient.dailyRecordsPage(isAdmin, historyCursor);
      if (generation !== historySequence.current) return;
      setDailyEntries(current => {
        const ids = new Set(current.map(entry => entry.id));
        return [...current, ...page.items.filter(entry => !ids.has(entry.id))];
      });
      setHistoryCursor(page.nextCursor ?? "");
    } catch (cause) {
      if (generation === historySequence.current) setHistoryError(cause instanceof Error ? cause.message : "请假历史加载失败");
    } finally {
      if (generation === historySequence.current) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    setDailyEntries([]); setHistoryCursor(""); setProfile(null); setAccessState(null);
    void load();
    return () => { loadSequence.current++; historySequence.current++; };
  }, [currentUser.id, profileRevision]);
  useEffect(() => {
    const now = new Date();
    setDailyDraft({ startAt: localDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0)), endAt: localDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 10)) });
    setDelegateDraft({ startAt: localDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0)), endAt: localDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 10)) });
  }, []);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function reviewLeaveAccess(request: LeaveAccessRequest, status: "approved" | "rejected") {
    await runAction(() => leaveClient.reviewLeaveAccessRequest(request.id, status), status === "approved" ? "本次请假已批准。" : "本次请假已拒绝。");
  }

  async function findAccounts() {
    setBusy(true); setError("");
    try {
      const result = await listAdminUsers({ keyword: accountKeyword.trim(), pageSize: 10, includeInactive: true });
      setAccountResults(result.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "查找账号失败"); }
    finally { setBusy(false); }
  }

  async function setPermission(userId: number, mode: "permanent" | "temporary" | "revoke") {
    await runAction(() => leaveClient.setLeavePermission(userId, mode), mode === "permanent" ? "长期使用权限已开通。" : mode === "temporary" ? "已授权一次请假。" : "已收回请假台使用资格。");
  }

  async function findDelegates() {
    setBusy(true); setError("");
    try {
      const result = await listAdminUsers({ keyword: delegateKeyword.trim(), pageSize: 10 });
      setDelegateResults(result.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "查找成员失败"); }
    finally { setBusy(false); }
  }

  async function selectDelegate(user: AdminUserListItem) {
    setBusy(true); setError(""); setDelegateAccount(user); setDelegateProfile(null);
    try { setDelegateProfile(await leaveClient.adminMemberProfile(user.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "读取成员资料失败"); }
    finally { setBusy(false); }
  }

  async function makeDelegateDaily(offline = false) {
    if (!delegateAccount || !delegateProfile) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await leaveClient.adminGenerateDaily(delegateAccount.id, delegateDraft, offline);
      setNotice(`已生成 ${delegateAccount.realName || delegateAccount.email} 的假条，可将下载文件发送给成员。`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "代生成假条失败"); }
    finally { setBusy(false); }
  }

  async function makeDaily(offline = false) {
    if (!profileReady) { setError("请先完善学号和学院。"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      if (accessState?.status !== "approved") throw new Error("请假台尚未授权或本次请假尚未获批");
      const permanent = !accessState.startAt && !accessState.endAt;
      if (!permanent && (!accessState.startAt || !accessState.endAt)) throw new Error("请假审批时段无效");
      const ready = await leaveClient.prepareDailySelf(permanent ? dailyDraft : { startAt: accessState.startAt!, endAt: accessState.endAt! }, offline);
      await downloadLeaveFile(ready.downloadUrl, ready.filename);
      setNotice(permanent ? "假条已生成并开始下载。" : "假条已生成，临时资格已自动收回。"); await load();
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "请假条生成失败"); }
    finally { setBusy(false); }
  }

  return <div className="admin-design space-y-5">
    <header className="admin-page-header">
      <h1 className="admin-page-title">请假工作台</h1>
    </header>

    {error ? <p role="alert" className="admin-notice admin-notice--error">{error}</p> : null}
    {notice ? <Notify tone="success" message={notice} onClose={() => setNotice("")} /> : null}
    {loading && !profile && dailyEntries.length === 0 ? <BrandLoader label="正在加载请假数据" /> : null}

    {!loading && !isSuperAdmin && accessState && !["granted", "pending", "approved"].includes(accessState.status) ? <section className="admin-panel p-4 sm:p-5">
      <p role="status" className="text-sm text-[var(--admin-muted)]">{accessState.status === "used" ? "本次假条已生成，请假台使用资格已收回。" : "暂无请假台使用资格，请联系超级管理员。"}</p>
    </section> : null}

    {!loading && (isSuperAdmin || ["granted", "pending", "approved"].includes(accessState?.status ?? "")) ? <>
      {isSuperAdmin ? <div className="space-y-4">
        <section className="admin-panel space-y-3 p-4 sm:p-5" aria-labelledby="leave-access-requests-title">
          <div className="admin-section-heading"><h2 id="leave-access-requests-title">待审批申请（{accessRequests.length}）</h2></div>
          <div className="divide-y divide-[var(--admin-border-subtle)]">{accessRequests.map((request) => <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><strong className="text-sm">{request.userName || request.email}</strong><p className="mt-1 text-xs text-[var(--admin-muted)]">{request.email} · {dateText(request.startAt)} 至 {dateText(request.endAt)}</p></div>
            <div className="flex flex-wrap gap-2"><Link to={`/dashboard/admin/users?userId=${request.userId}`} className={`${button} admin-button--secondary`}>查看账号</Link><button type="button" className={`${button} admin-button--primary`} disabled={busy} onClick={() => void reviewLeaveAccess(request, "approved")}>批准</button><button type="button" className={`${button} admin-button--quiet`} disabled={busy} onClick={() => void reviewLeaveAccess(request, "rejected")}>拒绝</button></div>
          </article>)}{!accessRequests.length ? <p className="py-2 text-sm text-[var(--admin-muted)]">暂无待审批申请。</p> : null}</div>
        </section>
        <section className="admin-panel space-y-3 p-4 sm:p-5" aria-labelledby="leave-delegate-title">
          <div className="admin-section-heading"><h2 id="leave-delegate-title">代成员生成假条</h2></div>
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void findDelegates(); }}>
            <input className={`${inputClass} flex-1`} value={delegateKeyword} onChange={(event) => setDelegateKeyword(event.target.value)} placeholder="搜索姓名或邮箱" aria-label="搜索代生成成员" required />
            <button type="submit" className={`${button} admin-button--secondary`} disabled={busy || !delegateKeyword.trim()}>查找</button>
          </form>
          {delegateResults.length > 0 ? <div className="divide-y divide-[var(--admin-border-subtle)]">{delegateResults.map((user) => <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>{user.realName || user.email} · {user.email}</span>
            <button type="button" className={`${button} admin-button--secondary`} disabled={busy || user.status !== 1} onClick={() => void selectDelegate(user)}>选择</button>
          </div>)}</div> : null}
          {delegateAccount ? <div className="space-y-3 border-t border-[var(--admin-border-subtle)] pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <strong>{delegateAccount.realName || delegateAccount.email}</strong>
              <button type="button" className={`${button} admin-button--quiet`} onClick={() => void navigator.clipboard.writeText(delegateAccount.email)}>复制邮箱</button>
            </div>
            {delegateProfile ? <p className="text-xs text-[var(--admin-muted)]">{delegateProfile.name} · {delegateProfile.studentId} · {colleges.find((item) => item.code === delegateProfile.collegeCode)?.name ?? delegateProfile.collegeCode}</p> : <p className="text-xs text-[var(--admin-muted)]">{busy ? "正在读取成员学籍资料…" : "该成员缺少完整学籍资料，暂不能生成假条。"}</p>}
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void makeDelegateDaily(); }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="admin-field-label">请假开始<input type="datetime-local" className={inputClass} required value={delegateDraft.startAt} onChange={(event) => setDelegateDraft({ ...delegateDraft, startAt: event.target.value })} /></label>
                <label className="admin-field-label">请假结束<input type="datetime-local" className={inputClass} required value={delegateDraft.endAt} onChange={(event) => setDelegateDraft({ ...delegateDraft, endAt: event.target.value })} /></label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={`${button} admin-button--primary`} disabled={busy || !delegateProfile}>生成并下载</button>
                <button type="button" className={`${button} admin-button--secondary`} disabled={busy || !delegateProfile} onClick={(event) => { if (event.currentTarget.form?.reportValidity()) void makeDelegateDaily(true); }}>线下签章版</button>
              </div>
            </form>
          </div> : null}
        </section>
        <details className="admin-panel p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold">授权管理（{permissions.length}）</summary>
          <div className="space-y-3 pt-4">
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void findAccounts(); }}>
            <input className={`${inputClass} flex-1`} value={accountKeyword} onChange={(event) => setAccountKeyword(event.target.value)} placeholder="按姓名或邮箱搜索账号" aria-label="搜索成员账号" required />
            <button className={`${button} admin-button--secondary`} disabled={busy || !accountKeyword.trim()}>搜索</button>
          </form>
          {accountResults.length ? <div className="divide-y divide-[var(--admin-border-subtle)]">{accountResults.map((user) => {
            const permission = permissions.find((item) => item.userId === user.id);
            const permanent = permission?.status === "approved" && !permission.startAt && !permission.endAt;
            return <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>{user.realName || user.email} · {user.email}</span>
              <div className="flex gap-2">
                <button type="button" className={`${button} admin-button--primary`} disabled={busy || user.status !== 1 || permanent} onClick={() => void setPermission(user.id, "permanent")}>{permanent ? "长期已授权" : "长期授权"}</button>
                <button type="button" className={`${button} admin-button--secondary`} disabled={busy || user.status !== 1 || (permission && !permanent)} onClick={() => void setPermission(user.id, "temporary")}>临时授权</button>
              </div>
            </div>;
          })}</div> : null}
          <div className="divide-y divide-[var(--admin-border-subtle)]">{permissions.map((item) => <div key={item.userId} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>{item.userName || item.email} · {item.email} · {item.status === "approved" && !item.startAt && !item.endAt ? "长期授权" : item.status === "granted" ? "临时待申请" : item.status === "pending" ? "临时待审核" : "临时待生成"}</span>
            <button type="button" className={`${button} admin-button--quiet`} disabled={busy} onClick={() => void setPermission(item.userId, "revoke")}>取消资格</button>
          </div>)}{!permissions.length ? <p className="py-2 text-sm text-[var(--admin-muted)]">暂无已授权成员。</p> : null}</div>
          </div>
        </details>
      </div> : null}
      <div className="space-y-4">
        {accessState?.status === "granted" ? <section className="admin-panel space-y-3 p-4 sm:p-5">
          <div className="admin-section-heading"><h2>一次性请假申请</h2></div>
          <form onSubmit={(event) => { event.preventDefault(); void runAction(() => leaveClient.requestLeaveAccess(dailyDraft), "请假申请已提交。"); }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="admin-field-label">开始时间<input className={inputClass} type="datetime-local" required value={dailyDraft.startAt} onChange={(event) => setDailyDraft({ ...dailyDraft, startAt: event.target.value })} /></label>
              <label className="admin-field-label">结束时间<input className={inputClass} type="datetime-local" required value={dailyDraft.endAt} onChange={(event) => setDailyDraft({ ...dailyDraft, endAt: event.target.value })} /></label>
            </div>
            <button className={`${button} admin-button--primary`} disabled={busy}>提交申请</button>
          </form>
        </section> : null}
        {accessState?.status === "pending" ? <section className="admin-panel p-4 sm:p-5"><p role="status">请假申请待审批 · {dateText(accessState.startAt)} 至 {dateText(accessState.endAt)}</p></section> : null}
        {accessState?.status === "approved" && !accessState.startAt && !accessState.endAt ? <section className="admin-panel space-y-3 p-4 sm:p-5">
          <div className="admin-section-heading"><h2>自助生成假条</h2></div>
          <form onSubmit={(event) => { event.preventDefault(); void makeDaily(); }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="admin-field-label">开始时间<input className={inputClass} type="datetime-local" required value={dailyDraft.startAt} onChange={(event) => setDailyDraft({ ...dailyDraft, startAt: event.target.value })} /></label>
              <label className="admin-field-label">结束时间<input className={inputClass} type="datetime-local" required value={dailyDraft.endAt} onChange={(event) => setDailyDraft({ ...dailyDraft, endAt: event.target.value })} /></label>
            </div>
            <div className="flex flex-wrap gap-2"><button type="submit" className={`${button} admin-button--primary`} disabled={busy || !profileReady}>生成并下载</button><button type="button" className={`${button} admin-button--secondary`} disabled={busy || !profileReady} onClick={(event) => { if (event.currentTarget.form?.reportValidity()) void makeDaily(true); }}>线下签章版</button></div>
          </form>
          {!profileReady ? <button type="button" className={`${button} admin-button--secondary`} onClick={() => openMyProfile("settings")}>完善学籍资料</button> : null}
        </section> : null}
        {accessState?.status === "approved" && accessState.startAt && accessState.endAt ? <section className="admin-panel space-y-3 p-4 sm:p-5">
          <div className="admin-section-heading"><h2>已批准 · 生成一次假条</h2></div>
          <p className="text-sm">{dateText(accessState.startAt)} 至 {dateText(accessState.endAt)}</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={`${button} admin-button--primary`} disabled={busy || !profileReady} onClick={() => void makeDaily()}>生成并下载</button><button type="button" className={`${button} admin-button--secondary`} disabled={busy || !profileReady} onClick={() => void makeDaily(true)}>线下签章版</button></div>
          {!profileReady ? <button type="button" className={`${button} admin-button--secondary`} onClick={() => openMyProfile("settings")}>完善学籍资料</button> : null}
        </section> : null}
        <section className="admin-panel p-4 sm:p-5"><div className="admin-section-heading"><h2>{isAdmin ? "请假条生成记录" : "我的请假记录"}</h2></div><div className="divide-y divide-[var(--admin-border-subtle)]">{dailyEntries.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{item.name} · {item.studentId}</span><span className="text-xs text-[var(--admin-muted)]">{item.startAt && item.endAt ? `${dateText(item.startAt)} 至 ${dateText(item.endAt)}` : "共享活动材料"} · {dateText(item.submittedAt)}</span></div>)}{!dailyEntries.length ? <p className="py-3 text-sm text-[var(--admin-muted)]">暂无生成记录。</p> : null}</div>{historyError ? <p role="alert">{historyError}</p> : null}{historyCursor ? <button type="button" className="admin-button admin-button--quiet" disabled={historyLoading} onClick={() => void loadOlderHistory()}>{historyLoading ? "读取中…" : historyError ? "重试加载历史" : "加载更早记录"}</button> : null}</section>
      </div>

    </> : null}
  </div>;
}
