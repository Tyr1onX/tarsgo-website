import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router";

import { CapabilityRadar, formatScore } from "~/components/capability-radar";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { capabilitiesClient, capabilitySourceLabel, formatCapabilityDate, type CapabilityGroupResult } from "~/lib/capabilities-client";
import "./capabilities.css";

export function meta() {
  return [{ title: "能力雷达 | TARSGO" }];
}

export default function CapabilitiesRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [groups, setGroups] = useState<CapabilityGroupResult[]>([]);
  const [groupID, setGroupID] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestID = useRef(0);

  useEffect(() => {
    const request = ++requestID.current;
    setLoading(true);
    setError("");
    setGroups([]);
    capabilitiesClient.mine().then((result) => {
      if (requestID.current !== request) return;
      setGroups(result.groups);
      setGroupID(result.groups[0]?.groupId ?? null);
    }).catch((cause: unknown) => {
      if (requestID.current === request) setError(cause instanceof Error ? cause.message : "能力评价暂时无法读取");
    }).finally(() => {
      if (requestID.current === request) setLoading(false);
    });
    return () => { requestID.current++; };
  }, [currentUser.id]);

  const group = groups.find((item) => item.groupId === groupID) ?? null;
  const dimensions = group?.dimensions ?? [];
  const history = dimensions.flatMap((dimension) => (dimension.history ?? []).map((event) => ({ ...event, dimensionName: dimension.name })))
    .sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime());

  return (
    <section className="capabilities-page" aria-labelledby="capabilities-title">
      <header className="capabilities-header">
        <div><h1 id="capabilities-title">能力雷达</h1><p>查看各能力维度结果与成长记录。</p></div>
      </header>
      {error ? <div className="capabilities-alert" role="alert">{error}</div> : null}
      {loading ? <p className="capabilities-state" role="status">正在读取能力评价…</p> : null}
      {!loading && !error && groups.length === 0 ? <div className="capabilities-empty">当前没有可查看的组别能力评价。</div> : null}
      {!loading && !error && groups.length > 0 && group ? <>
        {groups.length > 1 ? <div className="capabilities-tabs" role="group" aria-label="选择组别">
          {groups.map((item) => <button key={item.groupId} type="button" aria-pressed={item.groupId === groupID} onClick={() => setGroupID(item.groupId)}>{item.groupName}</button>)}
        </div> : <p className="capabilities-group-name">{group.groupName}</p>}
        {dimensions.length === 0 ? <div className="capabilities-empty">本组能力维度尚未配置。</div> : <>
          <div className="capabilities-main-grid">
            <section className="capabilities-panel capabilities-radar-panel" aria-labelledby="personal-radar-title">
              <div className="capabilities-panel-heading"><h2 id="personal-radar-title">个人能力</h2><span>0–100</span></div>
              <CapabilityRadar dimensions={dimensions} title={`${group.groupName}个人能力`} />
              <div className="capabilities-score-list">
                {dimensions.map((dimension) => <div className="capabilities-score-row" key={dimension.id}>
                  <div><strong>{dimension.name}</strong>{dimension.description ? <p>{dimension.description}</p> : null}</div>
                  <span>{dimension.score === null ? "暂无评价" : `${formatScore(dimension.score)} 分`}</span>
                  {dimension.score !== null ? <div className="capabilities-progress" aria-label={`${dimension.name} ${formatScore(dimension.score)} 分`}><span style={{ width: `${Math.min(100, Math.max(0, dimension.score))}%` }} /></div> : null}
                </div>)}
              </div>
            </section>
            <section className="capabilities-panel capabilities-history-panel" aria-labelledby="capability-history-title">
              <div className="capabilities-panel-heading"><h2 id="capability-history-title">成长记录</h2></div>
              {history.length === 0 ? <p className="capabilities-muted">完成作业评分或项目评价后，这里会记录成长来源。</p> : <ol className="capabilities-history-list">
                {history.map((event) => <li key={`${event.sourceType}-${event.id}-${event.dimensionName}-${event.evaluatedAt}`}>
                  <span className="capabilities-history-dot" aria-hidden="true" />
                  <div><strong>{event.dimensionName}</strong><p>{capabilitySourceLabel(event.sourceType)} · {event.sourceTitle}</p><time dateTime={event.evaluatedAt}>{formatCapabilityDate(event.evaluatedAt)}</time></div>
                </li>)}
              </ol>}
            </section>
          </div>
          <p className="capabilities-method">已评价的关联来源和管理员补充评价取算术平均；每项作业或项目按最新有效评分计入。</p>
        </>}
      </> : null}
    </section>
  );
}
