import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { getOperationsBoard, operationsPlatformNames, saveOperationsPublication,
  type OperationsBoard, type OperationsPublication } from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "登记平台发布 | TARSGO" }]; }

export default function OperationsPublicationEditPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState<"pending" | "done">("pending");
  const [url, setUrl] = useState("");
  const [versionNote, setVersionNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const back = `/dashboard/workbench/operations/works/${itemId}`;

  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((value) => {
      if (!active) return;
      setBoard(value);
      const item = value.items.find((entry) => entry.id === Number(itemId));
      const target = item?.publications.find((entry) => entry.status !== "done") ?? item?.publications[0];
      if (target) {
        setSelected(target.platform);
        setStatus(target.status);
        setUrl(target.url);
        setVersionNote(target.versionNote);
      }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, [itemId]);

  const item = board?.items.find((entry) => entry.id === Number(itemId));
  const target = item?.publications.find((entry) => entry.platform === selected);
  const publishingStep = item?.steps.find((step) => step.key === "published");
  const canUpdate = Boolean(item && target && (board?.canManage || publishingStep?.assigneeId === board?.viewerId));
  const changed = Boolean(target && (target.status !== status || target.url !== url.trim() || target.versionNote !== versionNote.trim()));

  function choose(next: OperationsPublication) {
    setSelected(next.platform);
    setStatus(next.status);
    setUrl(next.url);
    setVersionNote(next.versionNote);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !target || !canUpdate || !changed || saving) return;
    if (!window.confirm(`确认保存「${operationsPlatformNames[target.platform]}」的发布记录？`)) return;
    setSaving(true);
    setError("");
    try {
      await saveOperationsPublication(item.id, target.platform, {
        status, url: url.trim(), versionNote: versionNote.trim(),
      });
      navigate(back, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登记失败");
    } finally { setSaving(false); }
  }

  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to={back}>返回作品详情</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board ? <p className="operations-progress__muted">正在加载…</p>
      : !canUpdate ? <p className="operations-progress__error">没有更新发布记录的权限</p>
      : <form className="operations-progress__item operations-progress__status-editor" onSubmit={(event) => void submit(event)}>
        <p className="operations-progress__muted">{item?.title}</p>
        <h1>登记平台发布</h1>
        <div className="operations-progress__filters" role="group" aria-label="选择发布平台">
          {item?.publications.map((entry) =>
            <button key={entry.platform} type="button" onClick={() => choose(entry)}
              aria-pressed={entry.platform === selected} className={entry.platform === selected ? "is-selected" : ""}>
              {operationsPlatformNames[entry.platform]}
            </button>)}
        </div>
        <label>发布状态
          <select value={status} onChange={(event) => setStatus(event.target.value as "pending" | "done")}>
            <option value="pending">待发布</option>
            <option value="done">已发布</option>
          </select>
        </label>
        <label>作品链接（选填）
          <input type="url" maxLength={500} value={url} placeholder="https://"
            onChange={(event) => setUrl(event.target.value)} />
        </label>
        <label>平台版本说明（选填）
          <textarea rows={2} maxLength={300} value={versionNote} placeholder="如使用了不同的竖屏剪辑版"
            onChange={(event) => setVersionNote(event.target.value)} />
        </label>
        <button type="submit" className="admin-button admin-button--primary"
          disabled={saving || !changed}>{saving ? "保存中…" : "保存发布记录"}</button>
      </form>}
  </main>;
}