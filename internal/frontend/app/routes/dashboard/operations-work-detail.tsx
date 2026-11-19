import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  formatOperationsDate, getOperationsAttention, getOperationsBoard, getOperationsStepActivity,
  getOperationsWorks, operationsAttentionLabel, operationsPlatformNames,
  operationsStepFileURL, saveOperationsPublication, saveOperationsStep,
  type OperationsBoard, type OperationsPost, type OperationsStepActivity, type OperationsStepStatus,
} from "~/lib/operations-progress-client";
import { OperationsStageBar } from "./operations-stage-bar";
import "./operations-progress.css";

export function meta() { return [{ title: "作品进度 | TARSGO" }]; }

const statusLabels: Record<OperationsStepStatus, string> = {
  pending: "待处理", active: "进行中", blocked: "受阻", done: "已完成",
};

export default function OperationsWorkDetailPage() {
  const { itemId } = useParams();
  const [params, setParams] = useSearchParams();
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OperationsStepStatus>("pending");
  const [reason, setReason] = useState("");
  const [activity, setActivity] = useState<OperationsStepActivity | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [postStatus, setPostStatus] = useState<"pending" | "done">("pending");
  const [postURL, setPostURL] = useState("");
  const [availablePosts, setAvailablePosts] = useState<OperationsPost[]>([]);

  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((value) => { if (active) setBoard(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => { active = false; };
  }, [itemId]);

  const item = board?.items.find((entry) => entry.id === Number(itemId));
  const isOtherWork = item?.kind === "merchandise";
  const contentWork = item && (item.kind === "video" || item.kind === "article" || isOtherWork);
  const selectedStep = item?.steps.find((step) => step.id === Number(params.get("step")));
  const selectedPublication = item?.publications.find((target) => target.platform === params.get("publish"));
  const canUpdateStep = Boolean(selectedStep && board?.canEditStatus);
  const canPublish = Boolean(item && board?.canManage);

  useEffect(() => {
    setStatus(selectedStep?.status ?? "pending");
    setReason(selectedStep?.blockReason ?? "");
    setActivity(null);
    setHistoryOpen(false);
    setHistoryError("");
    setError("");
  }, [selectedStep?.id, selectedStep?.status, selectedStep?.blockReason]);

  useEffect(() => {
    setPostStatus(selectedPublication?.status ?? "pending");
    setPostURL(selectedPublication?.url ?? "");
    setAvailablePosts([]);
    setError("");
    if (!selectedPublication) return;
    let active = true;
    void getOperationsWorks(selectedPublication.platform, 1).then((data) => {
      if (active) setAvailablePosts(data.posts.filter((post) => post.platform === selectedPublication.platform && post.url));
    }).catch(() => { /* Manual link remains available when the platform history is inaccessible. */ });
    return () => { active = false; };
  }, [selectedPublication?.platform, selectedPublication?.status, selectedPublication?.url]);

  async function saveStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !selectedStep || !canUpdateStep || saving) return;
    const changed = status !== selectedStep.status || (status === "blocked" && reason.trim() !== selectedStep.blockReason);
    if (!changed) return;
    if (status === "blocked" && !reason.trim()) { setError("请说明卡点"); return; }
    if (!window.confirm(`确认将「${selectedStep.title}」更新为「${statusLabels[status]}」？`)) return;
    setSaving(true);
    setError("");
    try {
      await saveOperationsStep(item.id, selectedStep.id, {
        status, blockReason: status === "blocked" ? reason.trim() : "",
      });
      setBoard(await getOperationsBoard());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新失败");
    } finally { setSaving(false); }
  }

  async function showHistory() {
    if (!item || !selectedStep) return;
    if (historyOpen) { setHistoryOpen(false); return; }
    setHistoryOpen(true);
    if (activity) return;
    try {
      setActivity(await getOperationsStepActivity(item.id, selectedStep.id));
      setHistoryError("");
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : "记录读取失败");
    }
  }

  async function savePublication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !selectedPublication || !canPublish || saving) return;
    if (postStatus === "done" && !postURL.trim()) { setError("请选择或填写真实作品链接"); return; }
    if (postStatus === selectedPublication.status && postURL.trim() === selectedPublication.url) return;
    if (!window.confirm(`确认更新「${operationsPlatformNames[selectedPublication.platform]}」的发布状态？`)) return;
    setSaving(true);
    setError("");
    try {
      await saveOperationsPublication(item.id, selectedPublication.platform, {
        status: postStatus, url: postURL.trim(), versionNote: selectedPublication.versionNote,
      });
      setBoard(await getOperationsBoard());
      setParams({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登记失败");
    } finally { setSaving(false); }
  }

  const changedStep = Boolean(selectedStep && (status !== selectedStep.status ||
    status === "blocked" && reason.trim() !== selectedStep.blockReason));
  const changedPublication = Boolean(selectedPublication && (postStatus !== selectedPublication.status ||
    postURL.trim() !== selectedPublication.url));

  return <main className="operations-progress admin-design">
    <Link className="operations-progress__back" to={isOtherWork
      ? "/dashboard/workbench/operations" : "/dashboard/workbench/operations/works"}>
      {isOtherWork ? "返回运营动态" : "返回全部作品"}
    </Link>
    {!board && error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
    {!board && !error ? <p className="operations-progress__muted">正在加载…</p>
      : !item || !contentWork ? <p className="operations-progress__error">作品不存在</p>
      : <>
        <header className="operations-progress__channel-head">
          <div>
            {isOtherWork ? <p className="operations-progress__eyebrow">其他事务</p>
              : item.seriesName ? <p className="operations-progress__eyebrow">{item.seriesName}</p>
                : null}
            <h1>{item.title}</h1>
            {item.leadName ? <p className="operations-progress__muted">总负责人：{item.leadName}</p> : null}
          </div>
          {board?.canManage ? <Link className="admin-button admin-button--secondary"
            to={`/dashboard/workbench/operations/episodes/${item.id}/setup`}>管理作品</Link> : null}
        </header>
        <article className="operations-progress__item">
          <div className="operations-progress__item-head">
            <h2>{isOtherWork ? "执行进度" : "制作进度"}</h2>
            <span className={`operations-progress__status operations-progress__status--${getOperationsAttention(item)}`}>
              {operationsAttentionLabel[getOperationsAttention(item)]}
            </span>
          </div>
          <OperationsStageBar item={item} />
          {selectedStep ? <section className="operations-progress__inline-editor">
            <div className="operations-progress__item-head">
              <div>
                <h3>{selectedStep.title}</h3>
                <p className="operations-progress__muted">
                  参考负责人：{selectedStep.assigneeName || "待分配"} · {statusLabels[selectedStep.status]}
                </p>
              </div>
              <button type="button" className="operations-progress__subtle-button"
                onClick={() => setParams({})} aria-label="关闭环节">关闭</button>
            </div>
            {selectedStep.key === "published" && item.publications.length > 0
              ? canPublish ? <p className="operations-progress__muted">请在下方选择平台登记发布。</p> : null
              : canUpdateStep ? <form onSubmit={(event) => void saveStep(event)}
                className="operations-progress__inline-form">
                <label>状态
                  <select value={status} disabled={saving} onChange={(event) => setStatus(event.target.value as OperationsStepStatus)}>
                    <option value="pending">待处理</option>
                    <option value="active">进行中</option>
                    <option value="blocked">受阻</option>
                    <option value="done">已完成</option>
                  </select>
                </label>
                {status === "blocked" ? <label>卡点原因
                  <textarea rows={2} required maxLength={300} value={reason}
                    onChange={(event) => setReason(event.target.value)} />
                </label> : null}
                <button className="admin-button admin-button--primary" disabled={saving || !changedStep} type="submit">
                  {saving ? "保存中…" : "确认更新"}
                </button>
              </form> : null}
            {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
            <button className="operations-progress__subtle-button" type="button"
              onClick={() => void showHistory()}>{historyOpen ? "收起记录" : "查看更新记录"}</button>
            {historyOpen ? <div className="operations-progress__history">
              {historyError ? <p className="operations-progress__error" role="alert">{historyError}</p> : null}
              {!activity && !historyError ? <p className="operations-progress__muted">正在加载…</p> : null}
              {activity?.updates.length ? <ol className="operations-progress__activity">
                {activity.updates.map((entry) => <li key={entry.id}>
                  <strong>{entry.authorName || `成员 #${entry.authorId}`}</strong>
                  <time dateTime={entry.createdAt}>{formatOperationsDate(entry.createdAt)}</time>
                  <p>{entry.content}</p>
                  {entry.link ? <a href={entry.link} target="_blank" rel="noopener noreferrer">查看成果</a> : null}
                </li>)}
              </ol> : null}
              {activity?.attachments.length ? <ul className="operations-progress__files">
                {activity.attachments.map((file) => <li key={file.id}>
                  <a href={operationsStepFileURL(file.id)}>{file.fileName}</a>
                  <small>{formatOperationsDate(file.createdAt)}</small>
                </li>)}
              </ul> : null}
              {activity && !activity.updates.length && !activity.attachments.length
                ? <p className="operations-progress__muted">暂无记录</p> : null}
            </div> : null}
          </section> : null}
        </article>
        {!isOtherWork ? <section className="operations-progress__item operations-progress__publication-section">
          <div className="operations-progress__item-head"><h2>平台发布</h2></div>
          <div className="operations-progress__publication-list">
            {item.publications.map((target) => <div className="operations-progress__publication-row" key={target.platform}>
              <div>
                <strong>{operationsPlatformNames[target.platform]}</strong>
                {target.versionNote ? <p className="operations-progress__muted">{target.versionNote}</p> : null}
              </div>
              <span className={target.status === "done" ? "operations-progress__publication-done" : "operations-progress__muted"}>
                {target.status === "done" ? "已发布" : "待发布"}
              </span>
              {target.url ? <a href={target.url} target="_blank" rel="noopener noreferrer">查看作品</a> : null}
              {canPublish ? <Link className="operations-progress__small-link" to={`?publish=${target.platform}`}>
                {target.status === "done" ? "更正" : "登记"}
              </Link> : null}
            </div>)}
          </div>
          {selectedPublication && canPublish ? <form className="operations-progress__inline-editor operations-progress__inline-form"
            onSubmit={(event) => void savePublication(event)}>
            <div className="operations-progress__item-head">
              <h3>{operationsPlatformNames[selectedPublication.platform]} · 发布结果</h3>
              <button type="button" className="operations-progress__subtle-button"
                onClick={() => setParams({})}>关闭</button>
            </div>
            <label>发布状态
              <select value={postStatus} onChange={(event) => setPostStatus(event.target.value as "pending" | "done")}>
                <option value="pending">待发布</option>
                <option value="done">已发布</option>
              </select>
            </label>
            {availablePosts.length ? <label>从已同步作品选择
              <select value={availablePosts.some((post) => post.url === postURL) ? postURL : ""}
                onChange={(event) => { setPostURL(event.target.value); if (event.target.value) setPostStatus("done"); }}>
                <option value="">选择作品（也可手动填写）</option>
                {availablePosts.map((post) => <option key={post.externalId} value={post.url}>
                  {post.title} · {formatOperationsDate(post.publishedAt)}
                </option>)}
              </select>
            </label> : null}
            {availablePosts.some((post) => post.url === postURL) ? <p className="operations-progress__muted">已匹配平台发布记录</p> : null}
            <label>作品链接
              <input type="url" maxLength={500} placeholder="https://" value={postURL}
                onChange={(event) => setPostURL(event.target.value)} />
            </label>
            {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
            <button className="admin-button admin-button--primary" type="submit"
              disabled={saving || !changedPublication}>{saving ? "保存中…" : "确认发布状态"}</button>
          </form> : null}
        </section> : null}
      </>}
  </main>;
}
