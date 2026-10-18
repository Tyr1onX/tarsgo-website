import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router";

import { downloadLeaveFile, leaveClient, type CollegeOption, type DailyWindow, type ReadyDownload } from "~/lib/leave-client";

export function meta() { return [{ title: "日常请假报名 | TARSGO" }, { name: "description", content: "日常请假活动材料生成" }]; }

export default function PublicDailyLeave() {
  const { token = "" } = useParams();
  const [window, setWindow] = useState<DailyWindow | null>(null);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [draft, setDraft] = useState({ name: "", studentId: "", collegeCode: "" });
  const [ready, setReady] = useState<ReadyDownload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { void Promise.all([leaveClient.publicDailyWindow(token), leaveClient.colleges()]).then(([activity, options]) => { setWindow(activity); setColleges(options); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "活动链接无效或已失效")).finally(() => setLoading(false)); }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await leaveClient.preparePublicDaily(token, draft, false);
      setReady(result);
      await downloadLeaveFile(result.downloadUrl, result.filename);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "报名失败"); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-12 sm:py-20"><a href="/" className="text-sm text-[var(--admin-muted)]">TARSGO</a><section className="admin-design admin-panel mt-6 space-y-5 p-5 sm:p-8"><header><p className="admin-eyebrow">日常请假</p><h1 className="admin-page-title mt-2">共享活动材料</h1><p className="admin-page-description mt-2">填写姓名、学号和学院，生成对应时段的请假条。</p></header>
    {loading ? <p className="text-sm text-[var(--admin-muted)]">正在读取活动…</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
    {window ? <><div className="rounded-lg border border-[var(--admin-border-subtle)] p-4"><strong>{window.title}</strong><p className="mt-2 text-sm text-[var(--admin-muted)]">{window.startAt.slice(0, 16).replace("T", " ")} 至 {window.endAt.slice(0, 16).replace("T", " ")}</p><p className="mt-1 text-xs text-[var(--admin-muted)]">报名截止：{window.openUntil.slice(0, 16).replace("T", " ")}</p></div>
      {window.acceptingParticipants ? <form onSubmit={submit} className="grid gap-4"><label className="admin-field-label">姓名<input className="admin-field" required minLength={2} maxLength={50} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label className="admin-field-label">8 位学号<input className="admin-field" inputMode="numeric" pattern="[0-9]{8}" required maxLength={8} value={draft.studentId} onChange={(e) => setDraft({ ...draft, studentId: e.target.value })} /></label><label className="admin-field-label">学院<select className="admin-field" required value={draft.collegeCode} onChange={(e) => setDraft({ ...draft, collegeCode: e.target.value })}><option value="">选择学院</option>{colleges.map((college) => <option key={college.code} value={college.code}>{college.name}</option>)}</select></label><button className="admin-button admin-button--primary" disabled={busy}>{busy ? "正在生成…" : "提交并下载请假条"}</button></form> : <p className="text-sm text-[var(--admin-muted)]">本次活动已停止报名。</p>}
      {ready ? <p className="text-xs text-[var(--admin-muted)]">若浏览器没有自动下载，可<a className="underline" href={ready.downloadUrl}>再次获取材料</a>。下载链接有效 72 小时。</p> : null}
    </> : null}
  </section></main>;
}
