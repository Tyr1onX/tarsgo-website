import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router";

import { leaveClient, type CampEvent, type CollegeOption } from "~/lib/leave-client";

export function meta() { return [{ title: "集中请假报名 | TARSGO" }, { name: "description", content: "冬夏令营集中请假报名" }]; }

export default function PublicCampLeave() {
  const { token = "" } = useParams();
  const [event, setEvent] = useState<CampEvent | null>(null);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [draft, setDraft] = useState({ name: "", studentId: "", collegeCode: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { void Promise.all([leaveClient.publicCampEvent(token), leaveClient.colleges()]).then(([activity, options]) => { setEvent(activity); setColleges(options); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "报名链接无效或已失效")).finally(() => setLoading(false)); }, [token]);

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault(); setError(""); setBusy(true);
    try { await leaveClient.publicJoinCamp(token, draft); setDone(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "报名失败"); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-12 sm:py-20"><a href="/" className="text-sm text-[var(--admin-muted)]">TARSGO</a><section className="admin-design admin-panel mt-6 space-y-5 p-5 sm:p-8"><header><p className="admin-eyebrow">集中请假</p><h1 className="admin-page-title mt-2">活动报名</h1><p className="admin-page-description mt-2">填写请假材料所需信息，确认参加后会加入该活动名单。</p></header>
    {loading ? <p className="text-sm text-[var(--admin-muted)]">正在读取活动…</p> : null}
    {error ? <p role="alert" className="admin-notice admin-notice--error">{error}</p> : null}
    {event ? <><div className="rounded-lg border border-[var(--admin-border-subtle)] p-4"><strong>{event.title}</strong><p className="mt-2 text-sm text-[var(--admin-muted)]">{event.type === "winter" ? "冬令营" : "夏令营"} · {event.startDate.slice(0, 10)} 至 {event.endDate.slice(0, 10)}</p><p className="mt-1 text-xs text-[var(--admin-muted)]">报名截止：{event.collectionDeadline.slice(0, 16).replace("T", " ")}</p></div>
      {done ? <p role="status" className="admin-notice admin-notice--success">报名已提交，感谢配合。</p> : event.acceptingParticipants ? <form onSubmit={submit} className="grid gap-4"><label className="admin-field-label">姓名<input className="admin-field" required minLength={2} maxLength={50} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label className="admin-field-label">8 位学号<input className="admin-field" inputMode="numeric" pattern="[0-9]{8}" required maxLength={8} value={draft.studentId} onChange={(e) => setDraft({ ...draft, studentId: e.target.value })} /></label><label className="admin-field-label">学院<select className="admin-field" required value={draft.collegeCode} onChange={(e) => setDraft({ ...draft, collegeCode: e.target.value })}><option value="">选择学院</option>{colleges.map((college) => <option key={college.code} value={college.code}>{college.name}</option>)}</select></label><button className="admin-button admin-button--primary" disabled={busy}>{busy ? "正在提交…" : "确认参加"}</button></form> : <p className="text-sm text-[var(--admin-muted)]">本次活动已停止报名。</p>}
    </> : null}
  </section></main>;
}
