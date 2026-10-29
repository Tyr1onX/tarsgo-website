import { useEffect, useRef, useState, type FormEvent } from "react";
import { getPersonalTimetables, importPersonalTimetable, type PersonalTimetable } from "~/lib/timetable-client";

export function PersonalTimetableUpload({ userId }: { userId: number }) {
  const [records, setRecords] = useState<PersonalTimetable[]>([]);
  const [semester, setSemester] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true);
    void getPersonalTimetables().then((value) => {
      if (request.current === id) setRecords(value);
    }).catch((cause) => {
      if (request.current === id) setError(cause instanceof Error ? cause.message : "读取导入状态失败");
    }).finally(() => { if (request.current === id) setLoading(false); });
    return () => { request.current++; };
  }, [userId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading) return;
    const id = request.current;
    const form = event.currentTarget;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const result = await importPersonalTimetable(semester.trim(), file);
      const latest = await getPersonalTimetables();
      if (request.current !== id) return;
      setRecords(latest);
      setFile(null);
      setSemester("");
      form.reset();
      setMessage(`已更新 ${result.semester} 的课程占用数据。${result.notes.length ? `另有 ${result.notes.length} 门时间未确定的课程，不计入固定占用。` : ""}`);
    } catch (cause) {
      if (request.current === id) setError(cause instanceof Error ? cause.message : "导入失败，原数据未更改");
    } finally {
      if (request.current === id) setUploading(false);
    }
  }

  return <section className="space-y-3 border-t border-[var(--admin-border-subtle)] pt-4">
    <h3 className="text-sm font-semibold">课程时间</h3>
    {loading ? <p className="text-sm text-[var(--admin-muted)]">正在读取导入状态…</p> :
      <p className="text-sm text-[var(--admin-muted)]">
        {records.length ? `已导入：${records.map((record) => record.semester).join("、")}` : "尚未导入课表"}
      </p>}
    <form className="space-y-3" onSubmit={(event) => void submit(event)}>
      <label className="admin-field-label block">教务系统课表 Excel
        <input className="admin-field w-full" type="file" accept=".xlsx" required disabled={uploading}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <label className="admin-field-label block">学期（文件无法识别时填写）
        <input className="admin-field w-full" value={semester} maxLength={40} disabled={uploading}
          placeholder="如 2026-2027学年第1学期" onChange={(event) => setSemester(event.target.value)} />
      </label>
      <button className="btn-glass rounded-lg px-4 py-2 text-sm disabled:opacity-50" type="submit"
        disabled={!file || uploading}>{uploading ? "正在导入…" : "上传或更新课表"}</button>
    </form>
    {error ? <p role="alert" className="text-sm text-rose-500">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-emerald-600">{message}</p> : null}
  </section>;
}
