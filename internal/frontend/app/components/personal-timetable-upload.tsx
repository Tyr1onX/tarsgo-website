import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileUploadField, type FileUploadStatus } from "~/components/file-upload-field";
import { getPersonalTimetables, importPersonalTimetable, type PersonalTimetable } from "~/lib/timetable-client";

const MAX_TIMETABLE_BYTES = 5 * 1024 * 1024;

export function PersonalTimetableUpload({ userId }: { userId: number }) {
  const [records, setRecords] = useState<PersonalTimetable[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<FileUploadStatus>("pending");
  const [fileError, setFileError] = useState("");
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

  async function importSelected() {
    if (!file || uploading) return;
    const id = request.current;
    setUploading(true);
    setUploadStatus("uploading");
    setError("");
    setMessage("");
    try {
      const result = await importPersonalTimetable(file);
      if (request.current !== id) return;
      setRecords([result]);
      setFile(null);
      setUploadStatus("pending");
      setFileError("");
      setMessage("课表已更新");
    } catch (cause) {
      if (request.current === id) {
        setUploadStatus("failed");
        setFileError(cause instanceof Error ? cause.message : "导入失败，原数据未更改");
      }
    } finally {
      if (request.current === id) setUploading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void importSelected();
  }

  return (
    <section className="min-w-0 space-y-4 border-t border-[var(--admin-border-subtle)] pt-5" aria-labelledby="profile-timetable-heading">
      <div className="min-w-0">
        <h3 id="profile-timetable-heading" className="text-sm font-semibold text-[var(--admin-text)]">课程时间</h3>
        <p className="mt-1 break-words text-xs leading-relaxed text-[var(--admin-muted)]">
          {loading ? "正在读取导入状态…" : records.length ? "已导入：" + records[0].semester : "尚未导入课表"}
        </p>
      </div>
      <form className="min-w-0 space-y-3" onSubmit={(event) => void submit(event)} aria-busy={uploading}>
        <FileUploadField
          label="教务系统课表 Excel"
          files={file ? [file] : []}
          onFilesChange={(files) => {
            const selected = files[0] ?? null;
            setMessage("");
            setError("");
            setFileError("");
            setUploadStatus("pending");
            setFile(selected);
          }}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          variant="compact"
          triggerLabel={file ? "重新选择" : "选择文件"}
          hint="XLSX，最大 5 MB"
          error={fileError}
          disabled={uploading}
          status={uploadStatus}
          onRetry={() => void importSelected()}
          validateSelection={(_nextFiles, incomingFiles) => {
            const selected = incomingFiles[0];
            if (selected && !selected.name.toLowerCase().endsWith(".xlsx")) return "请选择 .xlsx 格式的教务系统课表";
            if (selected && selected.size > MAX_TIMETABLE_BYTES) return "课表文件不能超过 5 MB";
            return null;
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-glass min-h-10 rounded-xl px-4 py-2 text-sm disabled:opacity-50" type="submit" disabled={!file || uploading}>
            {uploading ? "正在导入…" : "上传或更新课表"}
          </button>
          <span className="text-xs text-[var(--admin-muted)]">独立上传，无需点击下方「保存修改」</span>
        </div>
      </form>
      {uploading ? <p role="status" className="text-sm text-[var(--admin-muted)]">正在上传并解析课表…</p> : null}
      {error ? <p role="alert" className="break-words text-sm text-rose-500 [overflow-wrap:anywhere]">{error}</p> : null}
      {message ? <p role="status" className="break-words text-sm text-emerald-600 [overflow-wrap:anywhere]">{message}</p> : null}
    </section>
  );
}
