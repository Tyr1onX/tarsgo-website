import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";

import { WorkbenchFeatureStatus } from "~/components/workbench-feature-status";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { assignmentClient, type Assignment } from "~/lib/assignment-client";
import { getGrowthProfile, growthEventLabel, formatGrowthDate, type GrowthEvent, type GrowthProfile } from "~/lib/growth-client";
import { buildExpeditionChallenges, getAcceptedExpeditionMilestones, getExpeditionEvolution, getPrimaryFacilityId, getPublicFacilityFAQs, type ExpeditionChallenge, type ExpeditionFacilityId } from "~/lib/expedition-data";
import { parseExpeditionArea, withExpeditionArea, parseExpeditionTerminal, withExpeditionTerminal, type ExpeditionTerminal } from "~/lib/expedition-navigation";
import { expeditionEvolutionTargetLabel, expeditionProjectClient, type ExpeditionProject } from "~/lib/expedition-project-client";
import { hasSkillGroupAccess, hasTechnicalGroupAccess } from "~/lib/dashboard-navigation";
import { skillsClient, skillStateLabel, type SkillGroupProgress } from "~/lib/skills-client";
import { formatQuestionDate, trainingQuestionClient, type TrainingQuestion } from "~/lib/training-question-client";
import { FACILITIES, type FacilityInfo } from "~/components/expedition/facilities";
import { WorldMap } from "~/components/expedition/world-map";
import { InteriorScene, getSceneDevices } from "~/components/expedition/interior-scene";
import "./expedition.css";

export function meta() {
  return [{ title: "TARS BASE · 赛季远征 | TARSGO" }];
}

interface ExpeditionData {
  profile: GrowthProfile | null;
  skills: SkillGroupProgress[];
  assignments: Assignment[];
  questions: TrainingQuestion[];
  faqs: TrainingQuestion[];
  projects: ExpeditionProject[];
  loading: boolean;
  errors: { profile: boolean; skills: boolean; assignments: boolean; questions: boolean; faqs: boolean; projects: boolean };
}

const EMPTY_DATA: ExpeditionData = {
  profile: null,
  skills: [],
  assignments: [],
  questions: [],
  faqs: [],
  projects: [],
  loading: true,
  errors: { profile: false, skills: false, assignments: false, questions: false, faqs: false, projects: false },
};

function ZoneGlyph({ id, className = "" }: { id: ExpeditionFacilityId; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {id === "hangar" ? <><path d="M3 10.5 12 4l9 6.5v9H3z" /><path d="M8 19.5v-6h8v6M5.5 10.5h13" /><path d="M12 4v3" /></> : null}
      {id === "mechanical" ? <><path d="M14.7 6.1a4.2 4.2 0 0 0-5.5 5.5l-5.6 5.6a1.8 1.8 0 0 0 2.5 2.5l5.6-5.6a4.2 4.2 0 0 0 5.5-5.5l-2.6 2.6-2.5-2.5z" /><path d="m17.2 4.5 2.3 2.3" /></> : null}
      {id === "controls" ? <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M7 8h3v3H7zM14 8h3M14 11h3M7 15h3M14 15h3" /><path d="M10 9.5h4M8.5 11v4" /></> : null}
      {id === "vision" ? <><path d="M2.8 12s3.3-5.1 9.2-5.1 9.2 5.1 9.2 5.1-3.3 5.1-9.2 5.1S2.8 12 2.8 12Z" /><circle cx="12" cy="12" r="2.6" /><circle cx="12" cy="12" r=".7" /></> : null}
      {id === "ai" ? <><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 9h6v6H9zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M6.2 6.2l-1.3-1.3M19.1 19.1l-1.3-1.3M17.8 6.2l1.3-1.3M4.9 19.1l1.3-1.3" /></> : null}
      {id === "operations" ? <><path d="M4 19h16M6 16V9l6-4 6 4v7" /><path d="M9 16v-4h6v4M12 5V2.8M8.5 7.3 7 5.8M15.5 7.3 17 5.8" /><circle cx="12" cy="2.7" r=".8" /></> : null}
    </svg>
  );
}

function challengeStatusLabel(task: ExpeditionChallenge) {
  if (task.kind === "assignment") {
    if (task.status === "needs_redo") return "重新提交";
    if (task.status === "overdue") return "已逾期";
    return "待提交";
  }
  if (task.kind === "skill") return task.status === "practiced" ? "继续实践" : "可挑战";
  if (task.kind === "question") return "待跟进";
  return "本周";
}

function formatDueDate(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" }).format(parsed);
}

function eventHref(event: GrowthEvent) {
  return event.href?.startsWith("/dashboard/") && !event.href.startsWith("//") ? event.href : undefined;
}

function facilityGroupProgress(facility: FacilityInfo, groups: readonly SkillGroupProgress[]) {
  if (!facility.groupName) return null;
  return groups.find((group) => group.name === facility.groupName) ?? null;
}

function TerminalWindow({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog?.open) dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="base-terminal" aria-labelledby="base-terminal-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><div><span className="base-terminal__signal" aria-hidden="true" /><h2 id="base-terminal-title">{title}</h2></div><button type="button" onClick={onClose} autoFocus aria-label="关闭终端">✕</button></header>
    <div className="base-terminal__content">{children}</div>
  </dialog>;
}

export default function ExpeditionRoute() {
  const { currentUser, groupResolution, groupResolutionError } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const groupNames = groupResolution?.groups.map((group) => group.name) ?? [];
  const groupKey = groupNames.join("|");
  const technicalMember = hasTechnicalGroupAccess(groupResolution?.groups);
  const skillMember = hasSkillGroupAccess(groupResolution?.groups);
  const canReadBase = skillMember || currentUser.role.name === "super_admin";
  const selectedSceneId = parseExpeditionArea(searchParams.get("area"));
  const isOverview = selectedSceneId === null;
  const selectedId = selectedSceneId ?? getPrimaryFacilityId(groupNames);
  const requestedTerminal = parseExpeditionTerminal(searchParams.get("terminal"));
  const globalTerminal = requestedTerminal && ["growth", "journal", "challenges", "projects"].includes(requestedTerminal);
  const terminal = requestedTerminal && (globalTerminal || (selectedSceneId && getSceneDevices(selectedSceneId).some((device) => device.terminal === requestedTerminal))) ? requestedTerminal : null;
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<ExpeditionData>(EMPTY_DATA);
  const requestId = useRef(0);

  useEffect(() => {
    if (terminal || (isOverview && !regionMenuOpen)) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (regionMenuOpen) setRegionMenuOpen(false);
      else setSearchParams(withExpeditionArea(searchParams, null));
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOverview, terminal, regionMenuOpen, searchParams, setSearchParams]);

  useEffect(() => {
    const activeRequest = ++requestId.current;
    const questionGroups = groupResolution?.groups.filter((group) => ["机械组", "电控组", "视觉组", "AI组"].includes(group.name)) ?? [];
    setData({ ...EMPTY_DATA, loading: true });

    const profileRequest = getGrowthProfile().then((value) => ({ value, error: false })).catch(() => ({ value: null, error: true }));
    const skillsRequest = skillMember
      ? skillsClient.listMine().then((value) => ({ value: value.groups, error: false })).catch(() => ({ value: [] as SkillGroupProgress[], error: true }))
      : Promise.resolve({ value: [] as SkillGroupProgress[], error: false });
    const assignmentsRequest = technicalMember
      ? assignmentClient.listMine().then((value) => ({ value, error: false })).catch(() => ({ value: [] as Assignment[], error: true }))
      : Promise.resolve({ value: [] as Assignment[], error: false });
    const questionsRequest = technicalMember
      ? Promise.all(questionGroups.map((group) => trainingQuestionClient.listMember({ groupId: group.groupId, mineOnly: true, status: "open" })))
        .then((values) => ({ value: values.flat(), error: false }))
        .catch(() => ({ value: [] as TrainingQuestion[], error: true }))
      : Promise.resolve({ value: [] as TrainingQuestion[], error: false });
    const faqsRequest = technicalMember
      ? Promise.all(questionGroups.map((group) => trainingQuestionClient.listMember({ groupId: group.groupId, faqOnly: true })))
        .then((values) => ({ value: values.flat(), error: false }))
        .catch(() => ({ value: [] as TrainingQuestion[], error: true }))
      : Promise.resolve({ value: [] as TrainingQuestion[], error: false });
    const projectsRequest = expeditionProjectClient.listMine().then((value) => ({ value, error: false })).catch(() => ({ value: [] as ExpeditionProject[], error: true }));

    void Promise.all([profileRequest, skillsRequest, assignmentsRequest, questionsRequest, faqsRequest, projectsRequest]).then(([profile, skills, assignments, questions, faqs, projects]) => {
      if (requestId.current !== activeRequest) return;
      setData({
        profile: profile.value,
        skills: skills.value,
        assignments: assignments.value,
        questions: questions.value,
        faqs: faqs.value,
        projects: projects.value,
        loading: false,
        errors: { profile: profile.error, skills: skills.error, assignments: assignments.error, questions: questions.error, faqs: faqs.error, projects: projects.error },
      });
    });

    return () => { requestId.current++; };
  }, [currentUser.id, groupKey, refreshKey, skillMember, technicalMember]);

  const requestedProjectId = Number(searchParams.get("projectId")) || 0;
  const assemblyProject = data.projects.find((project) => project.id === requestedProjectId) ?? data.projects[0] ?? null;
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (next.has("area") && !selectedSceneId) {
      next.delete("area");
      changed = true;
    }
    if (next.has("terminal") && !terminal) { next.delete("terminal"); changed = true; }
    if (!data.loading) {
      const nextProjectId = assemblyProject?.id;
      if (nextProjectId !== requestedProjectId) {
        if (nextProjectId) next.set("projectId", String(nextProjectId));
        else next.delete("projectId");
        changed = true;
      }
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [assemblyProject, data.loading, requestedProjectId, searchParams, selectedSceneId, terminal, setSearchParams]);

  const selectAssemblyProject = (projectId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("projectId", projectId);
    setSearchParams(next);
  };

  const exploreFacility = (facilityId: ExpeditionFacilityId) => { setRegionMenuOpen(false); setSearchParams(withExpeditionArea(searchParams, facilityId)); };
  const openTerminal = (value: ExpeditionTerminal) => setSearchParams(withExpeditionTerminal(searchParams, value));
  const closeTerminal = () => setSearchParams(withExpeditionTerminal(searchParams, null));
  const returnToOverview = () => { setRegionMenuOpen(false); setSearchParams(withExpeditionArea(searchParams, null)); };

  const selectedFacility = FACILITIES.find((facility) => facility.id === selectedId) ?? FACILITIES[0];
  const isMemberOfSelectedGroup = selectedFacility.groupName === null || groupNames.includes(selectedFacility.groupName);
  const activeSkillGroup = facilityGroupProgress(selectedFacility, data.skills);
  const selectedNodes = activeSkillGroup?.nodes ?? [];
  const masteredCount = selectedNodes.filter((node) => node.state === "mastered").length;
  const practicedCount = selectedNodes.filter((node) => node.state === "practiced").length;
  const availableCount = selectedNodes.filter((node) => node.state === "available").length;
  const lockedCount = selectedNodes.filter((node) => node.state === "locked").length;
  const masteredFacilityIds = data.skills
    .filter((group) => group.nodes.some((node) => node.state === "mastered"))
    .map((group) => FACILITIES.find((facility) => facility.groupName === group.name)?.id)
    .filter((id): id is ExpeditionFacilityId => Boolean(id));
  const challenges = useMemo(() => buildExpeditionChallenges({
    assignments: data.assignments,
    skillGroups: data.skills,
    questions: data.questions,
    profile: data.profile,
    groupNames,
  }), [data.assignments, data.profile, data.questions, data.skills, groupKey]);
  const selectedFAQs = getPublicFacilityFAQs(data.faqs, selectedFacility.groupName);
  const selectedProjects = data.projects.filter((project) => selectedFacility.groupName ? project.participantGroups.includes(selectedFacility.groupName) : true).slice(0, 3);
  const { acceptedTargets: acceptedEvolutionTargets, hasAcceptedJoint } = getExpeditionEvolution(assemblyProject);
  const acceptedEvolutionLabels = acceptedEvolutionTargets.map(expeditionEvolutionTargetLabel);
  const acceptedMilestones = getAcceptedExpeditionMilestones(data.projects).slice(0, 4);
  const recentEvents = [...(data.profile?.events ?? [])].reverse().slice(0, 4);
  const device = getSceneDevices(selectedId).find((item) => item.terminal === terminal);
  const terminalTitle = device?.name ?? ({ challenges: "我的待办", growth: "成员档案", journal: "远征日志", projects: "总装控制台" } as Record<string,string>)[terminal ?? ""] ?? "基地终端";
  const selectedAssignments = data.assignments.filter((item) => item.groupName === selectedFacility.groupName);
  const selectedQuestions = data.questions.filter((item) => item.groupName === selectedFacility.groupName);
  const denied = !globalTerminal && !isMemberOfSelectedGroup;
  const terminalError = terminal === "assignments" ? data.errors.assignments : terminal === "skills" ? data.errors.skills : terminal === "questions" ? data.errors.questions || data.errors.faqs : terminal === "projects" || terminal === "journal" ? data.errors.projects : terminal === "growth" ? data.errors.profile : terminal === "challenges" ? data.errors.assignments || data.errors.skills || data.errors.questions : false;

  return <section className="base-experience" data-scene={isOverview ? "overview" : selectedId} aria-label="TARS BASE">
    <header className="base-hud">
      <Link className="base-hud__brand" to="/dashboard" aria-label="返回工作台"><span aria-hidden="true">T</span><h1>TARS BASE</h1></Link>
      <div className="base-hud__tools"><button type="button" onClick={()=>openTerminal("challenges")}>待办{challenges.length ? <i>{challenges.length}</i> : null}</button><button type="button" onClick={()=>openTerminal("growth")}>档案</button><button type="button" onClick={()=>openTerminal("journal")}>日志</button><Link to="/dashboard">退出基地 ↗</Link></div>
    </header>
    {canReadBase ? <>
      <div className="base-stage" key={selectedSceneId ?? "world"}>
        {isOverview ? <WorldMap onSelect={exploreFacility} masteredFacilityIds={masteredFacilityIds} hasPersonalRecord={Boolean(data.profile?.events.length)} acceptedEvolutionTargets={acceptedEvolutionTargets} hasAcceptedJoint={hasAcceptedJoint}/> : <InteriorScene key={selectedId} id={selectedId} name={selectedFacility.name} targets={acceptedEvolutionTargets} joint={hasAcceptedJoint} mastered={masteredFacilityIds.includes(selectedId)} onOpen={openTerminal}/>}
      </div>
      <footer className="base-navigation">
        <div className="base-navigation__location">{!isOverview ? <button type="button" onClick={returnToOverview} aria-label="返回基地世界地图">←</button> : <span className="base-navigation__compass" aria-hidden="true">⌖</span>}<div><small>{isOverview ? "TARS BASE" : selectedFacility.englishName}</small><div className="base-navigation__title-row"><h2>{isOverview ? "基地总览" : selectedFacility.name}</h2><WorkbenchFeatureStatus feature="base" /></div></div></div>
        <div className="base-navigation__actions">{isOverview || selectedId === "hangar" ? <button className="base-navigation__project" type="button" onClick={()=>openTerminal("projects")}>{assemblyProject?.title ?? "总装项目"}<span>↗</span></button> : null}<button type="button" onClick={()=>setRegionMenuOpen(v=>!v)} aria-expanded={regionMenuOpen} aria-controls="base-regions">切换区域 <span aria-hidden="true">⌘</span></button></div>
      </footer>
      {regionMenuOpen ? <nav id="base-regions" className="base-regions" aria-label="切换基地设施"><button type="button" onClick={()=>{setRegionMenuOpen(false);returnToOverview();}}>⌖ 基地总览</button>{FACILITIES.map(f=><button key={f.id} type="button" aria-current={selectedSceneId===f.id?"page":undefined} onClick={()=>exploreFacility(f.id)}><ZoneGlyph id={f.id}/>{f.name}</button>)}</nav> : null}
      {groupResolutionError ? <p className="base-data-warning" role="status">组别暂不可确认，个人业务入口已隐藏。</p> : null}
      {terminal ? <TerminalWindow key={`${selectedId}:${terminal}`} title={terminalTitle} onClose={closeTerminal}>
        {denied ? <div className="terminal-empty">{selectedFacility.groupName}专属终端</div> : data.loading ? <div className="terminal-empty" role="status">正在读取…</div> : terminalError ? <div className="terminal-empty" role="alert"><p>终端数据暂不可读取</p><button type="button" onClick={()=>setRefreshKey(k=>k+1)}>重新读取</button></div> : <>
          {terminal === "challenges" ? <>{challenges.length ? <ul className="terminal-records">{challenges.map(task=><li key={task.key}><Link to={task.href}><strong>{task.title}</strong><small>{task.detail} · {challengeStatusLabel(task)}</small><span>↗</span></Link></li>)}</ul> : <p className="terminal-empty">当前没有待处理挑战</p>}<button type="button" className="terminal-action" onClick={()=>setRefreshKey(k=>k+1)}>刷新待办</button></> : null}
          {terminal === "assignments" ? <>{selectedAssignments.length ? <ul className="terminal-records">{selectedAssignments.map(a=><li key={a.id}><Link to={`/dashboard/assignments?assignmentId=${a.id}`}><strong>{a.title}</strong><small>截止 {formatDueDate(a.dueAt)} · {({pending:"待提交",overdue:"已逾期",submitted:"已提交",passed:"已通过",needs_redo:"需重做"})[a.status??"pending"]}</small><span>↗</span></Link></li>)}</ul> : <p className="terminal-empty">当前没有分配给你的作业</p>}<Link className="terminal-action" to="/dashboard/assignments">打开我的作业 ↗</Link></> : null}
          {terminal === "skills" ? <>{selectedNodes.length ? <><div className="terminal-skill-counts"><span>未解锁 <b>{lockedCount}</b></span><span>可挑战 <b>{availableCount}</b></span><span>已实践 <b>{practicedCount}</b></span><span>已掌握 <b>{masteredCount}</b></span></div><ul className="terminal-records">{selectedNodes.map(n=><li key={n.id}><Link to="/dashboard/skills"><strong>{n.name}</strong><small>{skillStateLabel(n.state??"locked")}</small><span>↗</span></Link></li>)}</ul></> : <p className="terminal-empty">本组技能路线尚未配置</p>}<Link className="terminal-action" to="/dashboard/skills">进入技能树 ↗</Link></> : null}
          {terminal === "questions" ? <><h3>待跟进的问题</h3>{selectedQuestions.length ? <ul className="terminal-records">{selectedQuestions.map(q=><li key={q.id}><Link to={`/dashboard/questions?groupId=${q.groupId}&questionId=${q.id}`}><strong>{q.title}</strong><small>{formatQuestionDate(q.createdAt)}</small><span>↗</span></Link></li>)}</ul> : <p className="terminal-empty">没有待跟进的问题</p>}<h3>本组公开 FAQ</h3>{selectedFAQs.length ? <ul className="terminal-records">{selectedFAQs.map(q=><li key={q.id}><Link to={`/dashboard/questions?groupId=${q.groupId}&questionId=${q.id}`}><strong>{q.title}</strong><small>{formatQuestionDate(q.lastReplyAt??q.createdAt)}</small><span>↗</span></Link></li>)}</ul> : <p className="terminal-empty">暂无公开 FAQ</p>}<Link className="terminal-action" to="/dashboard/questions">打开提问答疑 ↗</Link></> : null}
          {terminal === "projects" ? <><label className="terminal-project-select">总装绑定项目<select value={assemblyProject?String(assemblyProject.id):""} disabled={!data.projects.length} onChange={e=>selectAssemblyProject(e.target.value)}>{!assemblyProject?<option value="">暂无可见项目</option>:null}{data.projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>{assemblyProject ? <p className="terminal-project-state">{hasAcceptedJoint?"联合验收完成":acceptedEvolutionLabels.length?`已验收：${acceptedEvolutionLabels.join("、")}`:"尚无装置验收"}</p> : null}{(isOverview ? data.projects : selectedProjects).length ? <ul className="terminal-records">{(isOverview?data.projects:selectedProjects).map(p=><li key={p.id}><Link to={`/dashboard/expedition/projects?projectId=${p.id}`}><strong>{p.title}</strong><small>{p.hasAcceptedJoint?"联合验收完成":`${p.milestones.filter(m=>m.state==="accepted").length} 个阶段已验收`}</small><span>↗</span></Link></li>)}</ul>:<p className="terminal-empty">暂无对你开放的协作项目；待负责人创建和安排后会显示。</p>}<Link className="terminal-action" to="/dashboard/expedition/projects">打开赛季协作 ↗</Link></> : null}
          {terminal === "growth" ? <><h3>{data.profile?.displayName??currentUser.nickname??"我的成长"}</h3>{recentEvents.length ? <ul className="terminal-records">{recentEvents.map(event=><li key={event.key}>{eventHref(event)?<Link to={eventHref(event)!}><strong>{event.title}</strong><small>{growthEventLabel(event.kind)} · {formatGrowthDate(event.occurredAt)}</small><span>↗</span></Link>:<div><strong>{event.title}</strong><small>{formatGrowthDate(event.occurredAt)}</small></div>}</li>)}</ul>:<p className="terminal-empty">尚无成长记录</p>}<Link className="terminal-action" to="/dashboard/growth">打开成长档案 ↗</Link></> : null}
          {terminal === "journal" ? <><h3>赛季编年史</h3>{acceptedMilestones.length?<ul className="terminal-records">{acceptedMilestones.map(({project,milestone})=><li key={`${project.id}:${milestone.id}`}><Link to={`/dashboard/expedition/projects?projectId=${project.id}`}><strong>{project.title} · {milestone.name}</strong><small>{milestone.groupName||"联合验收"} · {formatQuestionDate(milestone.acceptedAt!)}</small><span>↗</span></Link></li>)}</ul>:<p className="terminal-empty">暂无已验收的赛季成果</p>}<Link className="terminal-action" to="/dashboard/expedition/projects">查看协作历史 ↗</Link></> : null}
          {terminal === "weekly" ? <><p className="terminal-empty">{data.profile?.displayName??currentUser.nickname}的工作周报</p><Link className="terminal-action" to="/dashboard/weekly-reports">打开我的周报 ↗</Link></> : null}
        </>}
      </TerminalWindow> : null}
    </> : <div className="base-closed" role="status"><h2>{groupResolutionError?"基地权限暂不可确认":"基地尚未开放"}</h2><Link to="/dashboard">返回工作台 ↗</Link></div>}
  </section>;
}
