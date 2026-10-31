import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useOutletContext, useSearchParams } from "react-router";

import { SkillTreeGraph } from "~/components/skill-tree-graph";
import { WorkbenchFeatureStatus } from "~/components/workbench-feature-status";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { assignmentClient, type Assignment } from "~/lib/assignment-client";
import { layoutSkillTree } from "~/lib/skill-tree-layout";
import { formatSkillDate, skillEvidenceHref, skillEvidenceLabel, skillsClient, skillStateLabel, type SkillGroup, type SkillMember, type SkillNode, type SkillNodeInput } from "~/lib/skills-client";
import "../dashboard/skills.css";

export function meta() {
  return [{ title: "技能路线管理 | TARSGO" }];
}

type FormState = Omit<SkillNodeInput, "groupId">;
const emptyForm: FormState = { name: "", description: "", learningGoal: "", passingCriteria: "", sortOrder: 0 };

export default function SkillRouteManagementRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [groups, setGroups] = useState<SkillGroup[]>([]);
  const [groupID, setGroupID] = useState<number | null>(null);
  const [nodes, setNodes] = useState<SkillNode[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<SkillMember[]>([]);
  const [selectedNodeID, setSelectedNodeID] = useState<number | null>(null);
  const [selectedUserID, setSelectedUserID] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [prerequisiteIDs, setPrerequisiteIDs] = useState<number[]>([]);
  const [assignmentIDs, setAssignmentIDs] = useState<number[]>([]);
  const [evidenceType, setEvidenceType] = useState<"assignment" | "question" | "note">("note");
  const [evidenceID, setEvidenceID] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestID = useRef(0);
  const memberRequestID = useRef(0);
  const currentAccountID = useRef(currentUser.id);
  currentAccountID.current = currentUser.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setGroups([]); setGroupID(null); setNodes([]); setMembers([]); setSelectedNodeID(null); setSelectedUserID(null);
    skillsClient.adminGroups().then((result) => {
      if (cancelled) return;
      setGroups(result);
      const requested = Number(searchParams.get("groupId")) || null;
      setGroupID(result.find((group) => group.id === requested)?.id ?? result[0]?.id ?? null);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "可管理组别加载失败");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentUser.id]);

  useEffect(() => {
    if (!groupID) {
      setNodes([]); setAssignments([]); setMembers([]); setSelectedNodeID(null);
      return;
    }
    const activeRequest = ++requestID.current;
    const userID = currentUser.id;
    setLoading(true); setError(""); setNotice(""); setSelectedUserID(null);
    const selectedGroup = groups.find((group) => group.id === groupID);
    const assignmentRequest = selectedGroup?.name === "运营组"
      ? Promise.resolve([] as Assignment[])
      : assignmentClient.listAdmin(groupID).catch((cause: unknown) => {
        if (requestID.current === activeRequest && currentAccountID.current === userID) {
          setError(cause instanceof Error ? `组内作业暂时无法读取：${cause.message}` : "组内作业暂时无法读取");
        }
        return [] as Assignment[];
      });
    Promise.all([skillsClient.adminNodes(groupID), assignmentRequest]).then(([nextNodes, nextAssignments]) => {
      if (requestID.current !== activeRequest || currentAccountID.current !== userID) return;
      setNodes(nextNodes); setAssignments(nextAssignments);
      const requestedNode = Number(searchParams.get("nodeId")) || null;
      setSelectedNodeID(nextNodes.some((node) => node.id === requestedNode) ? requestedNode : nextNodes.find((node) => node.active)?.id ?? nextNodes[0]?.id ?? null);
    }).catch((cause: unknown) => {
      if (requestID.current === activeRequest && currentAccountID.current === userID) setError(cause instanceof Error ? cause.message : "技能路线加载失败");
    }).finally(() => {
      if (requestID.current === activeRequest && currentAccountID.current === userID) setLoading(false);
    });
    return () => { requestID.current++; };
  }, [groupID, currentUser.id, groups]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeID) ?? null;
  const selectedMember = members.find((member) => member.userId === selectedUserID) ?? null;
  const activeNodes = useMemo(() => nodes.filter((node) => node.active), [nodes]);

  useEffect(() => {
    setForm(selectedNode ? {
      name: selectedNode.name,
      description: selectedNode.description,
      learningGoal: selectedNode.learningGoal,
      passingCriteria: selectedNode.passingCriteria,
      sortOrder: selectedNode.sortOrder,
    } : emptyForm);
    setPrerequisiteIDs(selectedNode?.prerequisiteIds ?? []);
    setAssignmentIDs(selectedNode?.assignmentIds ?? []);
    setMembers([]); setSelectedUserID(null);
  }, [selectedNodeID, groupID]);

  useEffect(() => {
    if (!groupID || !selectedNodeID) { setMembers([]); return; }
    const activeRequest = ++memberRequestID.current;
    skillsClient.members(groupID, selectedNodeID).then((result) => {
      if (memberRequestID.current !== activeRequest) return;
      setMembers(result);
      setSelectedUserID((previous) => result.some((item) => item.userId === previous) ? previous : null);
    }).catch((cause: unknown) => {
      if (memberRequestID.current === activeRequest) setError(cause instanceof Error ? cause.message : "组内技能进度读取失败");
    });
    return () => { memberRequestID.current++; };
  }, [groupID, selectedNodeID, currentUser.id]);

  function selectGroup(id: number) {
    setGroupID(id);
    setNodes([]); setAssignments([]); setMembers([]); setSelectedNodeID(null); setSelectedUserID(null);
    setSearchParams((params) => { params.set("groupId", String(id)); params.delete("nodeId"); return params; }, { replace: true });
  }

  function selectNode(node: SkillNode) {
    setSelectedNodeID(node.id);
    setSearchParams((params) => { if (groupID) params.set("groupId", String(groupID)); params.set("nodeId", String(node.id)); return params; }, { replace: true });
  }

  function startNewNode() {
    setSelectedNodeID(null); setSelectedUserID(null); setForm(emptyForm); setPrerequisiteIDs([]); setAssignmentIDs([]); setNotice("");
    setSearchParams((params) => { if (groupID) params.set("groupId", String(groupID)); params.delete("nodeId"); return params; }, { replace: true });
  }

  async function saveNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupID || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const input: SkillNodeInput = { groupId: groupID, ...form, sortOrder: Math.max(0, Number(form.sortOrder) || 0) };
      const saved = selectedNodeID ? await skillsClient.update(selectedNodeID, input) : await skillsClient.create(input);
      await skillsClient.setPrerequisites(saved.id, prerequisiteIDs.filter((id) => id !== saved.id));
      await skillsClient.setAssignments(saved.id, assignmentIDs);
      const result = await skillsClient.adminNodes(groupID);
      setNodes(result); setSelectedNodeID(saved.id); setNotice("技能路线配置已保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "技能配置保存失败");
    } finally { setSaving(false); }
  }

  async function toggleActive() {
    if (!selectedNode || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await skillsClient.setActive(selectedNode.id, !selectedNode.active);
      const result = await skillsClient.adminNodes(groupID!);
      setNodes(result); setNotice(selectedNode.active ? "技能节点已停用，历史记录保留。" : "技能节点已重新启用。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "技能状态更新失败"); }
    finally { setSaving(false); }
  }

  async function deleteNode() {
    if (!selectedNode || !selectedNode.canDelete || saving) return;
    if (!window.confirm(`确定删除「${selectedNode.name}」及其前置和作业配置？该操作不可撤销。`)) return;
    const removedID = selectedNode.id;
    setSaving(true); setError(""); setNotice("");
    try {
      await skillsClient.deleteNode(removedID);
      const result = await skillsClient.adminNodes(groupID!);
      setNodes(result);
      const next = result.find((item) => item.active) ?? result[0] ?? null;
      setSelectedNodeID(next?.id ?? null);
      setSearchParams((params) => { if (groupID) params.set("groupId", String(groupID)); if (next) params.set("nodeId", String(next.id)); else params.delete("nodeId"); return params; }, { replace: true });
      setNotice("节点及其配置关联已删除。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除技能节点失败"); }
    finally { setSaving(false); }
  }

  async function autoArrangeLayout() {
    if (!groupID || nodes.length < 2 || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const layout = layoutSkillTree(nodes, { autoArrange: true });
      const layerOrder = new Map<number, number>();
      const orders = [...layout.positions]
        .sort((a, b) => a.depth - b.depth || a.y - b.y || a.id - b.id)
        .map((position) => {
          const sortOrder = layerOrder.get(position.depth) ?? 0;
          layerOrder.set(position.depth, sortOrder + 1);
          return { nodeId: position.id, sortOrder };
        });
      await skillsClient.reorderLayout(groupID, orders);
      setNodes(await skillsClient.adminNodes(groupID));
      setNotice("路线已按依赖关系自动整理；前置条件未变更。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "自动整理路线失败"); }
    finally { setSaving(false); }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedNode || !selectedMember || saving) return;
    const action = selectedMember.state === "mastered" ? "revoked" : "mastered";
    const numericEvidence = Number(evidenceID) || undefined;
    setSaving(true); setError(""); setNotice("");
    try {
      await skillsClient.review(selectedNode.id, selectedMember.userId, {
        action,
        evidenceType,
        evidenceId: evidenceType === "note" ? undefined : numericEvidence,
        evidenceNote: evidenceNote.trim(),
      });
      const result = await skillsClient.members(groupID!, selectedNode.id);
      setMembers(result); setNotice(action === "mastered" ? "掌握确认已记录。" : "撤销记录已追加，原审核历史保留。");
      setEvidenceID(""); setEvidenceNote("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "技能审核提交失败"); }
    finally { setSaving(false); }
  }

  const selectedUserEvent = selectedMember?.reviewHistory?.at(-1);
  const currentReviewAction = selectedUserEvent?.action;

  return (
    <section className="skills-page admin-design" aria-labelledby="skill-admin-title">
      <header className="skills-hero">
        <div className="skills-hero__copy"><p className="skills-hero__eyebrow">TARS BASE <span aria-hidden="true">·</span> ROUTE CONTROL</p><div className="skills-hero__title-row"><h1 id="skill-admin-title">技能路线管理</h1><WorkbenchFeatureStatus feature="skills" /></div><p>在本组逐步建立学习目标与验收标准。技能确认和撤销都会留下审核依据。</p></div>
        <div className="skills-hero__signal"><span>CONTROL DECK</span><strong>{String(nodes.filter((node) => node.active).length).padStart(2, "0")}</strong><small>启用节点</small></div>
      </header>
      {error ? <div role="alert" className="skills-alert">{error}</div> : null}
      {notice ? <p role="status" className="skills-success">{notice}</p> : null}
      {loading && groups.length === 0 ? <p role="status" className="py-8 text-sm text-[var(--admin-muted)]">正在读取可管理组别…</p> : null}
      {!loading && !error && groups.length === 0 ? <section className="skills-empty mt-4"><span className="skills-empty__mark" aria-hidden="true">⌁</span><h2>没有可管理的技能路线</h2><p>普通管理员需先拥有有效组别归属；超级管理员可管理全部已启用组别。</p></section> : null}
      {groups.length > 0 ? <>
        <div className="skills-toolbar"><div><h2>成长路线</h2></div><div className="skills-group-tabs" aria-label="选择要管理的组别">{groups.map((group) => <button key={group.id} type="button" aria-pressed={group.id === groupID} onClick={() => selectGroup(group.id)}>{group.name}</button>)}</div></div>
        {selectedNode ? <div className="skills-admin-layout">
          <div className="skills-admin-left">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="skills-kicker">ROUTE MAP · {nodes.length} NODES</p><button type="button" className="skills-primary-button" onClick={startNewNode}>＋ 新建技能节点</button></div>
            {nodes.length > 0 ? <SkillTreeGraph nodes={nodes} selectedID={selectedNodeID} onSelect={selectNode} onAutoArrange={autoArrangeLayout} /> : <section className="skills-empty"><span className="skills-empty__mark" aria-hidden="true">＋</span><h2>路线尚未建立</h2><p>先创建第一个技能节点，再根据本组实际标准补充前置关系。</p></section>}
            <NodeEditor
              groupID={groupID!}
              node={selectedNode}
              form={form}
              setForm={setForm}
              nodes={activeNodes}
              prerequisiteIDs={prerequisiteIDs}
              setPrerequisiteIDs={setPrerequisiteIDs}
              assignments={assignments}
              assignmentIDs={assignmentIDs}
              setAssignmentIDs={setAssignmentIDs}
              saving={saving}
              onSave={saveNode}
              onToggleActive={toggleActive}
              onDelete={deleteNode}
            />
          </div>
          <aside className="skills-admin-right">
            {selectedNode ? <MembersPanel
              groupID={groupID!}
              members={members}
              selectedUserID={selectedUserID}
              setSelectedUserID={setSelectedUserID}
              selectedMember={selectedMember}
              currentReviewAction={currentReviewAction}
              evidenceType={evidenceType}
              setEvidenceType={setEvidenceType}
              evidenceID={evidenceID}
              setEvidenceID={setEvidenceID}
              evidenceNote={evidenceNote}
              setEvidenceNote={setEvidenceNote}
              saving={saving}
              onSubmit={submitReview}
            /> : null}
          </aside>
        </div> : !loading && groupID ? <section className="skills-empty"><span className="skills-empty__mark" aria-hidden="true">＋</span><h2>先创建技能路线</h2><p>添加首个节点后，即可编辑依赖、关联训练作业并审核组员成果。</p><button type="button" className="skills-primary-button mt-4" onClick={startNewNode}>新建技能节点</button><NodeEditor
          groupID={groupID}
          node={null}
          form={form}
          setForm={setForm}
          nodes={activeNodes}
          prerequisiteIDs={prerequisiteIDs}
          setPrerequisiteIDs={setPrerequisiteIDs}
          assignments={assignments}
          assignmentIDs={assignmentIDs}
          setAssignmentIDs={setAssignmentIDs}
          saving={saving}
          onSave={saveNode}
          onToggleActive={toggleActive}
          onDelete={deleteNode}
        /></section> : null}
      </> : null}
    </section>
  );
}

function NodeEditor({
  groupID, node, form, setForm, nodes, prerequisiteIDs, setPrerequisiteIDs,
  assignments, assignmentIDs, setAssignmentIDs, saving, onSave, onToggleActive, onDelete,
}: {
  groupID: number;
  node: SkillNode | null;
  form: FormState;
  setForm: (value: FormState) => void;
  nodes: SkillNode[];
  prerequisiteIDs: number[];
  setPrerequisiteIDs: (value: number[]) => void;
  assignments: Assignment[];
  assignmentIDs: number[];
  setAssignmentIDs: (value: number[]) => void;
  saving: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const textField = (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [field]: event.target.value });
  return (
    <section className="skills-editor-panel" aria-labelledby="skill-editor-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="skill-editor-title">{node ? "节点配置" : "新建技能节点"}</h2>{node ? <div className="flex flex-wrap gap-2"><button type="button" className="admin-button admin-button--secondary" onClick={onToggleActive} disabled={saving}>{node.active ? "停用节点" : "重新启用"}</button><button type="button" className="admin-button admin-button--quiet text-[var(--admin-danger)]" onClick={onDelete} disabled={saving || !node.canDelete} title={node.deleteBlockReason || "删除节点及其配置关联"}>删除节点</button></div> : null}</div>
      {node && !node.canDelete ? <p className="mt-2 text-xs text-[var(--admin-muted)]">此节点{node.deleteBlockReason || "有受保护的记录"}，暂不能删除。若被其他节点依赖，请先在该节点中取消前置关联。</p> : null}
      <form className="skills-editor-grid" onSubmit={onSave}>
        <label className="admin-field-group"><span>技能名称</span><input className="admin-field" maxLength={100} required value={form.name} onChange={textField("name")} placeholder="填写本组确认的技能名称" /></label>
        <label className="admin-field-group"><span>同层排列顺序</span><input className="admin-field" type="number" min={0} max={100000} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /><small className="text-xs text-[var(--admin-muted)]">路线默认按前置关系自动排版；此值只微调同层节点位置，也可使用「自动整理布局」。</small></label>
        <label className="admin-field-group wide"><span>节点说明</span><textarea className="admin-field min-h-20" maxLength={5000} value={form.description} onChange={textField("description")} /></label>
        <label className="admin-field-group wide"><span>学习目标</span><textarea className="admin-field min-h-20" maxLength={5000} required value={form.learningGoal} onChange={textField("learningGoal")} placeholder="说明成员完成学习后应能够做到什么" /></label>
        <label className="admin-field-group wide"><span>通过标准</span><textarea className="admin-field min-h-20" maxLength={5000} required value={form.passingCriteria} onChange={textField("passingCriteria")} placeholder="由本组管理员按真实训练要求定义" /></label>
        <fieldset className="admin-field-group wide"><legend>前置技能</legend><div className="skills-check-list">{nodes.filter((item) => item.id !== node?.id).length === 0 ? <span className="text-xs text-[var(--admin-muted)]">暂无其他启用节点</span> : nodes.filter((item) => item.id !== node?.id).map((item) => <label key={item.id}><input type="checkbox" checked={prerequisiteIDs.includes(item.id)} onChange={(event) => setPrerequisiteIDs(event.target.checked ? [...prerequisiteIDs, item.id] : prerequisiteIDs.filter((id) => id !== item.id))} /><span>{item.name}</span></label>)}</div></fieldset>
        <fieldset className="admin-field-group wide"><legend>关联本组训练作业</legend><div className="skills-check-list">{assignments.length === 0 ? <span className="text-xs text-[var(--admin-muted)]">当前没有可关联的组内作业</span> : assignments.map((item) => <label key={item.id}><input type="checkbox" checked={assignmentIDs.includes(item.id)} onChange={(event) => setAssignmentIDs(event.target.checked ? [...assignmentIDs, item.id] : assignmentIDs.filter((id) => id !== item.id))} /><span>{item.title}</span></label>)}</div></fieldset>
          <div className="wide flex justify-end"><button type="submit" className="skills-primary-button" disabled={saving}>{saving ? "保存中…" : "保存节点配置"}</button></div>
      </form>
    </section>
  );
}

function MembersPanel({
  groupID, members, selectedUserID, setSelectedUserID, selectedMember, currentReviewAction,
  evidenceType, setEvidenceType, evidenceID, setEvidenceID, evidenceNote, setEvidenceNote,
  saving, onSubmit,
}: {
  groupID: number;
  members: SkillMember[];
  selectedUserID: number | null;
  setSelectedUserID: (value: number | null) => void;
  selectedMember: SkillMember | null;
  currentReviewAction?: "mastered" | "revoked";
  evidenceType: "assignment" | "question" | "note";
  setEvidenceType: (value: "assignment" | "question" | "note") => void;
  evidenceID: string;
  setEvidenceID: (value: string) => void;
  evidenceNote: string;
  setEvidenceNote: (value: string) => void;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="skills-admin-members" aria-labelledby="skill-member-panel-title">
      <p className="skills-kicker">MEMBER REVIEW</p><h2 id="skill-member-panel-title" className="mt-1">组内挑战记录</h2>
      {members.length === 0 ? <p className="mt-3 text-xs text-[var(--admin-muted)]">暂无启用成员。</p> : <div className="skills-admin-members__list">
        {members.map((member) => <button key={member.userId} type="button" className="skills-admin-members__row" aria-pressed={selectedUserID === member.userId} onClick={() => setSelectedUserID(member.userId)}><strong>{member.displayName} · #{member.userId}</strong><span>{member.startedAt && member.state !== "mastered" ? `挑战中 · ${skillStateLabel(member.state)}` : skillStateLabel(member.state)}</span></button>)}
      </div>}
      {selectedMember ? <>
        <div className="skills-admin-review__history" aria-label="该成员技能确认历史">{(selectedMember.reviewHistory ?? []).map((event) => {
          const href = skillEvidenceHref(event, groupID, true);
          return <p key={event.id}>
            <strong>{event.action === "mastered" ? "确认掌握" : "撤销确认"} · {formatSkillDate(event.createdAt)}</strong><br />
            <span>{event.action === "mastered" ? "确认人" : "撤销人"}：{event.actorName || `账号 #${event.actorId}`}</span><br />
            <span>{event.evidenceNote || skillEvidenceLabel(event)}</span>
            {href ? <><br /><a href={href}>查看原始记录 ↗</a></> : null}
          </p>;
        })}</div>
        <form className="skills-admin-review" onSubmit={onSubmit}>
          <div className="skills-admin-review__header"><strong className="text-xs text-[var(--admin-text)]">{currentReviewAction === "mastered" ? "追加撤销记录" : "审核掌握能力"}</strong><span>成员 #{selectedMember.userId}</span></div>
          <label className="admin-field-group"><span>审核依据类型</span><select className="admin-field" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as "assignment" | "question" | "note")}><option value="note">实操 / 成果说明</option><option value="assignment">已通过的关联作业</option><option value="question">本人参与的答疑</option></select></label>
          {evidenceType !== "note" ? <label className="admin-field-group"><span>{evidenceType === "assignment" ? "作业编号" : "答疑编号"}</span><input className="admin-field" type="number" min={1} required value={evidenceID} onChange={(event) => setEvidenceID(event.target.value)} /></label> : null}
          <label className="admin-field-group"><span>{currentReviewAction === "mastered" ? "撤销原因" : "依据摘要"}</span><textarea className="admin-field min-h-20" maxLength={2000} required={currentReviewAction === "mastered" || evidenceType === "note"} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="记录实际验收依据；不复制存储原始作业或答疑内容" /></label>
          <button type="submit" className="skills-primary-button" disabled={saving}>{saving ? "提交中…" : currentReviewAction === "mastered" ? "追加撤销记录" : "确认技能掌握"}</button>
        </form>
      </> : null}
    </section>
  );
}
