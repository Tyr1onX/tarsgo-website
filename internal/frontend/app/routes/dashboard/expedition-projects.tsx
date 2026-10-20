import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useOutletContext, useSearchParams } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { ApiError } from "~/lib/api-client";
import { expeditionEventLabel, expeditionEvolutionTargetLabel, expeditionMilestoneStateLabel, expeditionProjectClient, formatExpeditionDate, type ExpeditionEvolutionTarget, type ExpeditionGroupMemberOption, type ExpeditionProject, type ExpeditionProjectInput, type ExpeditionProjectMilestone } from "~/lib/expedition-project-client";
import { skillsClient, type SkillGroup } from "~/lib/skills-client";
import "./expedition-projects.css";

export function meta() {
  return [{ title: "赛季协作 | TARSGO" }];
}

interface MilestoneDraft {
  groupId: string;
  participantIDs: string[];
  name: string;
  criteria: string;
  evolutionTarget: ExpeditionEvolutionTarget | "";
  dueAt: string;
}

const emptyMilestone = (): MilestoneDraft => ({ groupId: "", participantIDs: [], name: "", criteria: "", evolutionTarget: "", dueAt: "" });

const GROUP_EVOLUTION_TARGET: Record<string, ExpeditionEvolutionTarget> = {
  "机械组": "chassis",
  "电控组": "control",
  "视觉组": "perception",
  "AI组": "decision",
  "运营组": "operations",
};

export function ExpeditionProjectsRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdminView = location.pathname.startsWith("/dashboard/admin/");
  const isSuperAdmin = currentUser.role.name === "super_admin";
  const isManager = isSuperAdmin || currentUser.role.name === "admin";
  const [projects, setProjects] = useState<ExpeditionProject[]>([]);
  const [groups, setGroups] = useState<SkillGroup[]>([]);
  const [membersByGroup, setMembersByGroup] = useState<Record<number, { items: ExpeditionGroupMemberOption[]; error: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [draft, setDraft] = useState({ title: "", objective: "", visibility: "team" as "team" | "participants", milestones: [emptyMilestone(), emptyMilestone()], finalName: "联合成果验收", finalCriteria: "", finalEvolutionTarget: "" as "" | "joint" });
  const [evidence, setEvidence] = useState<Record<number, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const selectedProjectId = Number(searchParams.get("projectId")) || 0;
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const projectRequest = (isAdminView ? expeditionProjectClient.listAdmin() : expeditionProjectClient.listMine())
      .then((value) => ({ value, error: "" }))
      .catch((cause: unknown) => ({ value: [] as ExpeditionProject[], error: cause instanceof ApiError ? cause.message : "协作项目暂时无法读取。" }));
    const groupRequest = isManager
      ? skillsClient.adminGroups().then((value) => ({ value, error: "" })).catch(() => ({ value: [] as SkillGroup[], error: "" }))
      : Promise.resolve({ value: [] as SkillGroup[], error: "" });
    void Promise.all([projectRequest, groupRequest]).then(([projectResult, groupResult]) => {
      if (!active) return;
      setProjects(projectResult.value);
      setGroups(groupResult.value);
      setError(projectResult.error);
      setLoading(false);
    });
    return () => { active = false; };
  }, [isAdminView, isManager, currentUser.id, refreshKey]);

  const selectedGroupIDs = [...new Set(draft.milestones.map((milestone) => Number(milestone.groupId)).filter(Boolean))].join(",");
  useEffect(() => {
    if (!isSuperAdmin || !selectedGroupIDs) return;
    let active = true;
    for (const groupID of selectedGroupIDs.split(",").map(Number)) {
      if (membersByGroup[groupID]) continue;
      setMembersByGroup((current) => ({ ...current, [groupID]: { items: [], error: false } }));
      void expeditionProjectClient.groupMembers(groupID).then((items) => {
        if (active) setMembersByGroup((current) => ({ ...current, [groupID]: { items, error: false } }));
      }).catch(() => {
        if (active) setMembersByGroup((current) => ({ ...current, [groupID]: { items: [], error: true } }));
      });
    }
    return () => { active = false; };
  }, [isSuperAdmin, selectedGroupIDs]);

  useEffect(() => {
    if (!selectedProject && selectedProjectId) {
      const next = new URLSearchParams(searchParams);
      next.delete("projectId");
      setSearchParams(next, { replace: true });
    } else if (!selectedProjectId && projects[0]) {
      const next = new URLSearchParams(searchParams);
      next.set("projectId", String(projects[0].id));
      setSearchParams(next, { replace: true });
    }
  }, [projects, searchParams, selectedProject, selectedProjectId, setSearchParams]);

  const groupOptions = useMemo(() => groups.filter((group) => ["机械组", "电控组", "视觉组", "AI组", "运营组"].includes(group.name)), [groups]);
  const selectProject = (projectId: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("projectId", String(projectId));
    setSearchParams(next);
  };

  const updateMilestone = (index: number, key: keyof MilestoneDraft, value: string) => {
    setDraft((current) => ({ ...current, milestones: current.milestones.map((milestone, itemIndex) => itemIndex === index ? { ...milestone, [key]: value, ...(key === "groupId" ? { participantIDs: [], evolutionTarget: "" } : {}) } : milestone) }));
  };

  const toggleMilestoneParticipant = (index: number, userID: number, checked: boolean) => {
    setDraft((current) => ({ ...current, milestones: current.milestones.map((milestone, itemIndex) => {
      if (itemIndex !== index) return milestone;
      const currentIDs = new Set(milestone.participantIDs);
      if (checked) currentIDs.add(String(userID)); else currentIDs.delete(String(userID));
      return { ...milestone, participantIDs: [...currentIDs] };
    }) }));
  };

  const refresh = () => setRefreshKey((value) => value + 1);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSuperAdmin) return;
    const input: ExpeditionProjectInput = {
      title: draft.title,
      objective: draft.objective,
      visibility: draft.visibility,
      milestones: [
        ...draft.milestones.map((milestone) => ({ groupId: Number(milestone.groupId), name: milestone.name, criteria: milestone.criteria, ...(milestone.evolutionTarget ? { evolutionTarget: milestone.evolutionTarget } : {}), ...(milestone.dueAt ? { dueAt: new Date(milestone.dueAt).toISOString() } : {}) })),
        { groupId: null, name: draft.finalName, criteria: draft.finalCriteria, ...(draft.finalEvolutionTarget ? { evolutionTarget: draft.finalEvolutionTarget } : {}) },
      ],
      participants: draft.milestones.flatMap((milestone) => milestone.participantIDs.map((userID) => ({ groupId: Number(milestone.groupId), userId: Number(userID) }))),
    };
    const participatingGroupIDs = [...new Set(input.milestones.slice(0, -1).map((milestone) => milestone.groupId).filter((groupId): groupId is number => Boolean(groupId)))];
    if (input.milestones.slice(0, -1).some((milestone) => !milestone.groupId || !milestone.name.trim() || !milestone.criteria.trim()) || !draft.finalName.trim() || !draft.finalCriteria.trim()) {
      setError("请补全各组阶段与联合验收标准。");
      return;
    }
    if (participatingGroupIDs.some((groupID) => !input.participants.some((participant) => participant.groupId === groupID))) {
      setError("请为每个参与组至少指定一名成员。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await expeditionProjectClient.create(input);
      setProjects((items) => [created, ...items]);
      setDraft({ title: "", objective: "", visibility: "team", milestones: [emptyMilestone(), emptyMilestone()], finalName: "联合成果验收", finalCriteria: "", finalEvolutionTarget: "" });
      selectProject(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "协作项目创建失败。");
    } finally {
      setSaving(false);
    }
  };

  const submitEvidence = async (milestone: ExpeditionProjectMilestone) => {
    const content = evidence[milestone.id]?.trim();
    if (!selectedProject || !content) return;
    setSaving(true);
    setError("");
    try {
      const updated = await expeditionProjectClient.submitEvidence(milestone.id, content);
      setProjects((items) => items.map((project) => project.id === updated.id ? updated : project));
      setEvidence((items) => ({ ...items, [milestone.id]: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "成果提交失败。");
    } finally {
      setSaving(false);
    }
  };

  const reviewMilestone = async (milestone: ExpeditionProjectMilestone, action: "accept" | "revoke") => {
    const content = reviewNotes[milestone.id]?.trim();
    if (!content) {
      setError(action === "accept" ? "请填写验收依据。" : "请填写撤销原因。" );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await expeditionProjectClient.review(milestone.id, action, content);
      setProjects((items) => items.map((project) => project.id === updated.id ? updated : project));
      setReviewNotes((items) => ({ ...items, [milestone.id]: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验收状态更新失败。");
    } finally {
      setSaving(false);
    }
  };

  const addMilestone = () => {
    if (draft.milestones.length < 10) setDraft((current) => ({ ...current, milestones: [...current.milestones, emptyMilestone()] }));
  };

  const removeMilestone = (index: number) => {
    if (draft.milestones.length > 2) setDraft((current) => ({ ...current, milestones: current.milestones.filter((_, itemIndex) => itemIndex !== index) }));
  };

  const groupMilestonesAccepted = (project: ExpeditionProject) => project.milestones.filter((milestone) => milestone.groupId).every((milestone) => milestone.state === "accepted");

  return (
    <section className="expedition-projects admin-design" aria-labelledby="expedition-projects-title">
      <header className="expedition-projects__header">
        <div><p className="expedition-eyebrow">SEASON COLLABORATION</p><h1 id="expedition-projects-title">赛季协作</h1><p>真实阶段成果会点亮基地设施，并留在赛季编年史中。</p></div>
        <Link className="expedition-projects__back" to="/dashboard/expedition">返回基地 <span aria-hidden="true">↗</span></Link>
      </header>

      {error ? <p className="expedition-projects__error" role="alert">{error}</p> : null}

      {isSuperAdmin ? (
        <details className="expedition-projects__create">
          <summary>建立跨组项目</summary>
          <form onSubmit={createProject}>
            <label>项目名称<input required maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
            <label>目标<textarea required maxLength={5000} rows={2} value={draft.objective} onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))} /></label>
            <label>项目可见范围<select value={draft.visibility} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as "team" | "participants" }))}><option value="team">全队可见</option><option value="participants">仅参与组别可见</option></select></label>
            <div className="expedition-projects__milestone-drafts"><div className="expedition-projects__section-heading"><h2>组别阶段</h2><button type="button" onClick={addMilestone} disabled={draft.milestones.length >= 10}>添加阶段</button></div>
              {draft.milestones.map((milestone, index) => {
                const group = groupOptions.find((item) => item.id === Number(milestone.groupId));
                const target = group ? GROUP_EVOLUTION_TARGET[group.name] : undefined;
                return <fieldset className="expedition-projects__draft" key={index}><legend>阶段 {index + 1}</legend>
                  <label>负责组别<select required value={milestone.groupId} onChange={(event) => updateMilestone(index, "groupId", event.target.value)}><option value="">选择组别</option>{groupOptions.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
                  <label>阶段名称<input required maxLength={160} value={milestone.name} onChange={(event) => updateMilestone(index, "name", event.target.value)} /></label>
                  <label>完成标准<textarea required maxLength={5000} rows={2} value={milestone.criteria} onChange={(event) => updateMilestone(index, "criteria", event.target.value)} /></label>
                  <label>关联基地装置<select value={milestone.evolutionTarget} onChange={(event) => updateMilestone(index, "evolutionTarget", event.target.value)}><option value="">不关联装置</option>{target ? <option value={target}>{expeditionEvolutionTargetLabel(target)}</option> : null}</select></label>
                  <label>截止时间<input type="datetime-local" value={milestone.dueAt} onChange={(event) => updateMilestone(index, "dueAt", event.target.value)} /></label>
                  {milestone.groupId ? <div className="expedition-projects__participants"><span>参与成员</span>{membersByGroup[Number(milestone.groupId)]?.error ? <small>组内成员暂不可读取。</small> : membersByGroup[Number(milestone.groupId)]?.items.length ? <div>{membersByGroup[Number(milestone.groupId)].items.map((member) => <label key={member.userId}><input type="checkbox" checked={milestone.participantIDs.includes(String(member.userId))} onChange={(event) => toggleMilestoneParticipant(index, member.userId, event.target.checked)} />{member.displayName}</label>)}</div> : <small>读取组内成员…</small>}</div> : null}
                  {draft.milestones.length > 2 ? <button className="expedition-projects__remove" type="button" onClick={() => removeMilestone(index)}>移除阶段</button> : null}
                </fieldset>;
              })}
            </div>
            <fieldset className="expedition-projects__draft expedition-projects__draft--joint"><legend>联合验收</legend><label>阶段名称<input required maxLength={160} value={draft.finalName} onChange={(event) => setDraft((current) => ({ ...current, finalName: event.target.value }))} /></label><label>完成标准<textarea required maxLength={5000} rows={2} value={draft.finalCriteria} onChange={(event) => setDraft((current) => ({ ...current, finalCriteria: event.target.value }))} /></label><label>关联基地装置<select value={draft.finalEvolutionTarget} onChange={(event) => setDraft((current) => ({ ...current, finalEvolutionTarget: event.target.value as "" | "joint" }))}><option value="">不关联装置</option><option value="joint">整机联合成果</option></select></label></fieldset>
            <button className="expedition-projects__primary" type="submit" disabled={saving || groupOptions.length < 2}>{saving ? "保存中…" : "创建项目"}</button>
          </form>
        </details>
      ) : null}

      <div className="expedition-projects__layout">
        <aside className="expedition-projects__list" aria-label="协作项目列表">
          <div className="expedition-projects__section-heading"><h2>{isAdminView ? "可管理项目" : "我的协作"}</h2><button type="button" onClick={refresh} disabled={loading}>{loading ? "读取中" : "刷新"}</button></div>
          {loading ? <p className="expedition-projects__empty">正在读取项目…</p> : projects.length ? (
            <ul>{projects.map((project) => {
              const accepted = project.milestones.filter((milestone) => milestone.state === "accepted").length;
              return <li key={project.id}><button className={selectedProject?.id === project.id ? "is-selected" : ""} type="button" onClick={() => selectProject(project.id)}><span><strong>{project.title}</strong><small>{project.participantGroups.join(" · ")}</small></span><span className="expedition-projects__count">{accepted}/{project.milestones.length}</span></button></li>;
            })}</ul>
          ) : <p className="expedition-projects__empty">当前没有协作项目。</p>}
        </aside>

        <main className="expedition-projects__detail">
          {!selectedProject ? <div className="expedition-projects__empty-state"><span aria-hidden="true">⌁</span><h2>等待真实项目</h2><p>经过确认的协作成果会在这里改变基地状态。</p></div> : <>
            <header className="expedition-projects__project-heading"><div><p className="expedition-eyebrow">PROJECT #{selectedProject.id} · {selectedProject.visibility === "team" ? "全队可见" : "参与组别可见"}</p><h2>{selectedProject.title}</h2><p>{selectedProject.objective}</p></div><span className={`expedition-projects__overall ${selectedProject.hasAcceptedJoint ? "is-complete" : ""}`}>{selectedProject.hasAcceptedJoint ? "联合验收完成" : `${selectedProject.milestones.filter((milestone) => milestone.state === "accepted").length} / ${selectedProject.milestones.length} 阶段验收`}</span></header>
            <div className="expedition-projects__facts"><span>负责人 <strong>{selectedProject.creatorName}</strong></span><span>参与组别 <strong>{selectedProject.participantGroups.join(" · ")}</strong></span></div>
            <div className="expedition-projects__participants-list"><span>参与成员</span>{selectedProject.participants.length ? selectedProject.participants.map((participant) => <span key={`${participant.groupName}-${participant.userId}`}><strong>{participant.displayName}</strong> · {participant.groupName}</span>) : <small>暂无成员名单</small>}</div>

            <section className="expedition-projects__milestones" aria-labelledby="project-milestones-title"><div className="expedition-projects__section-heading"><h3 id="project-milestones-title">协作阶段</h3></div>
              <ol>{selectedProject.milestones.map((milestone) => {
                const isJoint = !milestone.groupId;
                const isMember = Boolean(milestone.groupName && selectedProject.participants.some((participant) => participant.userId === currentUser.id && participant.groupName === milestone.groupName));
                const canSubmit = milestone.state !== "accepted" && (isJoint ? isSuperAdmin && groupMilestonesAccepted(selectedProject) : isMember);
                const canReview = isManager && (isSuperAdmin || Boolean(milestone.groupName && groups.some((group) => group.name === milestone.groupName)));
                const status = expeditionMilestoneStateLabel(milestone.state);
                return <li className={`expedition-projects__milestone expedition-projects__milestone--${milestone.state}`} key={milestone.id}>
                  <div className="expedition-projects__milestone-top"><span className="expedition-projects__node" aria-hidden="true" /><div><small>{isJoint ? "联合验收" : milestone.groupName}{milestone.dueAt ? ` · 截止 ${formatExpeditionDate(milestone.dueAt)}` : ""}</small><h4>{milestone.name}</h4><p>{milestone.criteria}</p><span className="expedition-projects__evolution-target">{milestone.evolutionTarget ? `关联装置：${expeditionEvolutionTargetLabel(milestone.evolutionTarget)}` : "未关联基地装置"}</span></div><span className="expedition-projects__state">{status}</span></div>
                  {milestone.acceptedAt ? <p className="expedition-projects__accepted">验收于 {formatExpeditionDate(milestone.acceptedAt)}</p> : null}
                  {canSubmit ? <div className="expedition-projects__action"><label htmlFor={`evidence-${milestone.id}`}>成果依据<textarea id={`evidence-${milestone.id}`} rows={2} maxLength={5000} value={evidence[milestone.id] ?? ""} onChange={(event) => setEvidence((items) => ({ ...items, [milestone.id]: event.target.value }))} /></label><button type="button" disabled={saving || !evidence[milestone.id]?.trim()} onClick={() => void submitEvidence(milestone)}>提交成果</button></div> : null}
                  {canReview && milestone.state !== "open" ? <div className="expedition-projects__action expedition-projects__action--review"><label htmlFor={`review-${milestone.id}`}>{milestone.state === "accepted" ? "撤销原因" : "验收依据"}<textarea id={`review-${milestone.id}`} rows={2} maxLength={5000} value={reviewNotes[milestone.id] ?? ""} onChange={(event) => setReviewNotes((items) => ({ ...items, [milestone.id]: event.target.value }))} /></label><div>{milestone.state === "submitted" ? <button type="button" disabled={saving || !reviewNotes[milestone.id]?.trim()} onClick={() => void reviewMilestone(milestone, "accept")}>验收通过</button> : <button className="expedition-projects__secondary" type="button" disabled={saving || !reviewNotes[milestone.id]?.trim()} onClick={() => void reviewMilestone(milestone, "revoke")}>撤销验收</button>}</div></div> : null}
                </li>;
              })}</ol>
            </section>

            <section className="expedition-projects__history" aria-labelledby="project-history-title"><div className="expedition-projects__section-heading"><h3 id="project-history-title">赛季编年史</h3></div>{selectedProject.events.length ? <ol>{selectedProject.events.map((event) => <li key={event.id}><span className="expedition-projects__history-dot" /><div><small>{expeditionEventLabel(event.action)} · {formatExpeditionDate(event.createdAt)}{event.groupName ? ` · ${event.groupName}` : ""}</small><p>{event.content}</p><span>{event.actorName}</span></div></li>)}</ol> : <p className="expedition-projects__empty">暂无项目历史。</p>}</section>
          </>}
        </main>
      </div>
    </section>
  );
}

export default ExpeditionProjectsRoute;
