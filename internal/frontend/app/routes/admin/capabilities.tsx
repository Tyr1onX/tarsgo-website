import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  capabilitiesClient,
  capabilitySourceLabel,
  formatCapabilityDate,
  formatScore,
  type CapabilityAdminGroup,
  type CapabilityAdminMember,
  type CapabilityDimension,
  type CapabilityDimensionInput,
  type CapabilitySourceRef,
} from "~/lib/capabilities-client";
import "./capabilities.css";

export function meta() {
  return [{ title: "能力评价管理 | TARSGO" }];
}

type DimensionForm = Omit<CapabilityDimensionInput, "groupId" | "sources">;
const emptyForm: DimensionForm = { name: "", description: "", sortOrder: 0 };

export default function CapabilityManagementRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [groups, setGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [groupID, setGroupID] = useState<number | null>(null);
  const [overview, setOverview] = useState<CapabilityAdminGroup | null>(null);
  const [member, setMember] = useState<CapabilityAdminMember | null>(null);
  const [selectedUserID, setSelectedUserID] = useState<number | null>(null);
  const [selectedDimensionID, setSelectedDimensionID] = useState<number | null>(null);
  const [form, setForm] = useState<DimensionForm>(emptyForm);
  const [sourceRefs, setSourceRefs] = useState<CapabilitySourceRef[]>([]);
  const [reviewDimensionID, setReviewDimensionID] = useState<number | null>(null);
  const [reviewScore, setReviewScore] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const groupRequestID = useRef(0);
  const memberRequestID = useRef(0);
  const activeGroupID = useRef(groupID);
  activeGroupID.current = groupID;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setGroups([]);
    capabilitiesClient.adminGroups().then((items) => {
      if (cancelled) return;
      setGroups(items);
      setGroupID(items[0]?.id ?? null);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "可管理组别暂时无法读取");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentUser.id]);

  useEffect(() => {
    if (!groupID) {
      setOverview(null); setMember(null); setSelectedUserID(null); setSelectedDimensionID(null);
      return;
    }
    const request = ++groupRequestID.current;
    setLoading(true); setError(""); setNotice(""); setOverview(null); setMember(null); setSelectedUserID(null);
    capabilitiesClient.adminGroup(groupID).then((result) => {
      if (groupRequestID.current !== request) return;
      setOverview(result);
      setSelectedUserID(result.members[0]?.userId ?? null);
      const firstDimension = result.dimensions.find((item) => item.active) ?? result.dimensions[0];
      setSelectedDimensionID(firstDimension?.id ?? null);
      setReviewDimensionID(result.dimensions.find((item) => item.active)?.id ?? null);
    }).catch((cause: unknown) => {
      if (groupRequestID.current === request) setError(cause instanceof Error ? cause.message : "组内能力评价暂时无法读取");
    }).finally(() => {
      if (groupRequestID.current === request) setLoading(false);
    });
    return () => { groupRequestID.current++; };
  }, [groupID]);

  useEffect(() => {
    if (!groupID || !selectedUserID) { setMember(null); return; }
    const request = ++memberRequestID.current;
    setMember(null);
    capabilitiesClient.adminMember(groupID, selectedUserID).then((result) => {
      if (memberRequestID.current === request) setMember(result);
    }).catch((cause: unknown) => {
      if (memberRequestID.current === request) setError(cause instanceof Error ? cause.message : "成员能力评价暂时无法读取");
    });
    return () => { memberRequestID.current++; };
  }, [groupID, selectedUserID]);

  const selectedDimension = overview?.dimensions.find((item) => item.id === selectedDimensionID) ?? null;
  const activeDimensions = useMemo(() => overview?.dimensions.filter((item) => item.active) ?? [], [overview]);
  const selectedMemberSummary = overview?.members.find((item) => item.userId === selectedUserID) ?? null;

  useEffect(() => {
    if (selectedDimension) {
      setForm({ name: selectedDimension.name, description: selectedDimension.description, sortOrder: selectedDimension.sortOrder });
      setSourceRefs(selectedDimension.sources.map((item) => ({ ...item })));
    } else {
      setForm(emptyForm);
      setSourceRefs([]);
    }
  }, [selectedDimensionID, groupID]);

  async function refreshGroup(preferredDimensionID = selectedDimensionID, preferredUserID = selectedUserID) {
    if (!groupID) return;
    const currentGroupID = groupID;
    const next = await capabilitiesClient.adminGroup(currentGroupID);
    if (currentGroupID !== activeGroupID.current) return;
    setOverview(next);
    const nextDimension = next.dimensions.find((item) => item.id === preferredDimensionID) ?? next.dimensions.find((item) => item.active) ?? null;
    setSelectedDimensionID(nextDimension?.id ?? null);
    setForm(nextDimension ? { name: nextDimension.name, description: nextDimension.description, sortOrder: nextDimension.sortOrder } : emptyForm);
    setSourceRefs(nextDimension?.sources.map((item) => ({ ...item })) ?? []);
    const nextUserID = next.members.some((item) => item.userId === preferredUserID) ? preferredUserID : next.members[0]?.userId ?? null;
    setSelectedUserID(nextUserID);
    if (nextUserID) {
      const nextMember = await capabilitiesClient.adminMember(currentGroupID, nextUserID);
      if (currentGroupID === activeGroupID.current) setMember(nextMember);
    } else {
      setMember(null);
    }
  }

  function selectGroup(nextID: number) {
    setGroupID(nextID); setOverview(null); setMember(null); setSelectedUserID(null); setSelectedDimensionID(null);
  }

  function selectDimension(dimension: CapabilityDimension) {
    setSelectedDimensionID(dimension.id);
  }

  function startNewDimension() {
    setSelectedDimensionID(null); setForm(emptyForm); setSourceRefs([]); setNotice("");
  }

  function toggleSource(ref: CapabilitySourceRef, checked: boolean) {
    setSourceRefs((previous) => checked
      ? [...previous, ref]
      : previous.filter((item) => item.type !== ref.type || item.id !== ref.id));
  }

  async function saveDimension(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupID || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const payload: CapabilityDimensionInput = { ...form, sortOrder: Math.max(0, Number(form.sortOrder) || 0), sources: sourceRefs };
      const saved = selectedDimensionID
        ? await capabilitiesClient.updateDimension(selectedDimensionID, payload)
        : await capabilitiesClient.createDimension({ ...payload, groupId: groupID });
      setSelectedDimensionID(saved.id);
      await refreshGroup(saved.id, selectedUserID);
      setNotice("能力维度已保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "能力维度保存失败");
    } finally { setSaving(false); }
  }

  async function deleteDimension() {
    if (!selectedDimension?.active || saving) return;
    if (!window.confirm(`移除「${selectedDimension.name}」？它将不再参与能力雷达，已有评价记录会保留。`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await capabilitiesClient.deleteDimension(selectedDimension.id);
      await refreshGroup(null, selectedUserID);
      setNotice("能力维度已移除，历史记录已保留。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "移除能力维度失败");
    } finally { setSaving(false); }
  }

  async function addManualReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupID || !selectedUserID || !reviewDimensionID || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await capabilitiesClient.addManualReview(groupID, selectedUserID, {
        dimensionId: reviewDimensionID,
        score: Math.min(100, Math.max(0, Number(reviewScore))),
        comment: reviewComment.trim(),
      });
      setMember(updated);
      setReviewScore("");
      setReviewComment("");
      await refreshGroup(selectedDimensionID, selectedUserID);
      setNotice("人工评价已追加，原始评分保持不变。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "人工评价保存失败");
    } finally { setSaving(false); }
  }

  const hasSource = (ref: CapabilitySourceRef) => sourceRefs.some((item) => item.type === ref.type && item.id === ref.id);

  return (
    <section className="capability-admin-page" aria-labelledby="capability-admin-title">
      <header className="capability-admin-header">
        <div><h1 id="capability-admin-title">能力评价管理</h1></div>
        <span className="capability-admin-scale">0–100 分</span>
      </header>
      {error ? <div className="capability-admin-alert" role="alert">{error}</div> : null}
      {notice ? <p className="capability-admin-notice" role="status">{notice}</p> : null}
      {loading && groups.length === 0 ? <p role="status" className="capability-admin-state">正在读取可管理组别…</p> : null}
      {!loading && groups.length === 0 ? <div className="capability-admin-empty">当前没有可管理的组别。</div> : null}
      {groups.length > 0 ? <>
        {groups.length > 1 ? <div className="capability-admin-tabs" role="group" aria-label="选择要管理的组别">{groups.map((item) => <button key={item.id} type="button" aria-pressed={item.id === groupID} onClick={() => selectGroup(item.id)}>{item.name}</button>)}</div> : <p className="capability-admin-group-name">{groups[0]?.name}</p>}
        {loading && !overview ? <p role="status" className="capability-admin-state">正在读取组内评价…</p> : null}
        {overview ? <>
          <div className="capability-admin-layout">
            <section className="capability-admin-panel" aria-labelledby="dimension-settings-title">
              <div className="capability-admin-panel-heading"><h2 id="dimension-settings-title">能力维度</h2><button className="capability-admin-primary" type="button" onClick={startNewDimension}>＋ 新建维度</button></div>
              <div className="capability-dimension-list">
                {overview.dimensions.length === 0 ? <p className="capability-admin-muted">本组尚未配置能力维度。</p> : overview.dimensions.map((dimension) => <button key={dimension.id} type="button" className={`capability-dimension-choice ${selectedDimensionID === dimension.id ? "is-selected" : ""}`} onClick={() => selectDimension(dimension)}>
                  <span><strong>{dimension.name}</strong><small>{dimension.sources.length} 个评价来源</small></span>{!dimension.active ? <em>已移除</em> : null}
                </button>)}
              </div>
              <form className="capability-dimension-form" onSubmit={saveDimension}>
                <h3>{selectedDimension ? selectedDimension.active ? "编辑维度" : "已移除的维度" : "新建维度"}</h3>
                {!selectedDimension?.active && selectedDimension ? <p className="capability-admin-muted">已移除的维度仍保留在成员历史记录中。</p> : null}
                <label>维度名称<input value={form.name} maxLength={100} required disabled={Boolean(selectedDimension && !selectedDimension.active)} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label>说明（可选）<textarea value={form.description} maxLength={5000} rows={2} disabled={Boolean(selectedDimension && !selectedDimension.active)} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                <fieldset disabled={Boolean(selectedDimension && !selectedDimension.active)}>
                  <legend>评价来源</legend>
                  {overview.sources.length === 0 ? <p className="capability-admin-muted">本组还没有作业或实践项目。</p> : <div className="capability-source-options">
                    {overview.sources.map((source) => <label key={`${source.type}:${source.id}`}>
                      <input type="checkbox" checked={hasSource(source)} onChange={(event) => toggleSource(source, event.target.checked)} />
                      <span><small>{capabilitySourceLabel(source.type)}</small>{source.title}</span>
                    </label>)}
                  </div>}
                  <p className="capability-admin-muted">尚未评分的来源不参与计算；也可只用人工评价。</p>
                </fieldset>
                <div className="capability-dimension-actions">
                  {selectedDimension?.active ? <button className="capability-admin-danger" type="button" disabled={saving} onClick={deleteDimension}>移除维度</button> : null}
                  {(!selectedDimension || selectedDimension.active) ? <button className="capability-admin-primary" type="submit" disabled={saving}>{saving ? "保存中…" : "保存维度"}</button> : null}
                </div>
              </form>
            </section>

            <section className="capability-admin-panel capability-admin-members" aria-labelledby="member-capabilities-title">
              <div className="capability-admin-panel-heading"><h2 id="member-capabilities-title">成员能力</h2></div>
              {overview.members.length === 0 ? <p className="capability-admin-muted">本组暂无成员。</p> : <>
                <label className="capability-member-select">选择成员<select className="admin-field" value={selectedUserID ?? ""} onChange={(event) => setSelectedUserID(Number(event.target.value) || null)}>{overview.members.map((item) => <option key={item.userId} value={item.userId}>{item.displayName}</option>)}</select></label>
                {selectedMemberSummary ? <div className="capability-member-summary">{selectedMemberSummary.dimensions.map((dimension) => <span key={dimension.id}>{dimension.name} <strong>{dimension.score === null ? "暂无评价" : `${formatScore(dimension.score)} 分`}</strong></span>)}</div> : null}
                {member ? <>
                  <div className="capability-admin-detail-list">
                    {member.dimensions.map((dimension) => {
                      const dimensionConfig = overview.dimensions.find((item) => item.id === dimension.id);
                      return <article key={dimension.id} className={!dimensionConfig?.active ? "is-archived" : ""}>
                        <div className="capability-admin-result-heading"><div><h3>{dimension.name}</h3>{!dimensionConfig?.active ? <small>已移除</small> : null}</div><strong>{dimension.score === null ? "暂无评价" : `${formatScore(dimension.score)} 分`}</strong></div>
                        {dimension.sources && dimension.sources.length > 0 ? <ul>{dimension.sources.map((source) => <li key={`${source.sourceType}-${source.id}`}>
                          <div><span className="capability-source-kind">{capabilitySourceLabel(source.sourceType)}</span><strong>{source.sourceTitle}</strong><time>{formatCapabilityDate(source.evaluatedAt)}</time></div>
                          <b>{source.score} 分</b>
                          {source.reviewerName ? <small>评价人：{source.reviewerName}</small> : null}
                          {source.comment ? <p>{source.comment}</p> : null}
                        </li>)}</ul> : <p className="capability-admin-muted">暂无有效评价来源。</p>}
                      </article>;
                    })}
                  </div>
                  {activeDimensions.length > 0 ? <form className="capability-manual-review" onSubmit={addManualReview}>
                    <h3>补充人工评价</h3>
                    <div className="capability-manual-fields">
                      <label>能力维度<select className="admin-field" value={reviewDimensionID ?? ""} onChange={(event) => setReviewDimensionID(Number(event.target.value) || null)}>{activeDimensions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                      <label>评分<input type="number" min={0} max={100} step={1} value={reviewScore} onChange={(event) => setReviewScore(event.target.value)} required /></label>
                    </div>
                    <label>评价说明<textarea value={reviewComment} maxLength={2000} rows={3} required onChange={(event) => setReviewComment(event.target.value)} /></label>
                    <button className="capability-admin-primary" type="submit" disabled={saving || !selectedUserID}>{saving ? "保存中…" : "追加评价"}</button>
                  </form> : null}
                </> : <p className="capability-admin-muted">正在读取成员评价来源…</p>}
              </>}
            </section>
          </div>
        </> : null}
      </> : null}
    </section>
  );
}
