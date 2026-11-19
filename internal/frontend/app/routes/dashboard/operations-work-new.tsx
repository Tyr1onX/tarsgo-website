import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { createOperationsEpisode, getOperationsBoard, operationsPlatformNames,
  type OperationsBoard } from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "发起作品 | TARSGO" }]; }

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
    setSaving(true);
    setError("");
    try {
      const work = await createOperationsEpisode(channel.id, title.trim(), seriesName.trim(), true);
      navigate(`/dashboard/workbench/operations/works/${work.id}`, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建作品失败"); }
    finally { setSaving(false); }
  }
  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations">返回运营动态</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board ? <p className="operations-progress__muted">正在加载…</p>
      : !board.canManage ? <p className="operations-progress__error">没有创建作品的权限</p>
      : <form className="operations-progress__item operations-progress__status-editor" onSubmit={(event) => void submit(event)}>
        <h1>{platform === "wechat" ? "发起图文" : "发起一期视频"}</h1>
        <label>制作平台
          <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            {channels.map((item) => <option value={item.platforms} key={item.id}>
              {operationsPlatformNames[item.platforms]}
            </option>)}
          </select>
        </label>
        <label>选题（选填）
          <input maxLength={120} value={title} placeholder="尚未定题也可以开始策划"
            onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>所属系列（选填）
          <input maxLength={80} value={seriesName} placeholder="例如 RMer"
            onChange={(event) => setSeriesName(event.target.value)} />
        </label>
        <button className="admin-button admin-button--primary" type="submit" disabled={!channel || saving}>
          {saving ? "发起中…" : platform === "wechat" ? "创建并开始选题" : "创建并开始策划"}
        </button>
      </form>}
  </main>;
}
