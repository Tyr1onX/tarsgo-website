import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { createOperationsEpisode, getOperationsBoard, operationsPlatformNames,
  type OperationsBoard } from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "新建作品 | TARSGO" }]; }

export default function OperationsWorkNewPage() {
  const navigate = useNavigate();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [platform, setPlatform] = useState("douyin");
  const [title, setTitle] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((value) => { if (active) setBoard(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, []);
  const channels = board?.items.filter((item) => item.kind === "channel" &&
    ["douyin","bilibili","wechat","wechat_video"].includes(item.platforms)) ?? [];
  const channel = channels.find((item) => item.platforms === platform);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channel || !board?.canManage || saving) return;
    if (!window.confirm("确认新建作品？")) return;
    setSaving(true);
    setError("");
    try {
      const work = await createOperationsEpisode(channel.id, title.trim(), seriesName.trim());
      navigate(`/dashboard/workbench/operations/episodes/${work.id}/setup`, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建作品失败"); }
    finally { setSaving(false); }
  }
  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations/works">返回作品库</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board ? <p className="operations-progress__muted">正在加载…</p>
      : !board.canManage ? <p className="operations-progress__error">没有创建作品的权限</p>
      : <form className="operations-progress__item operations-progress__status-editor" onSubmit={(event) => void submit(event)}>
        <h1>新建作品</h1>
        <label>开始制作的平台
          <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            {channels.map((item) => <option value={item.platforms} key={item.id}>
              {operationsPlatformNames[item.platforms]}
            </option>)}
          </select>
        </label>
        <label>作品名称（选填）
          <input maxLength={120} value={title} placeholder="还未定题时自动创建待规划作品"
            onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>所属系列（选填）
          <input maxLength={80} value={seriesName} placeholder="例如 RMer"
            onChange={(event) => setSeriesName(event.target.value)} />
        </label>
        <button className="admin-button admin-button--primary" type="submit" disabled={!channel || saving}>
          {saving ? "创建中…" : "创建并安排分工"}
        </button>
      </form>}
  </main>;
}
