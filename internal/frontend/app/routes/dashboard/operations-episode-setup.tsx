import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  getOperationsBoard, getOperationsMembers, operationsPlatformNames, setupOperationsEpisode,
  type OperationsBoard, type OperationsMember,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "编辑作品 | TARSGO" }]; }

export default function OperationsEpisodeSetupPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [members, setMembers] = useState<OperationsMember[]>([]);
  const [title, setTitle] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [owners, setOwners] = useState<Record<number, number>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const back = `/dashboard/workbench/operations/works/${itemId}`;

  useEffect(() => {
    let active = true;
    void Promise.all([getOperationsBoard(), getOperationsMembers()])
      .then(([data, list]) => {
        if (!active) return;
        setBoard(data);
        setMembers(list);
        const item = data.items.find((entry) => entry.id === Number(itemId));
        if (item) {
          setTitle(item.title);
          setSeriesName(item.seriesName || "");
          setPlatforms(item.publications.map((entry) => entry.platform));
          setOwners(Object.fromEntries(item.steps.map((step) => [step.id, step.assigneeId ?? 0])));
        }
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, [itemId]);

  const item = board?.items.find((entry) => entry.id === Number(itemId));
  const isOtherWork = item?.kind === "merchandise";
  const validPlatforms = item?.kind === "article" ? ["wechat"] : isOtherWork ? [] : ["douyin", "bilibili", "wechat_video"];
  const changed = Boolean(item && (
    item.title !== title.trim() || (item.seriesName || "") !== seriesName.trim() ||
    item.publications.length !== platforms.length ||
    platforms.some((key) => !item.publications.some((entry) => entry.platform === key)) ||
    item.steps.some((step) => (step.assigneeId ?? 0) !== (owners[step.id] ?? 0))
  ));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !board?.canManage || !changed || saving || !title.trim() || (!isOtherWork && platforms.length === 0)) return;
    if (!window.confirm(isOtherWork ? "确认保存事务分工？" : "确认保存作品安排和发布平台？")) return;
    setSaving(true);
    setError("");
    try {
      await setupOperationsEpisode(item.id, title.trim(), seriesName.trim(), platforms,
        item.steps.map((step) => ({ stepId: step.id, assigneeId: owners[step.id] ?? 0 })));
      navigate(back, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally { setSaving(false); }
  }

  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to={back}>返回作品详情</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board ? <p className="operations-progress__muted">正在加载…</p>
      : !board.canManage || !item || (item.kind !== "video" && item.kind !== "article" && item.kind !== "merchandise")
        ? <p className="operations-progress__error">没有编辑此作品的权限</p>
        : <form className="operations-progress__item operations-progress__status-editor" onSubmit={(event) => void submit(event)}>
          <h1>{isOtherWork ? "编辑事务" : "编辑作品"}</h1>
          <label>作品名称
            <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          {!isOtherWork ? <label>所属系列（选填）
            <input maxLength={80} placeholder="例如 RMer" value={seriesName}
              onChange={(event) => setSeriesName(event.target.value)} />
          </label> : null}
          {!isOtherWork ? <fieldset className="operations-progress__platform-choices">
            <legend>计划发布平台</legend>
            {validPlatforms.map((key) => <label key={key}>
              <input type="checkbox" checked={platforms.includes(key)}
                onChange={(event) => setPlatforms((current) => event.target.checked
                  ? [...current, key] : current.filter((entry) => entry !== key))} />
              {operationsPlatformNames[key]}
            </label>)}
          </fieldset> : null}
          <h2>环节负责人</h2>
          <div className="operations-progress__setup-steps">
            {item.steps.map((step) => <label key={step.id}>{step.title}
              <select value={owners[step.id] ?? 0} onChange={(event) => setOwners((current) => ({
                ...current, [step.id]: Number(event.target.value),
              }))}>
                <option value={0}>待分配</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>)}
          </div>
          <button className="admin-button admin-button--primary" type="submit"
            disabled={saving || !changed || !title.trim() || (!isOtherWork && platforms.length === 0)}>
            {saving ? "保存中…" : "保存作品"}
          </button>
        </form>}
  </main>;
}
