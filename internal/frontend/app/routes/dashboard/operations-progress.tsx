import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router";

import { assignmentDeadlineToISOString, shanghaiDateTimeLocal } from "~/lib/assignment-deadline";
import {
  createOperationsItem,
  daysSinceOperationsPublish,
  formatOperationsDate,
  formatOperationsDay,
  formatOperationsUpdateDate,
  getOperationsAttention,
  getOperationsBoard,
  getOperationsHistory,
  nextOperationsDate,
  operationsAttentionLabel,
  recordOperationsUpdate,
  recordOperationsStage,
  undoOperationsStage,
  saveOperationsItem,
  sortOperationsItems,
  videoStageLabels,
  merchandiseStageLabels,
  type OperationsSnapshot,
  type OperationsBoard,
  type OperationsItem,
  type OperationsItemInput,
  type OperationsUpdate,
  type OperationsUpdateInput,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() {
  return [{ title: "战队动态 | TARSGO" }];
}

const initialItem: OperationsItemInput = {
  title: "", kind: "workstream", stage: "", owner: "", intervalDays: 0, nextAction: "", nextCheckAt: null, status: "active",
};

function OperationsProgressSkeleton() {
  const line = "block h-3 rounded bg-[var(--admin-border)]";
  return <div className="content-skeleton motion-safe:animate-pulse" role="status" aria-label="正在加载战队动态">
    <div className="operations-progress__account-metrics" aria-hidden="true">
      {[0, 1].map((index) => <div key={index} className="operations-progress__follower-chart">
        <span className={`${line} w-20`} />
        <span className={`${line} mt-4 w-32`} />
        <span className="mt-5 block h-20 rounded bg-[var(--admin-border-subtle)]" />
      </div>)}
    </div>
    <div className="operations-progress__stats" aria-hidden="true">
      {[0, 1, 2].map((index) => <div key={index}>
        <span className="block h-7 w-12 rounded bg-[var(--admin-border)]" />
        <span className={`${line} mt-2 w-20 max-w-full`} />
      </div>)}
    </div>
    <div className="operations-progress__items" aria-hidden="true">
      {[0, 1].map((index) => <div key={index} className="operations-progress__item">
        <span className={`${line} w-40 max-w-full`} />
        <span className={`${line} mt-3 w-24`} />
        <span className="mt-6 block h-12 rounded bg-[var(--admin-border-subtle)]" />
      </div>)}
    </div>
  </div>;
}

function localDateTime(date: string | null) {
  return date ? shanghaiDateTimeLocal(date) : "";
}

function FollowerTrend({ platform, snapshots }: { platform: "bilibili" | "douyin"; snapshots: OperationsSnapshot[] }) {
  const values = snapshots.filter((entry) => entry.platform === platform);
  if (!values.length) return null;
  const maximum = Math.max(...values.map((entry) => entry.followers));
  const minimum = Math.min(...values.map((entry) => entry.followers));
  const span = Math.max(1, maximum - minimum);
  const coords = values.map((entry, index) => {
    const x = 12 + index * 296 / Math.max(1, values.length - 1);
    const y = 66 - (entry.followers - minimum) / span * 54;
    return { x, y, entry };
  });
  return <div className="operations-progress__follower-chart">
    <div className="operations-progress__follower-head">
      <strong>{platform === "bilibili" ? "B站" : "抖音"}</strong>
      <span><b>{values[values.length - 1].followers.toLocaleString("zh-CN")}</b> 粉 · {values[values.length - 1].observedOn}</span>
    </div>
    <svg viewBox="0 0 320 82" preserveAspectRatio="none" role="img" aria-label={`${platform === "bilibili" ? "B站" : "抖音"}粉丝增长趋势，从${minimum}到${maximum}`}>
      <polyline points={coords.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(({ x, y, entry }) => <circle key={entry.observedOn} cx={x} cy={y} r="3" fill="currentColor"><title>{entry.observedOn}：{entry.followers} 粉</title></circle>)}
    </svg>
    <p className="operations-progress__muted">历史记录 {values.length} 个 · {values[0].observedOn} 起</p>
  </div>;
}

function History({ itemId, latestActionID, busy, onUndo }: {
  itemId: number;
  latestActionID: number | null;
  busy: boolean;
  onUndo: (updateID: number) => void;
}) {
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
      <time dateTime={entry.publishedOn || entry.createdAt}>{formatOperationsUpdateDate(entry)}</time>
      <span>{entry.kind === "reverted" ? "已撤回 · " : entry.kind === "completed" ? "已完成 · " : ""}{entry.content}</span>
      {entry.link ? <a href={entry.link} target="_blank" rel="noopener noreferrer">查看链接</a> : null}
      {entry.id === latestActionID && (entry.kind === "stage" || entry.kind === "confirmed") ? (
        <button type="button" disabled={busy} onClick={() => onUndo(entry.id)}>{busy ? "撤回中…" : "撤回"}</button>
      ) : null}
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
  const [updateForm, setUpdateForm] = useState<OperationsUpdateInput>({ content: "", kind: "progress", link: "", publishedOn: null });
  const [saving, setSaving] = useState(false);
  const [savingStage, setSavingStage] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [historyItem, setHistoryItem] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await getOperationsBoard());
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
      title: item.title, kind: item.kind, stage: item.stage, owner: item.owner, intervalDays: item.intervalDays,
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

  async function submitStage(itemId: number, stage: string | null) {
    setSavingStage(itemId);
    setError("");
    try {
      await recordOperationsStage(itemId, stage);
      await load();
      setHistoryItem(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "阶段更新失败");
    } finally {
      setSavingStage(null);
    }
  }

  async function submitUndo(itemId: number, updateId: number) {
    setSavingStage(itemId);
    setError("");
    try {
      await undoOperationsStage(itemId, updateId);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "撤回失败");
    } finally {
      setSavingStage(null);
    }
  }

  const visibleItems = sortOperationsItems(board?.items ?? []).filter((item) => showDone || item.status !== "done");
  const attentionCount = (board?.items ?? []).filter((item) => getOperationsAttention(item) === "overdue").length;
  const blockedCount = (board?.items ?? []).filter((item) => getOperationsAttention(item) === "blocked").length;
  const doneCount = (board?.items ?? []).filter((item) => item.status === "done").length;
  const itemNames = new Map((board?.items ?? []).map((item) => [item.id, item.title]));

  return (
    <main className="operations-progress admin-design" aria-labelledby="operations-progress-title" aria-busy={loading && !board}>
      <header className="operations-progress__header">
        <div><h1 id="operations-progress-title">战队动态</h1></div>
        <div className="operations-progress__actions">
          <button className="admin-button admin-button--secondary" type="button" onClick={() => void load()}>刷新</button>
          {board?.canManage ? <button className="admin-button admin-button--primary" type="button" onClick={() => startEdit()}>新增事项</button> : null}
        </div>
      </header>

      {error ? <p className="operations-progress__error" role="alert">{error} <button type="button" onClick={() => void load()}>重试</button></p> : null}
      {loading && !board ? <OperationsProgressSkeleton /> : null}

      {board ? <>
        {board.snapshots.length > 0 ? <section className="operations-progress__account-metrics" aria-label="宣传平台粉丝趋势">
          <FollowerTrend platform="douyin" snapshots={board.snapshots} />
          <FollowerTrend platform="bilibili" snapshots={board.snapshots} />
        </section> : null}
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
            <label>类型<select value={itemForm.kind === "workstream" && itemForm.intervalDays > 0 ? "recurring" : itemForm.kind} onChange={(event) => setItemForm((current) => ({
              ...current,
              kind: event.target.value === "recurring" ? "workstream" : event.target.value as OperationsItemInput["kind"],
              stage: event.target.value === "video" || event.target.value === "merchandise" ? "unconfirmed" : "",
              intervalDays: event.target.value === "recurring" ? 7 : 0,
              nextCheckAt: null,
            }))}>
              <option value="workstream">长期推进</option><option value="channel">账号运营</option><option value="video">视频制作</option><option value="merchandise">周边制作</option><option value="recurring">周期更新</option>
            </select></label>
          </div>
          <div className="operations-progress__form-grid">
            {itemForm.intervalDays > 0
              ? <label>更新周期（天）<input type="number" required min="1" max="365" value={itemForm.intervalDays} onChange={(event) => setItemForm((current) => ({ ...current, intervalDays: Number(event.target.value) }))} /></label>
              : <label>下次跟进（北京时间）<input type="datetime-local" required={itemForm.kind === "workstream" && itemForm.status !== "done"} value={localDateTime(itemForm.nextCheckAt)} onChange={(event) => setItemForm((current) => ({ ...current, nextCheckAt: assignmentDeadlineToISOString(event.target.value) }))} /></label>}
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
                <div><h3>{item.title}</h3><p className="operations-progress__muted">{item.owner || "负责人待定"} · {item.kind === "channel" ? "账号运营" : item.kind === "video" ? "视频制作" : item.kind === "merchandise" ? "周边制作" : item.intervalDays > 0 ? `每 ${item.intervalDays} 天更新` : "长期推进"}</p></div>
                <span className={`operations-progress__status operations-progress__status--${attention}`}>{operationsAttentionLabel[attention]}</span>
              </div>
              {item.kind === "video" || item.kind === "merchandise" ? <div className="operations-progress__video-stages" aria-label="事项流程">
                <ol>{(item.kind === "video" ? videoStageLabels : merchandiseStageLabels).map((stage, index, stages) => {
                  const current = stages.findIndex(({ key }) => key === item.stage);
                  return <li key={stage.key} className={index < current ? "is-complete" : index === current ? "is-current" : ""}>
                    {board.canManage && item.status !== "done" ? <button type="button" disabled={savingStage !== null || index === current}
                      className="operations-progress__step-button"
                      aria-label={`将${item.title}更新至${stage.label}`}
                      aria-current={index === current ? "step" : undefined}
                      onClick={() => void submitStage(item.id, stage.key)}>
                      <span className="operations-progress__step-marker" aria-hidden="true">{index < current ? "✓" : index + 1}</span>
                      <span>{stage.label}</span>
                    </button> : <><span className="operations-progress__step-marker" aria-hidden="true">{index < current ? "✓" : index + 1}</span><span>{stage.label}</span></>}
                  </li>;
                })}</ol>
                <div className="operations-progress__stage-meta">
                  <span>{item.stage === "unconfirmed" ? "阶段待确认" : "阶段已确认"}</span>
                  <span>上次变化：{formatOperationsDate(item.lastStageChangedAt)}</span>
                  <span>上次确认：{formatOperationsDate(item.lastConfirmedAt)}</span>
                  {board.canManage && item.status !== "done" && item.stage !== "unconfirmed" ? <button type="button" disabled={savingStage !== null}
                    onClick={() => void submitStage(item.id, null)}>进度无变化，确认已跟进</button> : null}
                </div>
              </div> : null}
              <div className="operations-progress__item-body">
                {item.lastUpdate ? <p><span>最近进展</span>{item.lastUpdate.content} <time dateTime={item.lastUpdate.publishedOn || item.lastUpdate.createdAt}>（{formatOperationsUpdateDate(item.lastUpdate)}）</time>
                  {item.lastUpdate.link ? <a href={item.lastUpdate.link} target="_blank" rel="noopener noreferrer">查看链接</a> : null}</p> : null}
                {item.kind === "channel" ? <p><span>上次发布</span><strong>{formatOperationsDay(item.lastCompletedOn)}</strong>{daysSinceOperationsPublish(item.lastCompletedOn) !== null ? <small>（距今 {daysSinceOperationsPublish(item.lastCompletedOn)} 天）</small> : null}</p> : item.intervalDays > 0 ? <p><span>上次完成</span>{formatOperationsDay(item.lastCompletedOn)}</p> : null}
                {item.status !== "done" && (item.nextAction || due) ? <p><span>下一步</span>{item.nextAction || "待跟进"}{due ? <time dateTime={due.toISOString()}> · {formatOperationsDate(due)}</time> : null}</p> : null}
              </div>
              <div className="operations-progress__item-actions">
                {board.canManage ? <button type="button" onClick={() => setHistoryItem(historyItem === item.id ? null : item.id)}>{historyItem === item.id ? "收起记录" : "最近记录"}</button> : null}
                {board.canManage ? <>
                  {item.status !== "done" ? <button type="button" onClick={() => {
                    setEditing(null);
                    setUpdating(updating === item.id ? null : item.id);
                    setUpdateForm({ content: "", kind: item.kind === "channel" || item.intervalDays > 0 ? "completed" : "progress", link: "", publishedOn: null });
                    setError("");
                  }}>记录进展</button> : null}
                  <button type="button" onClick={() => startEdit(item)}>编辑</button>
                </> : null}
              </div>
              {historyItem === item.id ? <History key={`${item.id}:${item.lastUpdate?.id ?? 0}`} itemId={item.id}
                latestActionID={board.canManage && item.status !== "done" && (item.lastUpdate?.kind === "stage" || item.lastUpdate?.kind === "confirmed") ? item.lastUpdate.id : null}
                busy={savingStage !== null} onUndo={(updateId) => void submitUndo(item.id, updateId)} /> : null}
              {updating === item.id && board.canManage ? <form className="operations-progress__update-form" onSubmit={(event) => void submitUpdate(event)}>
                {item.kind === "channel" || item.intervalDays > 0 ? <label>记录类型<select value={updateForm.kind} onChange={(event) => setUpdateForm((current) => ({ ...current, kind: event.target.value as OperationsUpdateInput["kind"], publishedOn: null }))}>
                  <option value="completed">{item.kind === "channel" ? "发布新内容" : "本期已完成"}</option><option value="progress">进展备注</option>
                </select></label> : null}
                {updateForm.kind === "completed" ? <label>实际发布日期<input type="date" required value={updateForm.publishedOn || ""} onChange={(event) => setUpdateForm((current) => ({ ...current, publishedOn: event.target.value || null }))} /></label> : null}
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

        {board.posts.length > 0 ? <section className="operations-progress__posts" aria-labelledby="operations-posts-title">
          <div className="operations-progress__section-head"><h2 id="operations-posts-title">历史发布</h2><span className="operations-progress__muted">已同步 B站 {board.posts.length} 条作品</span></div>
          <ol>{board.posts.slice(0, 10).map((post) => <li key={`${post.platform}:${post.externalId}`}>
            <a href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a>
            <span>{formatOperationsDate(post.publishedAt)} · {post.viewCount.toLocaleString("zh-CN")} 播放</span>
          </li>)}</ol>
        </section> : null}

        {board.updates.length > 0 ? <section className="operations-progress__feed" aria-labelledby="operations-progress-feed-title">
          <h2 id="operations-progress-feed-title">最近动态</h2>
          <ol>{board.updates.map((entry) => <li key={entry.id}>
            <time dateTime={entry.publishedOn || entry.createdAt}>{formatOperationsUpdateDate(entry)}</time>
            <div><a href={`#operations-item-${entry.itemId}`}>{itemNames.get(entry.itemId) || "事项"}</a><p>{entry.kind === "completed" ? "已完成 · " : ""}{entry.content}</p></div>
          </li>)}</ol>
        </section> : null}
      </> : null}
    </main>
  );
}
