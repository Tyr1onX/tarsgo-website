import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  getOperationsBoard, getOperationsMembers, setupOperationsEpisode,
  type OperationsBoard, type OperationsMember,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "制作安排 | TARSGO" }]; }

export default function OperationsEpisodeSetupPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [members, setMembers] = useState<OperationsMember[]>([]);
  const [title, setTitle] = useState("");
  const [owners, setOwners] = useState<Record<number, number>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
          setOwners(Object.fromEntries(item.steps.map((step) => [step.id, step.assigneeId ?? 0])));
        }
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, [itemId]);

  const item = board?.items.find((entry) => entry.id === Number(itemId));
  const back = item?.channelId ? `/dashboard/workbench/operations/channels/${item.channelId}#operations-item-${item.id}`
    : "/dashboard/workbench/operations";
  const changed = Boolean(item && (item.title !== title.trim() ||
    item.steps.some((step) => (step.assigneeId ?? 0) !== (owners[step.id] ?? 0))));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !board?.canManage || !changed || saving || !title.trim()) return;
    if (!window.confirm(`确认保存「${item.title}」的选题及环节分工？`)) return;
    setSaving(true); setError("");
    try {
      await setupOperationsEpisode(item.id, title.trim(), item.steps.map((step) => ({
        stepId: step.id, assigneeId: owners[step.id] ?? 0,
      })));
      navigate(back, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setSaving(false); }
  }

  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to={back}>返回制作任务</Link>
    {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board ? <p className="operations-progress__muted">正在加载…</p>
      : !board.canManage || !item?.channelId ? <p className="operations-progress__error">没有修改分工的权限</p>
      : <form className="operations-progress__item operations-progress__status-editor" onSubmit={(event) => void submit(event)}>
        <h1>制作安排</h1>
        <label>本期选题
          <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="operations-progress__setup-steps">
          {item.steps.map((step) => <label key={step.id}>{step.title}
            <select value={owners[step.id] ?? 0} onChange={(event) => setOwners((current) => ({ ...current, [step.id]: Number(event.target.value) }))}>
              <option value={0}>待分配</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>)}
        </div>
        <button className="admin-button admin-button--primary" type="submit" disabled={saving || !changed || !title.trim()}>
          {saving ? "保存中…" : "确认保存"}
        </button>
      </form>}
  </main>;
}