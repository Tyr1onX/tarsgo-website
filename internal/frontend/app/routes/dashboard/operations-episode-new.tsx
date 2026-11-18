import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { createOperationsEpisode, getOperationsBoard, type OperationsBoard } from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "新建制作任务 | TARSGO" }]; }

export default function OperationsEpisodeNewPage() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((data) => { if (active) setBoard(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, []);
  const channel = board?.items.find((item) => item.id === Number(channelId) && item.kind === "channel");
  const back = `/dashboard/workbench/operations/channels/${channelId}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channel || !board?.canManage || saving) return;
    if (!window.confirm(`确认在「${channel.title}」新建一期制作任务？`)) return;
    setSaving(true); setError("");
    try {
      const episode = await createOperationsEpisode(channel.id, title.trim());
      navigate(`/dashboard/workbench/operations/episodes/${episode.id}/setup`, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建失败"); }
    finally { setSaving(false); }
  }
  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to={back}>返回平台任务</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board ? <p className="operations-progress__muted">正在加载…</p>
      : !channel || !board.canManage ? <p className="operations-progress__error">没有创建任务的权限</p>
      : <form className="operations-progress__item operations-progress__status-editor" onSubmit={(event) => void submit(event)}>
        <p className="operations-progress__muted">{channel.title} · 并行制作</p>
        <h1>新建一期</h1>
        <label>本期选题（选填）
          <input maxLength={120} placeholder="未确定时自动标记为选题待定"
            value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <button className="admin-button admin-button--primary" type="submit" disabled={saving}>
          {saving ? "创建中…" : "创建任务"}
        </button>
      </form>}
  </main>;
}