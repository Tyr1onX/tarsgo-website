import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";

import { WorkbenchFeatureStatus } from "~/components/workbench-feature-status";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { getGrowthDashboardTabs, getGrowthTabPath, hasSkillGroupAccess } from "~/lib/dashboard-navigation";
import { formatGrowthDate, getGrowthProfile, growthEventLabel, growthEventTone, type GrowthProfile } from "~/lib/growth-client";
import { skillsClient, type SkillGroupProgress } from "~/lib/skills-client";
import "./growth.css";

const CapabilitiesPanel = lazy(() => import("~/routes/dashboard/capabilities").then((module) => ({ default: module.CapabilitiesPanel })));
const SkillsPanel = lazy(() => import("~/routes/dashboard/skills").then((module) => ({ default: module.SkillsPanel })));

export function meta() {
  return [{ title: "我的成长 | TARSGO" }];
}

function dueLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export default function MyGrowthRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams] = useSearchParams();
  const tabs = getGrowthDashboardTabs(currentUser, hasSkillGroupAccess(groupResolution?.groups), Boolean(groupResolution?.groups?.length));
  const activeTab = tabs.find((tab) => tab.key === searchParams.get("tab"))?.key ?? "profile";

  return (
    <div className="growth-workspace">
      <nav className="growth-tabs" aria-label="我的成长">
        {tabs.map((tab) => (
          <Link key={tab.key} to={getGrowthTabPath(tab.key, searchParams.toString())} aria-current={activeTab === tab.key ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
      {activeTab === "profile" ? <GrowthProfilePanel currentUser={currentUser} /> : null}
      {activeTab === "capabilities" ? <Suspense fallback={<p className="growth-loading" role="status">正在打开能力雷达…</p>}><CapabilitiesPanel /></Suspense> : null}
      {activeTab === "skills" ? <Suspense fallback={<p className="growth-loading" role="status">正在打开技能树…</p>}><SkillsPanel /></Suspense> : null}
    </div>
  );
}

function GrowthProfilePanel({ currentUser }: { currentUser: DashboardLayoutOutletContext["currentUser"] }) {
  const [profile, setProfile] = useState<GrowthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const skillsRequestId = useRef(0);
  const [skillGroups, setSkillGroups] = useState<SkillGroupProgress[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState(false);

  useEffect(() => {
    const activeRequest = ++requestId.current;
    setProfile(null);
    setLoading(true);
    setError("");
    getGrowthProfile()
      .then((result) => {
        if (requestId.current === activeRequest) setProfile(result);
      })
      .catch((cause: unknown) => {
        if (requestId.current === activeRequest) setError(cause instanceof Error ? cause.message : "成长档案加载失败");
      })
      .finally(() => {
        if (requestId.current === activeRequest) setLoading(false);
      });
    return () => { requestId.current++; };
  }, [currentUser.id]);

  useEffect(() => {
    const activeRequest = ++skillsRequestId.current;
    setSkillGroups([]);
    setSkillsLoading(true);
    setSkillsError(false);
    skillsClient.listMine().then((result) => {
      if (skillsRequestId.current === activeRequest) setSkillGroups(result.groups);
    }).catch(() => {
      if (skillsRequestId.current === activeRequest) setSkillsError(true);
    }).finally(() => {
      if (skillsRequestId.current === activeRequest) setSkillsLoading(false);
    });
    return () => { skillsRequestId.current++; };
  }, [currentUser.id]);

  const events = profile?.events ?? [];
  const recentEvents = [...events].reverse().slice(0, 3);
  const isTechnicalMember = profile?.groups.some((group) => ["机械组", "电控组", "视觉组", "AI组"].includes(group)) ?? false;
  const isOperationsMember = profile?.groups.includes("运营组") ?? false;
  const skillNodes = skillGroups.flatMap((group) => group.nodes.map((node) => ({ ...node, groupId: group.id, groupName: group.name })));
  const masteredSkills = skillNodes.filter((node) => node.state === "mastered");
  const activeSkills = skillNodes.filter((node) => Boolean(node.startedAt) && node.state !== "mastered");
  const nextSkill = skillNodes.find((node) => node.state === "available" || node.state === "practiced");

  return (
    <section className="growth-page admin-design" aria-labelledby="growth-page-title">
      <header className="growth-hero">
        <div className="growth-hero__orbit" aria-hidden="true"><span /><span /><i /></div>
        <div className="growth-hero__identity">
          <p className="growth-hero__eyebrow">TARS BASE <span>·</span> SEASON EXPEDITION</p>
          <div className="growth-hero__title-row"><h1 id="growth-page-title">我的成长</h1><WorkbenchFeatureStatus feature="growth" /></div>
          <p className="growth-hero__name">{profile?.displayName ?? "个人档案"}</p>
          <div className="growth-group-list" aria-label="所属组别">
            {profile?.groups.map((group) => <span className="growth-group" key={group}>{group}</span>)}
            {!loading && profile?.groups.length === 0 ? <span className="growth-group growth-group--quiet">尚未确认组别</span> : null}
          </div>
          {profile?.groups.length ? <Link className="growth-action-link" to="/dashboard/growth?tab=capabilities">查看能力雷达 <span aria-hidden="true">↗</span></Link> : null}
        </div>
        <div className="growth-hero__signal" aria-hidden="true"><span>FIELD LOG</span><strong>{String(events.length).padStart(2, "0")}</strong><i>真实成长记录</i></div>
        <div className="growth-hero__stats" aria-label="成长成果统计">
          {isTechnicalMember ? <>
            <div><strong>{profile?.stats.completedChallenges ?? 0}</strong><span>通过训练</span></div>
            <div><strong>{profile?.stats.firstSubmissions ?? 0}</strong><span>训练提交</span></div>
            <div><strong>{profile?.stats.practiceProjects ?? 0}</strong><span>参与项目</span></div>
            <div><strong>{profile?.stats.projectsAccepted ?? 0}</strong><span>项目验收</span></div>
          </> : isOperationsMember ? <>
            <div><strong>{profile?.stats.weeklyReports ?? 0}</strong><span>周报记录</span></div>
            <div><strong>{events.length}</strong><span>成长记录</span></div>
            <div><strong>{profile?.groups.length ?? 0}</strong><span>所属组别</span></div>
          </> : <>
            <div><strong>{profile?.groups.length ?? 0}</strong><span>所属组别</span></div>
            <div><strong>{events.length}</strong><span>成长记录</span></div>
          </>}
        </div>
      </header>

      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {loading ? <p role="status" className="growth-loading">正在读取成长记录…</p> : null}

      {!loading && profile ? (
        <div className="growth-layout">
          <section className="growth-timeline" aria-labelledby="growth-timeline-title">
            <div className="growth-section-heading">
              <div><p>EXPEDITION LOG</p><h2 id="growth-timeline-title">成长时间线</h2></div>
              <span>{events.length} 条记录</span>
            </div>
            {events.length === 0 ? (
              <div className="growth-empty">
                <span className="growth-empty__marker" aria-hidden="true">＋</span>
                <h3>旅程从这里开始</h3>
                <p>完成一次真实的训练、讨论或工作周报后，记录会出现在这里。</p>
                {profile.nextAction ? <Link className="growth-action-link" to={profile.nextAction.href}>开始下一步 <span aria-hidden="true">↗</span></Link> : null}
              </div>
            ) : (
              <ol className="growth-event-list">
                {[...events].reverse().map((event) => {
                  const content = <>
                    <span className={`growth-event__marker growth-event__marker--${growthEventTone(event.kind)}`} aria-hidden="true" />
                    <span className="growth-event__body">
                      <span className="growth-event__topline"><span>{growthEventLabel(event.kind)}</span><time dateTime={event.occurredAt}>{formatGrowthDate(event.occurredAt)}</time></span>
                      <strong>{event.title}</strong>
                      {event.description ? <span className="growth-event__description">{event.description}</span> : null}
                      {event.groupName ? <span className="growth-event__group">{event.groupName}</span> : null}
                    </span>
                    {event.href ? <span className="growth-event__arrow" aria-hidden="true">↗</span> : null}
                  </>;
                  return <li className="growth-event" key={event.key}>{event.href ? <Link to={event.href} className="growth-event__link">{content}</Link> : <div className="growth-event__link">{content}</div>}</li>;
                })}
              </ol>
            )}
          </section>

          <aside className="growth-rail">
            <section className="growth-next" aria-labelledby="growth-next-title">
              <p className="growth-rail__eyebrow">NEXT TRANSMISSION</p>
              <h2 id="growth-next-title">下一步</h2>
              {profile.nextAction ? (
                <Link to={profile.nextAction.href} className="growth-next__card">
                  <span className="growth-next__icon" aria-hidden="true">{isTechnicalMember ? "⌁" : isOperationsMember ? "▤" : "＋"}</span>
                  <strong>{profile.nextAction.title}</strong>
                  {profile.nextAction.detail ? <span>{profile.nextAction.detail}</span> : null}
                  {profile.nextAction.dueAt ? <small>截止 {dueLabel(profile.nextAction.dueAt)}</small> : null}
                  {profile.nextAction.status ? <small className="growth-next__status">{profile.nextAction.status === "needs_redo" ? "需重新提交" : profile.nextAction.status === "overdue" ? "已逾期" : profile.nextAction.status === "submitted" ? "等待批改" : "待提交"}</small> : null}
                  <span className="growth-next__open">打开记录 <span aria-hidden="true">↗</span></span>
                </Link>
              ) : <p className="growth-next__quiet">确认组别后，下一步会显示在这里。</p>}
              {!profile.nextAction && isTechnicalMember ? <Link className="growth-action-link" to="/dashboard">进入吉甲社区 <span aria-hidden="true">↗</span></Link> : null}
              {!profile.nextAction && isOperationsMember ? <Link className="growth-action-link" to="/dashboard/weekly-reports">查看工作周报 <span aria-hidden="true">↗</span></Link> : null}
            </section>

            <section className="growth-contributions" aria-labelledby="growth-contributions-title">
              <p className="growth-rail__eyebrow">PERSONAL RECORDS</p>
              <h2 id="growth-contributions-title">探索与贡献</h2>
              {isTechnicalMember ? (
                <dl>
                  <div><dt>训练首次提交</dt><dd>{profile.stats.firstSubmissions}</dd></div>
                  <div><dt>参与讨论</dt><dd>{profile.stats.discussionThreads}</dd></div>
                  <div><dt>问题解决</dt><dd>{profile.stats.resolvedQuestions}</dd></div>
                  <div><dt>FAQ 收录</dt><dd>{profile.stats.faqContributions}</dd></div>
                </dl>
              ) : isOperationsMember ? (
                <dl><div><dt>已保存周报</dt><dd>{profile.stats.weeklyReports}</dd></div></dl>
              ) : <p className="growth-next__quiet">暂无可汇总的业务记录。</p>}
            </section>

            <section className="growth-contributions growth-skill-route" aria-labelledby="growth-skill-route-title">
              <p className="growth-rail__eyebrow">SKILL ROUTE</p>
              <h2 id="growth-skill-route-title">成长路径</h2>
              {skillsLoading ? <p className="growth-next__quiet">正在读取技能路线…</p> : skillsError ? <p className="growth-next__quiet">技能路线暂时无法读取。</p> : skillGroups.length > 0 ? <>
                <dl><div><dt>已确认掌握</dt><dd>{masteredSkills.length}</dd></div><div><dt>正在挑战</dt><dd>{activeSkills.length}</dd></div></dl>
                {masteredSkills.length > 0 ? <ul className="growth-skill-route__list">{masteredSkills.slice(0, 3).map((node) => <li key={node.id}><span>{node.groupName}</span><strong>{node.name}</strong></li>)}</ul> : null}
                {nextSkill ? <Link className="growth-action-link" to={`/dashboard/growth?tab=skills&groupId=${nextSkill.groupId}&nodeId=${nextSkill.id}`}>下一项：{nextSkill.name} <span aria-hidden="true">↗</span></Link> : <Link className="growth-action-link" to="/dashboard/growth?tab=skills">探索技能树 <span aria-hidden="true">↗</span></Link>}
              </> : <p className="growth-next__quiet">组内路线配置后，技能进展会显示在这里。</p>}
            </section>

            <section className="growth-recent" aria-labelledby="growth-recent-title">
              <p className="growth-rail__eyebrow">RECENT SIGNAL</p>
              <h2 id="growth-recent-title">最近记录</h2>
              {recentEvents.length > 0 ? <ul>{recentEvents.map((event) => <li key={event.key}><span>{growthEventLabel(event.kind)}</span><strong>{event.description || event.title}</strong></li>)}</ul> : <p className="growth-next__quiet">新的记录出现后，会在这里显示。</p>}
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
