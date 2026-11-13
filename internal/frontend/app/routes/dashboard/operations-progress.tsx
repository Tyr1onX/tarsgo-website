import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";

import { assignmentDeadlineToISOString, shanghaiDateTimeLocal } from "~/lib/assignment-deadline";
import {
  createOperationsItem,
  formatOperationsDate,
  getOperationsAttention,
  getOperationsBoard,
  getOperationsHistory,
  nextOperationsDate,
  operationsAttentionLabel,
  recordOperationsUpdate,
  saveOperationsItem,
  sortOperationsItems,
  type OperationsBoard,
  type OperationsItem,
  type OperationsItemInput,
  type OperationsUpdate,
  type OperationsUpdateInput,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() {
  return [{ title: "运营进展 | TARSGO" }];
}

const initialItem: OperationsItemInput = {
  title: "", owner: "", intervalDays: 0, nextAction: "", nextCheckAt: null, status: "active",
};

function localDateTime(date: string | null) {
  return date ? shanghaiDateTimeLocal(date) : "";
}

function History({ itemId }: { itemId: number }) {
  const [history, setHistory] = useState<OperationsUpdate[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getOperationsHistory(itemId).then((entries) => {
      if (active) setHistory(entries);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "历史记录读取失败");
    });
    return () => { active = false; };
  }, [itemId]);
  if (error) return <p role="alert" className="operations-progress__error">{error}</p>;
  if (!history) return <p className="operations-progress__muted">读取中…</p>;
  if (!history.length) return <p className="operations-progress__muted">暂无进展记录</p>;
  return <ol className="operations-progress__history">{history.map((entry) =>
    <li key={entry.id}>
      <time dateTime={entry.createdAt}>{formatOperationsDate(entry.createdAt)}</time>
      <span>{entry.kind === "completed" ? "已完成 · " : ""}{entry.content}</span>
      {entry.link ? <a href={entry.link} target="_blank" rel="noopener noreferrer">查看链接</a> : null}
    </li>,
  )}</ol>;
}

export default function OperationsProgressPage() {
  const location = useLocation();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [itemForm, setItemForm] = useState<OperationsItemInput>(initialItem);
  const [updating, setUpdating] = useState<number | null>(null);
  const [updateForm, setUpdateForm] = useState<OperationsUpdateInput>({ content: "", kind: "progress", link: "" });
  const [saving, setSaving] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [historyItem, setHistoryItem] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getOperationsBoard();
      setBoard(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "运营进展加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const selected = board?.items.find((item) => location.hash === `#operations-item-${item.id}`);
    if (!selected) return;
    if (selected.status === "done" && !showDone) {
      setShowDone(true);
      return;
    }
    document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [board, location.hash, showDone]);

  function startEdit(item?: OperationsItem) {
    setUpdating(null);
    setEditing(item?.id ?? "new");
    setItemForm(item ? {
      title: item.title, owner: item.owner, intervalDays: item.intervalDays,
      nextAction: item.nextAction, nextCheckAt: item.nextCheckAt, status: item.status,
    } : { ...initialItem });
    setError("");
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing === "new") await createOperationsItem(itemForm);
      else if (typeof editing === "number") await saveOperationsItem(editing, itemForm);
      await load();
      setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "事项保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (updating === null) return;
    setSaving(true);
    setError("");
    try {
      await recordOperationsUpdate(updating, updateForm);
      await load();
      setUpdating(null);
      setHistoryItem(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "进展保存失败");
    } finally {
      setSaving(false);
    }
  }

  const visibleItems = sortOperationsItems(board?.items ?? []).filter((item) => showDone || item.status !== "done");
  const attentionCount = (board?.items ?? []).filter((item) => getOperationsAttention(item) === "overdue").length;
  const blockedCount = (board?.items ?? []).filter((item) => getOperationsAttention(item) === "blocked").length;
  const doneCount = (board?.items ?? []).filter((item) => item.status === "done").length;
  const itemNames = new Map((board?.items ?? []).map((item) => [item.id, item.title]));

  return (
    <main className="operations-progress admin-design" aria-labelledby="operations-progress-title">
      <header className="operations-progress__header">
        <div><h1 id="operations-progress-title">运营进展</h1></div>
        <div className="operations-progress__actions">
          <button className="admin-button admin-button--secondary" type="button" onClick={() => void load()}>刷新</button>
          {board?.canManage ? <button className="admin-button admin-button--primary" type="button" onClick={() => startEdit()}>新增事项</button> : null}
        </div>
      </header>

      {error ? <p className="operations-progress__error" role="alert">{error} <button type="button" onClick={() => void load()}>重试</button></p> : null}
      {loading && !board ? <p className="operations-progress__muted">正在加载…</p> : null}

      {board ? <>
        <div className="operations-progress__stats" aria-label="事项状态">
          <div><strong>{board.items.filter((item) => item.status !== "done").length - attentionCount - blockedCount}</strong><span>正常 / 待启动</span></div>
          <div><strong>{attentionCount}</strong><span>需要跟进</span></div>
          <div><strong>{blockedCount}</strong><span>遇到阻塞</span></div>
        </div>

        {editing !== null && board.canManage ? <form className="operations-progress__form" onSubmit={(event) => void submitItem(event)}>
          <h2>{editing === "new" ? "新增事项" : "编辑事项"}</h2>
          <label>事项名称<input required maxLength={120} value={itemForm.title} onChange={(event) => setItemForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <div className="operations-progress__form-grid">
            <label>负责人<input maxLength={80} value={itemForm.owner} onChange={(event) => setItemForm((current) => ({ ...current, owner: event.target.value }))} /></label>
            <label>类型<select value={itemForm.intervalDays > 0 ? "recurring" : "ongoing"} onChange={(event) => setItemForm((current) => ({
              ...current, intervalDays: event.target.value === "recurring" ? 7 : 0, nextCheckAt: null,
            }))}><option value="ongoing">长期推进</option><option value="recurring">周期更新</option></select></label>
          </div>
          <div className="operations-progress__form-grid">
            {itemForm.intervalDays > 0
              ? <label>更新周期（天）<input type="number" required min="1" max="365" value={itemForm.intervalDays} onChange={(event) => setItemForm((current) => ({ ...current, intervalDays: Number(event.target.value) }))} /></label>
              : <label>下次跟进（北京时间）<input type="datetime-local" required={itemForm.status !== "done"} value={localDateTime(itemForm.nextCheckAt)} onChange={(event) => setItemForm((current) => ({ ...current, nextCheckAt: assignmentDeadlineToISOString(event.target.value) }))} /></label>}
            <label>状态<select value={itemForm.status} onChange={(event) => setItemForm((current) => ({ ...current, status: event.target.value as OperationsItemInput["status"] }))}>
              <option value="active">进行中</option><option value="blocked">遇到阻塞</option><option value="done">已结束</option>
            </select></label>
          </div>
          <label>下一步<input maxLength={300} value={itemForm.nextAction} onChange={(event) => setItemForm((current) => ({ ...current, nextAction: event.target.value }))} /></label>
          <div className="operations-progress__actions">
            <button className="admin-button admin-button--primary" disabled={saving}>{saving ? "保存中…" : "保存"}</button>
            <button className="admin-button admin-button--secondary" type="button" disabled={saving} onClick={() => setEditing(null)}>取消</button>
          </div>
        </form> : null}

        <div className="operations-progress__section-head">
          <h2>运营事项</h2>
          {doneCount > 0 ? <label className="operations-progress__toggle"><input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />显示已结束（{doneCount}）</label> : null}
        </div>
        {visibleItems.length === 0 && !editing ? <p className="operations-progress__muted">暂无运营事项{board.canManage ? "，可新增事项开始记录" : ""}。</p> : null}
        <div className="operations-progress__items">
          {visibleItems.map((item) => {
            const attention = getOperationsAttention(item);
            const due = nextOperationsDate(item);
            return <article id={`operations-item-${item.id}`} className="operations-progress__item" key={item.id}>
              <div className="operations-progress__item-head">
                <div><h3>{item.title}</h3><p className="operations-progress__muted">{item.owner || "负责人待定"} · {item.intervalDays > 0 ? `每 ${item.intervalDays} 天更新` : "长期推进"}</p></div>
                <span className={`operations-progress__status operations-progress__status--${attention}`}>{operationsAttentionLabel[attention]}</span>
              </div>
              <div className="operations-progress__item-body">
                <p><span>最近进展</span>{item.lastUpdate ? <>{item.lastUpdate.content} <time dateTime={item.lastUpdate.createdAt}>（{formatOperationsDate(item.lastUpdate.createdAt)}）</time>
                  {item.lastUpdate.link ? <a href={item.lastUpdate.link} target="_blank" rel="noopener noreferrer">查看链接</a> : null}</> : "尚未记录"}</p>
                {item.intervalDays > 0 ? <p><span>上次完成</span>{formatOperationsDate(item.lastCompletedAt)} </p> : null}
                {item.status !== "done" ? <p><span>下一步</span>{item.nextAction || "待明确"}{due ? <time dateTime={due.toISOString()}> · {formatOperationsDate(due)}</time> : null}</p> : null}
              </div>
              <div className="operations-progress__item-actions">
                <button type="button" onClick={() => setHistoryItem(historyItem === item.id ? null : item.id)}>{historyItem === item.id ? "收起记录" : "最近记录"}</button>
                {board.canManage ? <>
                  {item.status !== "done" ? <button type="button" onClick={() => {
                    setEditing(null);
                    setUpdating(updating === item.id ? null : item.id);
                    setUpdateForm({ content: "", kind: item.intervalDays > 0 ? "completed" : "progress", link: "" });
                    setError("");
                  }}>记录进展</button> : null}
                  <button type="button" onClick={() => startEdit(item)}>编辑</button>
                </> : null}
              </div>
              {historyItem === item.id ? <History key={`${item.id}:${item.lastUpdate?.id ?? 0}`} itemId={item.id} /> : null}
              {updating === item.id && board.canManage ? <form className="operations-progress__update-form" onSubmit={(event) => void submitUpdate(event)}>
                {item.intervalDays > 0 ? <label>记录类型<select value={updateForm.kind} onChange={(event) => setUpdateForm((current) => ({ ...current, kind: event.target.value as OperationsUpdateInput["kind"] }))}>
                  <option value="completed">本期已完成</option><option value="progress">进展备注</option>
                </select></label> : null}
                <label>进展内容<textarea required maxLength={1000} rows={2} value={updateForm.content} onChange={(event) => setUpdateForm((current) => ({ ...current, content: event.target.value }))} /></label>
                <label>相关链接（选填）<input type="url" placeholder="https://" maxLength={500} value={updateForm.link} onChange={(event) => setUpdateForm((current) => ({ ...current, link: event.target.value }))} /></label>
                <div className="operations-progress__actions">
                  <button className="admin-button admin-button--primary" disabled={saving}>{saving ? "提交中…" : "保存进展"}</button>
                  <button type="button" className="admin-button admin-button--secondary" disabled={saving} onClick={() => setUpdating(null)}>取消</button>
                </div>
              </form> : null}
            </article>;
          })}
        </div>

        {board.updates.length > 0 ? <section className="operations-progress__feed" aria-labelledby="operations-progress-feed-title">
          <h2 id="operations-progress-feed-title">最近动态</h2>
          <ol>{board.updates.map((entry) => <li key={entry.id}>
            <time dateTime={entry.createdAt}>{formatOperationsDate(entry.createdAt)}</time>
            <div><a href={`#operations-item-${entry.itemId}`}>{itemNames.get(entry.itemId) || "事项"}</a><p>{entry.kind === "completed" ? "已完成 · " : ""}{entry.content}</p></div>
          </li>)}</ol>
        </section> : null}
      </> : null}
      <div className="operations-progress__back"><Link to="/dashboard/workbench">返回工作台</Link></div>
    </main>
  );
}
