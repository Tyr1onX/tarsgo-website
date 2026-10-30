import { useEffect, useRef, useState, type FormEvent } from "react";
import { getPersonalTimetables, importPersonalTimetable, type PersonalTimetable } from "~/lib/timetable-client";

const MAX_TIMETABLE_BYTES = 5 * 1024 * 1024;

export function PersonalTimetableUpload({ userId }: { userId: number }) {
  const [records, setRecords] = useState<PersonalTimetable[]>([]);
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
      const result = await importPersonalTimetable(file);
      if (request.current !== id) return;
      setRecords([result]);
      setFile(null);
      form.reset();
      setMessage("课表已更新");
    } catch (cause) {
      if (request.current === id) setError(cause instanceof Error ? cause.message : "导入失败，原数据未更改");
    } finally {
      if (request.current === id) setUploading(false);
    }
  }

  return <section className="min-w-0 space-y-3 border-t border-[var(--admin-border-subtle)] pt-4">
    <h3 className="text-sm font-semibold">课程时间</h3>
    {loading ? <p className="text-sm text-[var(--admin-muted)]">正在读取导入状态…</p> :
      <p className="text-sm text-[var(--admin-muted)]">
        {records.length ? `已导入：${records[0].semester}` : "尚未导入课表"}
      </p>}
    <form className="min-w-0 space-y-3" onSubmit={(event) => void submit(event)} aria-busy={uploading}>
      <label className="admin-field-label block min-w-0">教务系统课表 Excel
        <input className="admin-field box-border w-full max-w-full min-w-0" type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required disabled={uploading}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0] ?? null;
            setMessage("");
            if (selected && !selected.name.toLowerCase().endsWith(".xlsx")) {
              setFile(null);
              setError("请选择 .xlsx 格式的教务系统课表");
              event.currentTarget.value = "";
              return;
            }
            if (selected && selected.size > MAX_TIMETABLE_BYTES) {
              setFile(null);
              setError("课表文件不能超过 5 MB");
              event.currentTarget.value = "";
              return;
            }
            setError("");
            setFile(selected);
          }} />
      </label>
      {file ? <p className="break-words text-xs text-[var(--admin-muted)] [overflow-wrap:anywhere]">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p> : null}
      <button className="btn-glass rounded-lg px-4 py-2 text-sm disabled:opacity-50" type="submit"
        disabled={!file || uploading}>{uploading ? "正在导入…" : "上传或更新课表"}</button>
    </form>
    {uploading ? <p role="status" className="text-sm text-[var(--admin-muted)]">正在上传并解析课表…</p> : null}
    {error ? <p role="alert" className="break-words text-sm text-rose-500 [overflow-wrap:anywhere]">{error}</p> : null}
    {message ? <p role="status" className="break-words text-sm text-emerald-600 [overflow-wrap:anywhere]">{message}</p> : null}
  </section>;
}
