import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router";

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
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
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
    setLoading(true); setError(""); setNotice(""); setOverview(null); setMember(null); setSelectedUserID(null); setSelectedYear(null);
    cultivationClient.group(groupID).then((result) => {
      if (groupRequest.current !== request) return;
      setOverview(result);
      const newestYear = Math.max(0, ...result.members.map((item) => item.joinedYear));
      setSelectedUserID(result.members.find((item) => item.joinedYear === newestYear)?.userId ?? null);
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

  const years = useMemo(() => [...new Set((overview?.members ?? []).map((item) => item.joinedYear))].sort((a, b) => b - a), [overview]);
  const activeYear = selectedYear !== null && years.includes(selectedYear) ? selectedYear : years[0] ?? null;
  const visibleMembers = useMemo(() => (overview?.members ?? []).filter((item) =>
    item.joinedYear === activeYear && (!focusedOnly || item.focused) && item.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  ), [activeYear, focusedOnly, overview, query]);

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
        <div><h1 id="cultivation-title">人员培养</h1></div>
      </header>
      {error ? <div className="cultivation-alert" role="alert">{error}</div> : null}
      {notice ? <p className="cultivation-notice" role="status">{notice}</p> : null}
      {groups.length > 1 ? <label className="cultivation-group-select">组别<select className="admin-field" value={groupID ?? ""} onChange={(event) => setGroupID(Number(event.target.value) || null)}>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : groups.length === 1 ? <p className="cultivation-group-name">{groups[0].name}</p> : null}
      {loading && !overview ? <p className="cultivation-state" role="status">正在读取组内培养数据…</p> : null}
      {!loading && groups.length === 0 ? <div className="cultivation-empty">当前没有可管理的组别。</div> : null}
      {overview ? <>
        <div className="cultivation-layout">
          <section className="cultivation-panel cultivation-roster" aria-labelledby="cultivation-roster-title">
            <div className="cultivation-panel-heading"><h2 id="cultivation-roster-title">{overview.groupName} · {overview.members.length} 人</h2></div>
            <div className="cultivation-filters">
              {years.length > 1 ? <label className="cultivation-year-filter"><span>入组年份</span><select className="admin-field" value={activeYear ?? ""} onChange={(event) => { const year = Number(event.target.value); setSelectedYear(year); setSelectedUserID(overview.members.find((item) => item.joinedYear === year)?.userId ?? null); }}>{years.map((year) => <option key={year} value={year}>{year} 年</option>)}</select></label> : activeYear !== null ? <span className="cultivation-muted">{activeYear} 年入组</span> : null}
              <label><span className="sr-only">搜索成员</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索成员" /></label>
              <label className="cultivation-focus-filter"><input type="checkbox" checked={focusedOnly} onChange={(event) => setFocusedOnly(event.target.checked)} />重点培养</label>
            </div>
            <div className="cultivation-roster-list">
              {visibleMembers.length === 0 ? <p className="cultivation-muted">没有符合条件的成员。</p> : visibleMembers.map((item) => <button key={item.userId} type="button" className={`cultivation-person ${selectedUserID === item.userId ? "is-selected" : ""}`} onClick={() => setSelectedUserID(item.userId)}>
                <span className="cultivation-person__top"><strong>{item.displayName}</strong>{item.focused ? <em>重点培养</em> : null}</span>
                <span className="cultivation-person__meta"><span>{item.groupRole}</span></span>
                <span className="cultivation-person__metrics"><span>作业 {item.assignments.completed}/{item.assignments.total}</span><span>项目 {item.practiceProjects.completed}/{item.practiceProjects.total}</span></span>
              </button>)}
            </div>
          </section>
          <section className="cultivation-panel cultivation-dossier" aria-labelledby="cultivation-dossier-title">
            {!member ? <p className="cultivation-muted">选择成员查看成长档案。</p> : <>
              <div className="cultivation-panel-heading"><div><h2 id="cultivation-dossier-title">{member.displayName}</h2><span>{member.groupRole} · {member.groupName} · {member.joinedYear} 年入组</span></div></div>
              <div className="cultivation-dossier__summary"><span>作业通过 <strong>{member.assignments.completed}/{member.assignments.total}</strong></span><span>项目验收 <strong>{member.practiceProjects.completed}/{member.practiceProjects.total}</strong></span></div>
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
