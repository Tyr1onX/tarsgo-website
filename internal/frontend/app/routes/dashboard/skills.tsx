import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";

import { SkillTreeGraph } from "~/components/skill-tree-graph";
import { WorkbenchFeatureStatus } from "~/components/workbench-feature-status";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { assignmentClient, type Assignment } from "~/lib/assignment-client";
import { formatSkillDate, skillEvidenceHref, skillEvidenceLabel, skillsClient, skillStateLabel, type SkillGroupProgress, type SkillNode } from "~/lib/skills-client";
import "./skills.css";

export function meta() {
  return [{ title: "技能树 | TARSGO" }];
}

export default function SkillsRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [groups, setGroups] = useState<SkillGroupProgress[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedGroupID, setSelectedGroupID] = useState<number | null>(null);
  const [selectedNodeID, setSelectedNodeID] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const requestID = useRef(0);
  const accountID = useRef(currentUser.id);
  accountID.current = currentUser.id;

  useEffect(() => {
    const activeRequest = ++requestID.current;
    const userID = currentUser.id;
    setLoading(true);
    setError("");
    setGroups([]);
    setAssignments([]);
    Promise.all([
      skillsClient.listMine(),
      assignmentClient.listMine().catch(() => [] as Assignment[]),
    ]).then(([result, memberAssignments]) => {
      if (requestID.current !== activeRequest || accountID.current !== userID) return;
      setGroups(result.groups);
      setAssignments(memberAssignments);
      const requestedGroup = Number(searchParams.get("groupId")) || null;
      const group = result.groups.find((item) => item.id === requestedGroup) ?? result.groups[0];
      setSelectedGroupID(group?.id ?? null);
      const requestedNode = Number(searchParams.get("nodeId")) || null;
      setSelectedNodeID(group?.nodes.some((node) => node.id === requestedNode) ? requestedNode : group?.nodes[0]?.id ?? null);
    }).catch((cause: unknown) => {
      if (requestID.current === activeRequest && accountID.current === userID) {
        setError(cause instanceof Error ? cause.message : "技能路线加载失败");
      }
    }).finally(() => {
      if (requestID.current === activeRequest && accountID.current === userID) setLoading(false);
    });
    return () => { requestID.current++; };
  }, [currentUser.id]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupID) ?? null;
  const nodes = selectedGroup?.nodes ?? [];
  const selectedNode = nodes.find((node) => node.id === selectedNodeID) ?? null;
  const nodeByID = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const assignmentByID = useMemo(() => new Map(assignments.map((item) => [item.id, item])), [assignments]);
  const masteredCount = groups.reduce((sum, group) => sum + group.nodes.filter((node) => node.state === "mastered").length, 0);
  const activeChallenges = groups.reduce((sum, group) => sum + group.nodes.filter((node) => Boolean(node.startedAt) && node.state !== "mastered").length, 0);

  function selectGroup(group: SkillGroupProgress) {
    setSelectedGroupID(group.id);
    setSelectedNodeID(group.nodes[0]?.id ?? null);
    setSearchParams((params) => {
      params.set("groupId", String(group.id));
      if (group.nodes[0]) params.set("nodeId", String(group.nodes[0].id));
      else params.delete("nodeId");
      return params;
    }, { replace: true });
  }

  function selectNode(node: SkillNode) {
    setSelectedNodeID(node.id);
    setSearchParams((params) => {
      if (selectedGroup) params.set("groupId", String(selectedGroup.id));
      params.set("nodeId", String(node.id));
      return params;
    }, { replace: true });
  }

  async function startChallenge() {
    if (!selectedNode || starting) return;
    setStarting(true);
    setError("");
    try {
      await skillsClient.start(selectedNode.id);
      const result = await skillsClient.listMine();
      setGroups(result.groups);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "开始挑战失败");
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="skills-page admin-design" aria-labelledby="skills-page-title">
      <header className="skills-hero">
        <div className="skills-hero__copy">
          <p className="skills-hero__eyebrow">TARS BASE <span aria-hidden="true">·</span> SKILL ROUTE</p>
          <div className="skills-hero__title-row"><h1 id="skills-page-title">技能树</h1><WorkbenchFeatureStatus feature="skills" /></div>
          <p>沿着组内路线探索。作业通过可以留下实践记录，技能掌握由本组管理员依据成果确认。</p>
        </div>
        <div className="skills-hero__signal" aria-label={`已掌握 ${masteredCount} 项，正在挑战 ${activeChallenges} 项`}>
          <span>FIELD STATUS</span><strong>{String(masteredCount).padStart(2, "0")}</strong><small>已确认掌握</small>
        </div>
      </header>

      {error ? <div role="alert" className="skills-alert">{error}</div> : null}
      {loading ? <p role="status" className="py-8 text-sm text-[var(--admin-muted)]">正在同步技能路线…</p> : null}
      {!loading && !error && groups.length === 0 ? (
        <section className="skills-empty mt-4">
          <span className="skills-empty__mark" aria-hidden="true">⌁</span>
          <h2>你的路线正在等待组别信标</h2>
          <p>技能路线待配置。各组确认正式技能节点、培养目标和考核标准后，会在这里显示对应路线。</p>
          {currentUser.role.name === "admin" || currentUser.role.name === "super_admin" ? <Link className="skills-admin-link" to="/dashboard/admin/training/skills">前往配置组内路线 <span aria-hidden="true">↗</span></Link> : null}
        </section>
      ) : null}
      {!loading && groups.length > 0 ? <>
        <div className="skills-toolbar">
          <div><h2>成长路线</h2><p>{activeChallenges} 项正在挑战</p></div>
          <div className="skills-group-tabs" aria-label="切换所属组别">
            {groups.map((group) => <button key={group.id} type="button" aria-pressed={group.id === selectedGroupID} onClick={() => selectGroup(group)}>{group.name}</button>)}
          </div>
        </div>
        {selectedGroup && nodes.length === 0 ? (
          <section className="skills-empty"><span className="skills-empty__mark" aria-hidden="true">＋</span><h2>{selectedGroup.name}路线尚未配置</h2><p>管理员确认学习目标和通过标准后，技能节点会出现在这里。</p></section>
        ) : selectedGroup ? (
          <div className="skills-route-layout">
            <SkillTreeGraph nodes={nodes} selectedID={selectedNodeID} onSelect={selectNode} />
            <SkillDetail node={selectedNode} groupID={selectedGroup.id} nodeByID={nodeByID} assignmentByID={assignmentByID} onStart={startChallenge} starting={starting} />
          </div>
        ) : null}
      </> : null}
      {!loading && groups.some((group) => group.nodes.length > 0) ? <p className="sr-only" aria-live="polite">路线已加载。</p> : null}
    </section>
  );
}

function SkillDetail({
  node,
  groupID,
  nodeByID,
  assignmentByID,
  onStart,
  starting,
}: {
  node: SkillNode | null;
  groupID: number;
  nodeByID: Map<number, SkillNode>;
  assignmentByID: Map<number, Assignment>;
  onStart: () => void;
  starting: boolean;
}) {
  if (!node) return <aside className="skill-detail-panel"><p className="skills-kicker">NODE DETAIL</p><p className="skill-detail-panel__copy">选择一项技能节点查看详情。</p></aside>;
  const state = node.state ?? "available";
  const isInProgress = Boolean(node.startedAt) && state === "available";
  const history = node.reviewHistory ?? [];
  const currentMastery = [...history].reverse().find((event) => event.action === "mastered" || event.action === "revoked");
  const canStart = node.active && state !== "locked" && state !== "mastered" && !node.startedAt;

  return (
    <aside className="skill-detail-panel" aria-labelledby="skill-detail-title">
      <div className="skill-detail-panel__top">
        <div><p className="skills-kicker">NODE {String(node.sortOrder + 1).padStart(2, "0")}</p><h2 id="skill-detail-title">{node.name}</h2></div>
        <span className={`skill-status-pill skill-status-pill--${state}`}>{!node.active ? "已停用" : isInProgress ? "正在学习" : skillStateLabel(state)}</span>
      </div>
      {node.description ? <p className="skill-detail-panel__copy">{node.description}</p> : null}
      <dl>
        <div><dt>学习目标</dt><dd>{node.learningGoal || "尚未填写"}</dd></div>
        <div><dt>通过标准</dt><dd>{node.passingCriteria || "尚未填写"}</dd></div>
        <div>
          <dt>前置技能</dt>
          <dd>{node.prerequisiteIds.length === 0 ? "路线起点" : node.prerequisiteIds.map((id) => nodeByID.get(id)?.name).filter(Boolean).join("、") || "前置节点已停用"}</dd>
        </div>
        {node.assignmentIds.length > 0 ? <div><dt>关联训练作业</dt><dd className="skill-detail-panel__links">
          {node.assignmentIds.map((id) => assignmentByID.get(id)).filter((item): item is Assignment => Boolean(item)).map((item) => <Link key={item.id} to={`/dashboard/assignments?assignmentId=${item.id}`}>{item.title} <span aria-hidden="true">↗</span></Link>)}
          {!node.assignmentIds.some((id) => assignmentByID.has(id)) ? <span>暂无分配给你的关联作业</span> : null}
        </dd></div> : null}
        {node.startedAt ? <div><dt>开始挑战</dt><dd>{formatSkillDate(node.startedAt)}</dd></div> : null}
      </dl>
      {currentMastery ? <div className="skill-evidence-list" aria-label="技能审核历史">
        <p className="skills-kicker">REVIEW HISTORY</p>
        <ul>{history.map((event) => {
          const href = skillEvidenceHref(event, groupID);
          return <li key={event.id}>
            <strong>{event.action === "mastered" ? "已确认掌握" : "确认已撤销"} · {formatSkillDate(event.createdAt)}</strong>
            <span>{event.action === "mastered" ? "确认人" : "撤销人"}：{event.actorName || `账号 #${event.actorId}`}</span>
            <span>{event.evidenceNote || skillEvidenceLabel(event)}</span>
            {href ? <Link to={href}>查看原始记录 <span aria-hidden="true">↗</span></Link> : null}
          </li>;
        })}</ul>
      </div> : null}
      {canStart ? <div className="skill-detail-panel__action"><button className="skill-action-button" type="button" onClick={onStart} disabled={starting}>{starting ? "正在启动…" : state === "practiced" ? "继续挑战" : "开始挑战"}</button></div> : null}
      {state === "locked" ? <p className="skill-detail-panel__copy">完成并通过前置技能后，这个节点会变为可挑战。</p> : null}
      {state === "mastered" ? <p className="skill-detail-panel__copy">该技能已由管理员确认掌握。确认依据和历史保留在本档案中。</p> : null}
    </aside>
  );
}
