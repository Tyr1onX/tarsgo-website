import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  getOperationsBoard, saveOperationsStep, uploadOperationsStepFile,
  type OperationsBoard, type OperationsStepStatus,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "更新环节状态 | TARSGO" }]; }

const labels: Record<OperationsStepStatus, string> = {
  pending: "待处理", active: "进行中", blocked: "受阻", done: "已完成",
};

export default function OperationsStepStatusPage() {
  const { itemId, stepId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [status, setStatus] = useState<OperationsStepStatus>("pending");
  const [blockReason, setBlockReason] = useState("");
  const [note, setNote] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((result) => {
      if (!active) return;
      setBoard(result);
      const step = result.items.find((item) => item.id === Number(itemId))?.steps.find((entry) => entry.id === Number(stepId));
      if (step) { setStatus(step.status); setBlockReason(step.blockReason); }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, [itemId, stepId]);

  const item = board?.items.find((entry) => entry.id === Number(itemId));
  const step = item?.steps.find((entry) => entry.id === Number(stepId));
  const canUpdate = Boolean(step && (board?.canManage || step.assigneeId === board?.viewerId));
  const changed = Boolean(step && (
    status !== step.status || status === "blocked" && blockReason.trim() !== step.blockReason ||
    note.trim() || evidenceUrl.trim() || file
  ));
  const detailUrl = `/dashboard/workbench/operations/${itemId}/steps/${stepId}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !step || !canUpdate || !changed || saving) return;
    if (status === "blocked" && !blockReason.trim()) { setError("请填写具体卡点"); return; }
    if (file && file.size > 20 * 1024 * 1024) { setError("文件不能超过20 MB"); return; }
    const summary = status === step.status
      ? `确认提交「${item.title} / ${step.title}」的进展材料？`
      : `确认将「${item.title} / ${step.title}」从「${labels[step.status]}」改为「${labels[status]}」？`;
    if (!window.confirm(summary)) return;
    setSaving(true);
    setError("");
    let fileUploaded = false;
    try {
      if (file) {
        await uploadOperationsStepFile(item.id, step.id, file);
        fileUploaded = true;
        setFile(null);
      }
      if (status !== step.status || (status === "blocked" && blockReason.trim() !== step.blockReason)
        || note.trim() || evidenceUrl.trim()) {
        await saveOperationsStep(item.id, step.id, {
          status, ...(status === "blocked" ? { blockReason: blockReason.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {}),
        });
      }
      navigate(detailUrl, { replace: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "保存失败";
      setError(fileUploaded ? `文件已提交，但状态未更新：${message}` : message);
    } finally { setSaving(false); }
  }

  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to={detailUrl}>返回环节详情</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board ? <p className="operations-progress__muted">正在加载…</p>
      : !item || !step ? <p className="operations-progress__error">环节不存在</p>
      : !canUpdate ? <p className="operations-progress__error">只能更新自己负责的环节</p>
      : <form className="operations-progress__item operations-progress__status-editor" onSubmit={(event) => void submit(event)}>
        <p className="operations-progress__muted">{item.title} / {step.title}</p>
        <h1>更新状态</h1>
        <label>当前状态
          <select value={status} onChange={(event) => { setStatus(event.target.value as OperationsStepStatus); setError(""); }}>
            <option value="pending">待处理</option><option value="active">进行中</option>
            <option value="blocked">受阻</option><option value="done">已完成</option>
          </select>
        </label>
        {status === "blocked" ? <label>卡点原因
          <textarea required maxLength={300} rows={3} value={blockReason}
            onChange={(event) => setBlockReason(event.target.value)} />
        </label> : null}
        <label>进展备注（选填）
          <textarea maxLength={400} rows={2} value={note} placeholder="补充完成情况或交接信息"
            onChange={(event) => setNote(event.target.value)} />
        </label>
        <label>成果链接（选填）
          <input type="url" maxLength={500} value={evidenceUrl} placeholder="https://"
            onChange={(event) => setEvidenceUrl(event.target.value)} />
        </label>
        <label>成果文件（选填，最多20 MB）
          <input type="file" disabled={saving} onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
        </label>
        <button className="admin-button admin-button--primary" type="submit" disabled={saving || !changed}>
          {saving ? "保存中…" : "保存修改"}
        </button>
      </form>}
  </main>;
}