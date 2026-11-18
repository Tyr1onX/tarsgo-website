import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router";

import { assignmentDeadlineToISOString, shanghaiDateTimeLocal } from "~/lib/assignment-deadline";
import {
  createOperationsItem,
  addOperationsStep,
  saveOperationsStep,
  deleteOperationsStep,
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
  saveOperationsItem,
  sortOperationsItems,
  type OperationsStepStatus,
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
  title: "", kind: "workstream", platforms: "", intervalDays: 0, nextAction: "", nextCheckAt: null, status: "active",
};

function OperationsProgressSkeleton() {
  const line = "block h-3 rounded bg-[var(--admin-border)]";
  return <div className="content-skeleton motion-safe:animate-pulse" role="status" aria-label="正在加载战队动态">
    <div className="operations-progress__account-metrics" aria-hidden="true">
      {[0, 1, 2].map((index) => <div key={index} className="operations-progress__follower-chart">
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

function FollowerTrend({ platform, snapshots }: { platform: OperationsSnapshot["platform"]; snapshots: OperationsSnapshot[] }) {
  const label = { douyin: "抖音", bilibili: "B站", wechat: "公众号" }[platform];
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
      <strong>{label}</strong>
      <span><b>{values[values.length - 1].followers.toLocaleString("zh-CN")}</b> {platform === "wechat" ? "关注" : "粉"} · {values[values.length - 1].observedOn}</span>
    </div>
    {values.length > 1 ? <svg viewBox="0 0 320 82" preserveAspectRatio="none" role="img" aria-label={`${label}关注增长趋势，从${minimum}到${maximum}`}>
      <polyline points={coords.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(({ x, y, entry }) => <circle key={entry.observedOn} cx={x} cy={y} r="3" fill="currentColor"><title>{entry.observedOn}：{entry.followers} {platform === "wechat" ? "关注" : "粉"}</title></circle>)}
    </svg> : null}
    {values.length > 1 ? <p className="operations-progress__muted">历史记录 {values.length} 个 · {values[0].observedOn} 起</p> : null}
  </div>;
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
      <time dateTime={entry.publishedOn || entry.createdAt}>{formatOperationsUpdateDate(entry)}</time>
      <span>{entry.kind === "reverted" ? "已撤回 · " : entry.kind === "completed" ? "已完成 · " : ""}{entry.content}</span>
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
  const [updateForm, setUpdateForm] = useState<OperationsUpdateInput>({ content: "", kind: "progress", link: "", publishedOn: null });
  const [saving, setSaving] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [historyItem, setHistoryItem] = useState<number | null>(null);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [stepBusy, setStepBusy] = useState<number | null>(null);
  const [stepError, setStepError] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [stepTitle, setStepTitle] = useState("");
  const [addingStepTo, setAddingStepTo] = useState<number | null>(null);
  const [newStepTitle, setNewStepTitle] = useState("");
  const [copyFromItemId, setCopyFromItemId] = useState(0);
  const [viewMode, setViewMode] = useState<"all" | "mine" | "blocked">("all");
  const [platformFilter, setPlatformFilter] = useState("all");

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
      title: item.title, kind: item.kind, platforms: item.platforms, intervalDays: item.intervalDays,
      nextAction: item.nextAction, nextCheckAt: item.nextCheckAt, status: item.status,
    } : { ...initialItem });
    setCopyFromItemId(0);
    setError("");
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing === "new") await createOperationsItem({ ...itemForm, copyFromItemId });
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

  async function changeStep(itemId: number, stepId: number, changes: Parameters<typeof saveOperationsStep>[2]) {
    setStepBusy(stepId);
    setStepError("");
    try {
      await saveOperationsStep(itemId, stepId, changes);
      await load();
    } catch (reason) {
      setStepError(reason instanceof Error ? reason.message : "环节更新失败");
    } finally {
      setStepBusy(null);
    }
  }

  async function addStep(itemId: number) {
    const title = newStepTitle.trim();
    if (!title) return;
    setStepBusy(-1);
    setStepError("");
    try {
      await addOperationsStep(itemId, title);
      await load();
      setNewStepTitle("");
      setAddingStepTo(null);
    } catch (reason) {
      setStepError(reason instanceof Error ? reason.message : "环节添加失败");
    } finally {
      setStepBusy(null);
    }
  }

  async function removeStep(itemId: number, stepId: number) {
    setStepBusy(stepId);
    setStepError("");
    try {
      await deleteOperationsStep(itemId, stepId);
      await load();
      setSelectedStep(null);
    } catch (reason) {
      setStepError(reason instanceof Error ? reason.message : "环节移除失败");
    } finally {
      setStepBusy(null);
    }
  }

  function renderAddStepControl(itemId: number) {
    if (!board?.canManage) return null;
    return addingStepTo === itemId
      ? <form className="operations-progress__add-step" onSubmit={(event) => { event.preventDefault(); void addStep(itemId); }}>
        <input required maxLength={80} placeholder="新环节名称" value={newStepTitle} disabled={stepBusy !== null} onChange={(event) => setNewStepTitle(event.target.value)} />
        <button type="submit" disabled={stepBusy !== null}>添加</button>
        <button type="button" onClick={() => setAddingStepTo(null)}>取消</button>
      </form>
      : <button type="button" className="operations-progress__add-step-trigger"
        onClick={() => { setAddingStepTo(itemId); setNewStepTitle(""); }}>添加环节</button>;
  }

  function renderItemEditor() {
    return (
      <form className="operations-progress__form" onSubmit={(event) => void submitItem(event)}>
          <h2>{editing === "new" ? "新增事项" : "编辑事项"}</h2>
          <label>事项名称<input required maxLength={120} value={itemForm.title} onChange={(event) => setItemForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <div className="operations-progress__form-grid">
            <label>类型<select disabled={editing !== "new"} value={itemForm.kind === "workstream" && itemForm.intervalDays > 0 ? "recurring" : itemForm.kind} onChange={(event) => setItemForm((current) => ({
              ...current,
              kind: event.target.value === "recurring" ? "workstream" : event.target.value as OperationsItemInput["kind"],
              intervalDays: event.target.value === "recurring" ? 7 : 0,
              nextCheckAt: null,
            }))}>
              <option value="workstream">长期推进</option><option value="channel">账号运营</option><option value="video">视频制作</option><option value="merchandise">周边制作</option><option value="recurring">周期更新</option>
            </select></label>
          </div>
          <div className="operations-progress__form-grid">
            {itemForm.intervalDays > 0
              ? <label>更新周期（天）<input type="number" required min="1" max="365" value={itemForm.intervalDays} onChange={(event) => setItemForm((current) => ({ ...current, intervalDays: Number(event.target.value) }))} /></label>
              : <label>下次跟进（北京时间）<input type="datetime-local" value={localDateTime(itemForm.nextCheckAt)} onChange={(event) => setItemForm((current) => ({ ...current, nextCheckAt: assignmentDeadlineToISOString(event.target.value) }))} /></label>}
            {itemForm.kind !== "video" && itemForm.kind !== "merchandise" && !(typeof editing === "number" && board?.items.find((item) => item.id === editing)?.steps.length) ? <label>状态<select value={itemForm.status} onChange={(event) => setItemForm((current) => ({ ...current, status: event.target.value as OperationsItemInput["status"] }))}>
              <option value="active">进行中</option><option value="blocked">遇到阻塞</option><option value="done">已结束</option>
            </select></label> : null}
          </div>
          {itemForm.kind !== "video" && itemForm.kind !== "merchandise" && !(typeof editing === "number" && board?.items.find((item) => item.id === editing)?.steps.length) ? <label>下一步<input maxLength={300} value={itemForm.nextAction} onChange={(event) => setItemForm((current) => ({ ...current, nextAction: event.target.value }))} /></label> : null}
          {itemForm.kind !== "merchandise" ? <fieldset className="operations-progress__platforms">
            <legend>关联平台</legend>
            {([["douyin", "抖音"], ["bilibili", "B站"], ["wechat", "公众号"]] as const).map(([key, label]) => (
              <label key={key}><input type="checkbox" checked={itemForm.platforms.split(",").includes(key)} onChange={(event) => setItemForm((current) => ({
                ...current, platforms: (event.target.checked
                  ? [...current.platforms.split(",").filter(Boolean), key]
                  : current.platforms.split(",").filter((value) => value !== key)).join(","),
              }))} />{label}</label>
            ))}
          </fieldset> : null}
          {editing === "new" && (itemForm.kind === "video" || itemForm.kind === "merchandise") && board?.items.some((item) => item.kind === itemForm.kind && item.steps.length) ? <label>沿用已有分工（选填）
            <select value={copyFromItemId} onChange={(event) => setCopyFromItemId(Number(event.target.value))}>
              <option value={0}>暂不复制</option>
              {board.items.filter((item) => item.kind === itemForm.kind && item.steps.length).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label> : null}
          <div className="operations-progress__actions">
            <button className="admin-button admin-button--primary" disabled={saving}>{saving ? "保存中…" : "保存"}</button>
            <button className="admin-button admin-button--secondary" type="button" disabled={saving} onClick={() => setEditing(null)}>取消</button>
          </div>
        </form>
    );
  }

  const visibleItems = sortOperationsItems(board?.items ?? []).filter((item) =>
    (showDone || item.status !== "done")
    && (viewMode === "all" || viewMode === "blocked" && getOperationsAttention(item) === "blocked"
      || viewMode === "mine" && item.steps.some((step) => step.assigneeId === board?.viewerId))
    && (platformFilter === "all" || item.platforms.split(",").includes(platformFilter)));
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
        {board.snapshots.length > 0 ? <section className="operations-progress__account-metrics" aria-label="宣传平台关注数据">
          <FollowerTrend platform="douyin" snapshots={board.snapshots} />
          <FollowerTrend platform="bilibili" snapshots={board.snapshots} />
          <FollowerTrend platform="wechat" snapshots={board.snapshots} />
        </section> : null}
        <div className="operations-progress__stats" aria-label="事项状态">
          <div><strong>{board.items.filter((item) => item.status !== "done").length - attentionCount - blockedCount}</strong><span>正常 / 待启动</span></div>
          <div><strong>{attentionCount}</strong><span>需要跟进</span></div>
          <div><strong>{blockedCount}</strong><span>遇到阻塞</span></div>
        </div>

        {editing === "new" && board.canManage ? renderItemEditor() : null}

        <div className="operations-progress__section-head">
          <h2>运营事项</h2>
          {doneCount > 0 ? <label className="operations-progress__toggle"><input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />显示已结束（{doneCount}）</label> : null}
        </div>
        <div className="operations-progress__filters" aria-label="运营事项筛选">
          {([["all", "全部事项"], ["mine", "我的任务"], ["blocked", "卡点"]] as const).map(([key, label]) =>
            <button type="button" className={viewMode === key ? "is-selected" : ""} aria-pressed={viewMode === key}
              key={key} onClick={() => setViewMode(key)}>{label}</button>)}
          <select aria-label="按平台筛选" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
            <option value="all">全部平台</option>
            <option value="douyin">抖音</option>
            <option value="bilibili">B站</option>
            <option value="wechat">公众号</option>
          </select>
        </div>
        {visibleItems.length === 0 && !editing ? <p className="operations-progress__muted">当前筛选下暂无事项</p> : null}
        <div className="operations-progress__items">
          {visibleItems.map((item) => {
            const attention = getOperationsAttention(item);
            const due = nextOperationsDate(item);
            return <article id={`operations-item-${item.id}`} className="operations-progress__item" key={item.id}>
              <div className="operations-progress__item-head">
                <div><h3>{item.title}</h3><p className="operations-progress__muted">{item.kind === "channel" ? "账号运营" : item.kind === "video" ? "视频制作" : item.kind === "merchandise" ? "周边制作" : item.intervalDays > 0 ? `每 ${item.intervalDays} 天更新` : "长期推进"}{item.platforms ? " · " + item.platforms.split(",").map((key) => ({ douyin: "抖音", bilibili: "B站", wechat: "公众号" } as Record<string, string>)[key] || key).join(" / ") : ""}</p></div>
                <span className={`operations-progress__status operations-progress__status--${attention}`}>{operationsAttentionLabel[attention]}</span>
              </div>
              {item.steps.length > 0 ? <div className="operations-progress__video-stages" aria-label="事项流程">
                <ol style={{ gridTemplateColumns: `repeat(${item.steps.length}, minmax(6rem, 1fr))` }}>
                  {item.steps.map((step, index) => <li key={step.id} className={step.status === "done" ? "is-complete" : step.status === "active" ? "is-current" : step.status === "blocked" ? "is-blocked" : ""}>
                    <button type="button" className="operations-progress__step-button" aria-expanded={selectedStep === step.id}
                      onClick={() => {
                        setSelectedStep(selectedStep === step.id ? null : step.id);
                        setBlockReason(step.blockReason);
                        setStepTitle(step.title);
                        setStepError("");
                      }}>
                      <span className="operations-progress__step-marker" aria-hidden="true">{step.status === "done" ? "✓" : index + 1}</span>
                      <span>{step.title}</span>
                      <small>{step.assigneeName || "待分配"}</small>
                      <small>{({ pending: "待处理", active: "进行中", blocked: "受阻", done: "已完成" } as Record<OperationsStepStatus, string>)[step.status]}</small>
                    </button>
                  </li>)}
                </ol>
                {item.steps.filter((step) => step.status === "blocked").map((step) =>
                  <p className="operations-progress__blocker" key={step.id}>
                    <strong>{step.title} · {step.assigneeName || "待分配"}</strong>：{step.blockReason || "卡点原因待补充"}
                  </p>)}
                {item.steps.filter((step) => step.id === selectedStep).map((step) => <div className="operations-progress__step-detail" key={step.id}>
                  <strong>{step.title}</strong>
                  {board.canManage ? <label>环节名称
                    <input maxLength={80} value={stepTitle} disabled={stepBusy !== null} onChange={(event) => setStepTitle(event.target.value)} />
                  </label> : null}
                  {board.canManage && stepTitle.trim() && stepTitle.trim() !== step.title ? <button type="button" disabled={stepBusy !== null}
                    onClick={() => void changeStep(item.id, step.id, { title: stepTitle.trim() })}>保存名称</button> : null}
                  {board.canManage ? <label>负责人
                    <select value={step.assigneeId ?? 0} disabled={stepBusy !== null}
                      onChange={(event) => void changeStep(item.id, step.id, { assigneeId: Number(event.target.value) })}>
                      <option value={0}>待分配</option>
                      {board.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                  </label> : null}
                  {(board.canManage || step.assigneeId === board.viewerId) ? <>
                    <div className="operations-progress__actions">
                      {([["pending", "待处理"], ["active", "进行中"], ["done", "已完成"]] as const).map(([status, label]) =>
                        <button key={status} className={step.status === status ? "is-selected" : ""} type="button"
                          disabled={stepBusy !== null || step.status === status} onClick={() => void changeStep(item.id, step.id, { status })}>{label}</button>)}
                    </div>
                    <label>卡点原因
                      <input maxLength={300} value={blockReason} disabled={stepBusy !== null} onChange={(event) => setBlockReason(event.target.value)} />
                    </label>
                    <button type="button" disabled={stepBusy !== null || !blockReason.trim()}
                      onClick={() => void changeStep(item.id, step.id, { status: "blocked", blockReason })}>标记受阻</button>
                  </> : null}
                  {step.completedAt ? <span className="operations-progress__muted">完成于 {formatOperationsDate(step.completedAt)}</span> : null}
                  {board.canManage && step.status !== "done" ? <button type="button" disabled={stepBusy !== null}
                    onClick={() => void removeStep(item.id, step.id)}>移除环节</button> : null}
                  {stepError ? <p role="alert" className="operations-progress__error">{stepError}</p> : null}
                </div>)}
                {renderAddStepControl(item.id)}
              </div> : null}
              {item.steps.length === 0 ? renderAddStepControl(item.id) : null}
              <div className="operations-progress__item-body">
                {item.lastUpdate ? <p><span>最近进展</span>{item.lastUpdate.content} <time dateTime={item.lastUpdate.publishedOn || item.lastUpdate.createdAt}>（{formatOperationsUpdateDate(item.lastUpdate)}）</time>
                  {item.lastUpdate.link ? <a href={item.lastUpdate.link} target="_blank" rel="noopener noreferrer">查看链接</a> : null}</p> : null}
                {item.kind === "channel" ? <p><span>上次发布</span><strong>{formatOperationsDay(item.lastCompletedOn)}</strong>{daysSinceOperationsPublish(item.lastCompletedOn) !== null ? <small>（距今 {daysSinceOperationsPublish(item.lastCompletedOn)} 天）</small> : null}</p> : item.intervalDays > 0 ? <p><span>上次完成</span>{formatOperationsDay(item.lastCompletedOn)}</p> : null}
                {item.status !== "done" && item.steps.length === 0 && (item.nextAction || due) ? <p><span>下一步</span>{item.nextAction || "待跟进"}{due ? <time dateTime={due.toISOString()}> · {formatOperationsDate(due)}</time> : null}</p> : null}
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
              {editing === item.id && board.canManage ? renderItemEditor() : null}
              {historyItem === item.id ? <History key={`${item.id}:${item.lastUpdate?.id ?? 0}`} itemId={item.id} /> : null}
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
          <div className="operations-progress__section-head"><h2 id="operations-posts-title">历史发布</h2>
            {board.posts.some((post) => post.platform === "wechat") ? <span className="operations-progress__muted">公众号阅读数据核实于 2026-11-18</span> : null}
          </div>
          <ol>{board.posts.slice(0, 10).map((post) => <li key={`${post.platform}:${post.externalId}`}>
            <a href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a>
            <span>{post.platform === "wechat" ? "公众号" : "B站"} · {post.platform === "wechat"
              ? new Date(post.publishedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
              : formatOperationsDate(post.publishedAt)} · {post.viewCount.toLocaleString("zh-CN")} {post.platform === "wechat" ? "人阅读" : "播放"}</span>
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