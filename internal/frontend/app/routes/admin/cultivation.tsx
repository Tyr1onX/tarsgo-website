import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router";

import { CapabilityRadar, formatScore } from "~/components/capability-radar";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { capabilitiesClient, capabilitySourceLabel, formatCapabilityDate } from "~/lib/capabilities-client";
import { cultivationClient, type CultivationGroup, type CultivationMember } from "~/lib/cultivation-client";
import { formatGrowthDate, growthEventLabel } from "~/lib/growth-presentation";
import "~/routes/dashboard/capabilities.css";
import "./cultivation.css";

export function meta() {
  return [{ title: "人员培养 | TARSGO" }];
}

export default function CultivationRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [groups, setGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [groupID, setGroupID] = useState<number | null>(null);
  const [overview, setOverview] = useState<CultivationGroup | null>(null);
  const [member, setMember] = useState<CultivationMember | null>(null);
  const [selectedUserID, setSelectedUserID] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [focusedOnly, setFocusedOnly] = useState(false);
  const [focusValue, setFocusValue] = useState(false);
  const [internalNote, setInternalNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const groupRequest = useRef(0);
  const memberRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
    if (!groupID) { setOverview(null); setMember(null); setSelectedUserID(null); return; }
    const request = ++groupRequest.current;
    setLoading(true); setError(""); setNotice(""); setOverview(null); setMember(null); setSelectedUserID(null);
    cultivationClient.group(groupID).then((result) => {
      if (groupRequest.current !== request) return;
      setOverview(result);
      setSelectedUserID(result.members[0]?.userId ?? null);
    }).catch((cause: unknown) => {
      if (groupRequest.current === request) setError(cause instanceof Error ? cause.message : "组内培养视图暂时无法读取");
    }).finally(() => { if (groupRequest.current === request) setLoading(false); });
    return () => { groupRequest.current++; };
  }, [groupID]);

  useEffect(() => {
    if (!groupID || !selectedUserID) { setMember(null); return; }
    const request = ++memberRequest.current;
    setMember(null);
    cultivationClient.member(groupID, selectedUserID).then((result) => {
      if (memberRequest.current !== request) return;
      setMember(result);
      setFocusValue(result.focused);
      setInternalNote(result.internalNote ?? "");
    }).catch((cause: unknown) => {
      if (memberRequest.current === request) setError(cause instanceof Error ? cause.message : "成员成长档案暂时无法读取");
    });
    return () => { memberRequest.current++; };
  }, [groupID, selectedUserID]);

  const visibleMembers = useMemo(() => (overview?.members ?? []).filter((item) =>
    (!focusedOnly || item.focused) && item.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  ), [focusedOnly, overview, query]);
  const activeDimensions = useMemo(() => member?.dimensions.filter((item) => overview?.dimensions.some((dimension) => dimension.id === item.id && dimension.active)) ?? [], [member, overview]);

  async function refreshSelected() {
    if (!groupID || !selectedUserID) return;
    const [nextOverview, nextMember] = await Promise.all([
      cultivationClient.group(groupID), cultivationClient.member(groupID, selectedUserID),
    ]);
    setOverview(nextOverview);
    setMember(nextMember);
    setFocusValue(nextMember.focused);
    setInternalNote(nextMember.internalNote ?? "");
  }

  async function saveFocus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupID || !selectedUserID || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await cultivationClient.updateFocus(groupID, selectedUserID, { focused: focusValue, internalNote: internalNote.trim() });
      await refreshSelected();
      setNotice("内部培养记录已保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "培养记录保存失败");
    } finally { setSaving(false); }
  }

  return (
    <section className="cultivation-page admin-design" aria-labelledby="cultivation-title">
      <header className="cultivation-header">
        <div><h1 id="cultivation-title">人员培养</h1><p>按组查看成员成长、能力表现和培养记录。</p></div>
        <Link to="/dashboard/admin/training/capabilities">能力维度与评价来源 <span aria-hidden="true">↗</span></Link>
      </header>
      {error ? <div className="cultivation-alert" role="alert">{error}</div> : null}
      {notice ? <p className="cultivation-notice" role="status">{notice}</p> : null}
      {groups.length > 1 ? <label className="cultivation-group-select">组别<select className="admin-field" value={groupID ?? ""} onChange={(event) => setGroupID(Number(event.target.value) || null)}>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : groups.length === 1 ? <p className="cultivation-group-name">{groups[0].name}</p> : null}
      {loading && !overview ? <p className="cultivation-state" role="status">正在读取组内培养数据…</p> : null}
      {!loading && groups.length === 0 ? <div className="cultivation-empty">当前没有可管理的组别。</div> : null}
      {overview ? <>
        <p className="cultivation-rule">综合表现为已有维度分数的算术平均；无评价时不计分，同分按姓名排序。</p>
        <div className="cultivation-layout">
          <section className="cultivation-panel cultivation-roster" aria-labelledby="cultivation-roster-title">
            <div className="cultivation-panel-heading"><h2 id="cultivation-roster-title">{overview.groupName} · {overview.members.length} 人</h2><span>组内比较</span></div>
            <div className="cultivation-filters">
              <label><span className="sr-only">搜索成员</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索成员" /></label>
              <label className="cultivation-focus-filter"><input type="checkbox" checked={focusedOnly} onChange={(event) => setFocusedOnly(event.target.checked)} />重点培养</label>
            </div>
            <div className="cultivation-roster-list">
              {visibleMembers.length === 0 ? <p className="cultivation-muted">没有符合条件的成员。</p> : visibleMembers.map((item) => <button key={item.userId} type="button" className={`cultivation-person ${selectedUserID === item.userId ? "is-selected" : ""}`} onClick={() => setSelectedUserID(item.userId)}>
                <span className="cultivation-person__top"><strong>{item.displayName}</strong>{item.focused ? <em>重点培养</em> : null}</span>
                <span className="cultivation-person__meta"><span>{item.groupRole}</span><span>{item.overallScore === null ? "暂无评价" : `${formatScore(item.overallScore)} 分`}</span><span>已评 {item.scoredDimensions}/{item.totalDimensions}</span></span>
                <span className="cultivation-person__metrics"><span>作业 {item.assignments.completed}/{item.assignments.total}</span><span>项目 {item.practiceProjects.completed}/{item.practiceProjects.total}</span></span>
                {item.dimensions.filter((dimension) => dimension.active).length > 0 ? <span className="cultivation-person__dimensions">{item.dimensions.filter((dimension) => dimension.active).map((dimension) => `${dimension.name} ${dimension.score === null ? "—" : formatScore(dimension.score)}`).join(" · ")}</span> : null}
              </button>)}
            </div>
            <div className="cultivation-organization"><h3>组内身份</h3><div>{overview.members.filter((item) => item.groupRole === "组长").map((item) => <span key={item.userId}>{item.displayName} · 组长</span>)}{overview.members.filter((item) => item.groupRole !== "组长").length > 0 ? <span>{overview.members.filter((item) => item.groupRole !== "组长").length} 名成员</span> : null}</div></div>
          </section>
          <section className="cultivation-panel cultivation-dossier" aria-labelledby="cultivation-dossier-title">
            {!member ? <p className="cultivation-muted">选择成员查看成长档案。</p> : <>
              <div className="cultivation-panel-heading"><div><h2 id="cultivation-dossier-title">{member.displayName}</h2><span>{member.groupRole} · {member.groupName}</span></div><strong>{member.overallScore === null ? "暂无评价" : `${formatScore(member.overallScore)} 分`}</strong></div>
              <div className="cultivation-dossier__summary"><span>作业通过 <strong>{member.assignments.completed}/{member.assignments.total}</strong></span><span>项目验收 <strong>{member.practiceProjects.completed}/{member.practiceProjects.total}</strong></span></div>
              <div className="cultivation-dossier__ability"><CapabilityRadar dimensions={activeDimensions} title={`${member.displayName}能力雷达`} /><div className="cultivation-dimension-results">{activeDimensions.map((dimension) => <span key={dimension.id}>{dimension.name}<strong>{dimension.score === null ? "暂无评价" : `${formatScore(dimension.score)} 分`}</strong></span>)}</div></div>
              <form className="cultivation-focus-form" onSubmit={saveFocus}>
                <div className="cultivation-panel-heading"><h3>内部培养记录</h3>{member.focusUpdatedAt ? <small>{member.focusUpdatedBy} · {formatCapabilityDate(member.focusUpdatedAt)}</small> : null}</div>
                <label className="cultivation-focus-toggle"><input type="checkbox" checked={focusValue} onChange={(event) => setFocusValue(event.target.checked)} />重点培养</label>
                <label>管理员备注<textarea maxLength={2000} rows={3} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="记录组内培养安排或观察" /></label>
                <button type="submit" disabled={saving}>{saving ? "保存中…" : "保存培养记录"}</button>
              </form>
              <section className="cultivation-sources" aria-labelledby="cultivation-sources-title"><div className="cultivation-panel-heading"><h3 id="cultivation-sources-title">评价来源</h3><Link to="/dashboard/admin/training/capabilities">管理评价 ↗</Link></div>
                {member.dimensions.filter((dimension) => overview.dimensions.some((item) => item.id === dimension.id && item.active)).flatMap((dimension) => (dimension.sources ?? []).map((source) => ({ ...source, dimensionName: dimension.name }))).length === 0 ? <p className="cultivation-muted">暂无有效评价来源。</p> : <ul>{member.dimensions.filter((dimension) => overview.dimensions.some((item) => item.id === dimension.id && item.active)).flatMap((dimension) => (dimension.sources ?? []).map((source) => ({ ...source, dimensionName: dimension.name }))).map((source) => <li key={`${source.dimensionName}-${source.sourceType}-${source.id}`}><div><span>{source.dimensionName} · {capabilitySourceLabel(source.sourceType)}</span><strong>{source.sourceTitle}</strong><small>{formatCapabilityDate(source.evaluatedAt)}{source.reviewerName ? ` · ${source.reviewerName}` : ""}</small></div><b>{source.score} 分</b>{source.comment ? <p>{source.comment}</p> : null}</li>)}</ul>}
              </section>
              <section className="cultivation-timeline" aria-labelledby="cultivation-timeline-title"><div className="cultivation-panel-heading"><h3 id="cultivation-timeline-title">成长记录</h3><span>{member.events.length} 条</span></div>
                {member.events.length === 0 ? <p className="cultivation-muted">暂无成长记录。</p> : <ol>{[...member.events].reverse().map((event) => <li key={event.key}><time dateTime={event.occurredAt}>{formatGrowthDate(event.occurredAt)}</time><strong>{event.title}</strong><span>{growthEventLabel(event.kind)}{event.description ? ` · ${event.description}` : ""}</span></li>)}</ol>}
              </section>
            </>}
          </section>
        </div>
      </> : null}
    </section>
  );
}
