import { useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import type { ReactNode } from "react";

import { apiRequest } from "~/lib/api-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./team-state.css";

type Source = { name: string; status: "available" | "partial" | "unavailable"; detail?: string; url?: string; setupUrl?: string };
type Goal = { id: string; title: string; target: string; url: string; kind?: string; status?: string };
type Task = {
  id: string; title: string; assignees: string[]; status: string; priority?: string;
  due?: string; completedAt?: string; overdue: boolean;
};
type Project = {
  id: string; name: string; owner?: string; members?: string; status?: string; tasksLoaded: boolean;
  tasks: Task[]; completed: number; goals: Goal[];
  planExcerpt?: string; meetingExcerpt?: string; meetingUrl?: string; url: string;
};
type Report = { id: number; member: string; group: string; week: string; completed?: string; blockers?: string; nextPlan?: string };
type Insight = { kind: "事实" | "推断"; text: string; sourceUrl: string };
type DomainFocus = { domain: "运营" | "组织"; title: string; target: string; url: string };
type OperationsItem = { title: string; stage?: string; nextAction?: string; updatedAt: string };
type Snapshot = {
  generatedAt: string;
  sources: Source[];
  insights?: Insight[];
  focus?: DomainFocus[];
  summary: null | {
    total: number; completed: number; inProgress: number; notStarted: number;
    stalled: number; overdue: number; missingCompletedDate: number;
  };
  projects: Project[];
  reports: Report[];
  operations: null | { active: number; blocked: number; items: OperationsItem[]; url: string };
};

export function meta() {
  return [{ title: "战队运行状态 | TARSGO" }];
}

const dateText = (raw?: string) => raw?.slice(0, 10) || "未记录";
const shortName = (name: string) => name.replace(/^27赛季/, "");

function OriginalLink({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return null;
  const external = href.startsWith("http");
  return <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{children}</a>;
}

function meetingDate(excerpt?: string, year = 2026) {
  const heading = excerpt?.split("\n")[0] || "";
  const match = heading.match(/(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})/);
  if (!match) return "";
  const y = Number(match[1] || year);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return date.toISOString().slice(0, 10);
}

function recentMeeting(project: Project, generatedAt: string) {
  const date = meetingDate(project.meetingExcerpt, Number(generatedAt.slice(0, 4)));
  if (!date) return null;
  const elapsed = (Date.parse(generatedAt.slice(0, 10)) - Date.parse(date)) / 86400000;
  return elapsed >= 0 && elapsed <= 7 ? date : null;
}

function meetingPreview(excerpt?: string) {
  return excerpt?.split("\n").slice(1).filter(Boolean).slice(0, 2).join("；") || "";
}

function TaskStatus({ task }: { task: Task }) {
  return <span className={task.overdue ? "team-state__warning" : "team-state__muted"}>
    {task.overdue ? "逾期待核实" : task.status || "未标记"}
  </span>;
}

export default function TeamStatePage() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedID, setSelectedID] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (currentUser.role.name !== "super_admin") return;
    const controller = new AbortController();
    setLoading(true);
    apiRequest<Snapshot>("/api/admin/team-state", { signal: controller.signal, cache: "no-store" })
      .then((data) => {
        if (controller.signal.aborted) return;
        setSnapshot(data);
        setError("");
        setSelectedID((previous) => data.projects.some((item) => item.id === previous) ? previous : "");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "读取战队运行状态失败");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currentUser.id, currentUser.role.name, version]);

  if (currentUser.role.name !== "super_admin") {
    return <div className="admin-design"><div role="alert" className="admin-alert admin-alert--error">仅超级管理员可查看战队运行状态。</div></div>;
  }

  const project = snapshot?.projects.find((item) => item.id === selectedID);
  const technical = snapshot?.projects.filter((item) => item.name.startsWith("27赛季")) || [];
  const other = snapshot?.projects.filter((item) => !item.name.startsWith("27赛季")) || [];
  const knownGoals = technical.reduce((total, item) => total + item.goals.length, 0);
  const acceptanceGoals = technical.reduce((total, item) => total + item.goals.filter((goal) => goal.kind === "验收要求").length, 0);
  const operationsFocus = snapshot?.focus?.filter((item) => item.domain === "运营") || [];
  const organizationFocus = snapshot?.focus?.filter((item) => item.domain === "组织") || [];
  const latest = snapshot?.projects.flatMap((item) => {
    const date = recentMeeting(item, snapshot.generatedAt);
    return date ? [{ item, date }] : [];
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4) || [];

  return <main className="admin-design team-state">
    <header className="admin-page-header team-state__header">
      <div>
        <h1 className="admin-page-title">战队运行状态</h1>
        {snapshot && <p className="team-state__muted">2027 赛季 · 数据读取于 {new Date(snapshot.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</p>}
      </div>
      <button className="team-state__refresh" type="button" disabled={loading} onClick={() => setVersion((value) => value + 1)}>
        {loading ? "读取中" : "刷新"}
      </button>
    </header>

    {error && <div role="alert" className="admin-alert admin-alert--error">{error}</div>}
    {loading && !snapshot && <div role="status" className="team-state__empty">正在读取战队运行状态…</div>}
    {snapshot && <>
      {snapshot.sources.some((source) => source.status === "unavailable") && <section className="team-state__access" aria-label="数据源读取问题">
        {snapshot.sources.filter((source) => source.status === "unavailable").map((source) => <div key={source.name}>
          <strong>{source.name}</strong><span>{source.detail || "暂不可读取"}</span>
          {source.setupUrl && <OriginalLink href={source.setupUrl}>开通读取权限</OriginalLink>}
          <OriginalLink href={source.url}>查看来源</OriginalLink>
        </div>)}
      </section>}

      {project ? <section className="team-state__project-view" aria-label="项目成果详情">
        <button className="team-state__back" type="button" onClick={() => setSelectedID("")}>← 战队全景</button>
        <div className="team-state__project-heading">
          <div>
            <h2>{project.name}</h2>
            {(project.owner || project.status) && <p className="team-state__muted">{project.owner ? `负责人：${project.owner}` : ""}{project.status ? ` · ${project.status}` : ""}</p>}
          </div>
          <OriginalLink href={project.url}>{project.tasksLoaded ? "飞书项目表" : "项目资料"}</OriginalLink>
        </div>

        <section className="team-state__panel">
          <h3>关键目标与成果核查</h3>
          {project.goals.length > 0 ? <>
            <p className="team-state__muted">状态以来源文档为依据；记载“已研发”仅代表有阶段成果，未自动视为通过验收。</p>
            <div className="team-state__goal-list">
              {project.goals.map((goal) => <article className="team-state__goal" key={goal.id}>
                <div className="team-state__goal-top"><strong>{goal.id} · {goal.title}</strong><span className="team-state__unverified">{goal.status || "无法判断"}</span></div>
                <p>{goal.target}</p>
                <div className="team-state__goal-foot"><small>{goal.kind || "目标要求"}</small><OriginalLink href={goal.url}>原始来源</OriginalLink></div>
              </article>)}
            </div>
          </> : <p className="team-state__muted">尚未关联可逐项核查的量化验收目标。</p>}
          {project.planExcerpt && <div className="team-state__plan">
            <div className="team-state__section-head"><h3>已有研发需求</h3><OriginalLink href={project.meetingUrl}>原始文档</OriginalLink></div>
            <div className="team-state__plan-lines">{project.planExcerpt.split("\n").filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}</div>
          </div>}
        </section>

        <section className="team-state__panel">
          <div className="team-state__section-head">
            <h3>近期组会证据</h3>
            <OriginalLink href={project.meetingUrl}>查看完整记录</OriginalLink>
          </div>
          {project.meetingExcerpt ? <>
            <p className="team-state__muted">记录日期：{meetingDate(project.meetingExcerpt, Number(snapshot.generatedAt.slice(0, 4))) || "未标注"} · 以下是原文摘录，未作为目标验收结论。</p>
            <p className="team-state__meeting">{project.meetingExcerpt}</p>
          </> : <p className="team-state__muted">未找到可提取的近期组会正文。</p>}
        </section>

        <details className="team-state__panel team-state__evidence">
          <summary>执行任务与人员 <span className="team-state__muted">{project.tasksLoaded ? `${project.tasks.length} 条记录` : "来源暂不可读取"}</span></summary>
          {!project.tasksLoaded && <p className="team-state__muted">无法确认任务状态，请查阅原始来源。</p>}
          {project.tasksLoaded && project.tasks.length === 0 && <p className="team-state__muted">飞书项目表没有关联任务。</p>}
          <div className="team-state__task-list">
            {[...project.tasks].sort((a, b) => Number(b.overdue) - Number(a.overdue)).map((task) =>
              <div key={task.id} className="team-state__task">
                <div><strong>{task.title}</strong><TaskStatus task={task}/></div>
                <small>{task.assignees.join("、") || "执行人未识别"} · 截止 {dateText(task.due)}</small>
                {task.status === "已完成" && !task.completedAt && <small>实际完成时间未记录</small>}
              </div>,
            )}
          </div>
          <p className="team-state__muted">任务完成仅代表飞书记录状态，不等于目标验收通过。 <OriginalLink href={project.url}>查看原始任务</OriginalLink></p>
        </details>
      </section> : <>
        <section className="team-state__domains" aria-label="全队领域全景">
          <div className="team-state__domain">
            <span className="team-state__eyebrow">技术研发</span>
            <strong>{technical.length} 个兵种项目</strong>
            <p>{knownGoals > 0 ? `已关联 ${knownGoals} 条研发目标及阶段记录，其中 ${acceptanceGoals} 条来自量化验收清单` : "尚未关联可核查的赛季目标资料"}</p>
            <small>各项目成果与需求见下方</small>
          </div>
          <div className="team-state__domain">
            <span className="team-state__eyebrow">运营</span>
            <strong>{snapshot.operations ? `${snapshot.operations.active} 项进行中` : "数据暂不可读取"}</strong>
            <p>{snapshot.operations ? `${snapshot.operations.blocked} 个受阻环节；${operationsFocus.length} 项赛季产出计划尚待对照实际结果` : "当前缺少可核查的运营进展"}</p>
            <OriginalLink href={snapshot.operations?.url}>运营动态</OriginalLink>
          </div>
          <div className="team-state__domain">
            <span className="team-state__eyebrow">组织事务</span>
            <strong>{organizationFocus.length > 0 ? "已有培养规划" : "目标待关联"}</strong>
            <p>{organizationFocus.length > 0 ? "已找到分阶段培养及通过标准，实际达成情况尚未关联。" : "现有成员与周报资料尚未建立组织事务的目标验收关系。"}</p>
            <OriginalLink href="/dashboard/workbench/organization">成员与岗位</OriginalLink>
          </div>
        </section>

        <section className="team-state__panel">
          <div className="team-state__section-head">
            <h2>技术研发 · 关键成果对照</h2>
            <OriginalLink href={snapshot.sources.find((item) => item.name === "飞书项目管理")?.url}>项目来源</OriginalLink>
          </div>
          {technical.length === 0 ? <p className="team-state__muted">暂无可读取的兵种项目资料。</p> : <div className="team-state__project-grid">
            {technical.map((item) => <button key={item.id} className="team-state__outcome-card" type="button" onClick={() => setSelectedID(item.id)}>
              <div className="team-state__outcome-head"><h3>{shortName(item.name)}</h3><span>查看项目 →</span></div>
              <div className="team-state__outcome-main">
                {item.goals.length > 0 ? <>
                  <strong>{item.goals.length} 条{item.goals.some((goal) => goal.kind === "验收要求") ? "验收要求" : item.goals.some((goal) => goal.kind?.startsWith("研发阶段记录")) ? "阶段成果记录" : "关键研发需求"}</strong>
                  <span>{item.goals.some((goal) => goal.status === "有成果待验收") ? "部分成果已记载 · 验收待核查" : "最终验收状态：无法判断"}</span>
                  <p>{item.goals[0]?.title}</p>
                </> : item.planExcerpt ? <>
                  <strong>已记录研发需求</strong>
                  <span>量化验收目标待关联</span>
                  <p>{item.planExcerpt.split("\n").find(Boolean)}</p>
                </> : <>
                  <strong>验收目标待关联</strong>
                  <span>当前无法判断达成情况</span>
                </>}
              </div>
              <small>{item.meetingExcerpt ? `最近组会：${meetingDate(item.meetingExcerpt, Number(snapshot.generatedAt.slice(0, 4))) || "日期待确认"}` : "近期组会记录暂不可用"}</small>
            </button>)}
          </div>}
          {other.length > 0 && <p className="team-state__unclassified">
            {other.length} 条飞书项目记录尚未归入兵种：{other.map((item) => item.name).join("、")}。
            <OriginalLink href={snapshot.sources.find((item) => item.name === "飞书项目管理")?.url}>查看原表</OriginalLink>
          </p>}
        </section>

        <div className="team-state__columns">
          <section className="team-state__panel">
            <div className="team-state__section-head"><h2>运营 · 当前交付</h2><OriginalLink href={snapshot.operations?.url}>查看运营动态</OriginalLink></div>
            {operationsFocus.length > 0 && <div className="team-state__focus-list">{operationsFocus.map((item) => <article key={item.title}>
              <strong>{item.title}</strong><p>{item.target}</p><small>赛季计划 · <OriginalLink href={item.url}>目标原文</OriginalLink></small>
            </article>)}</div>}
            <h3 className="team-state__subhead">实际工作记录</h3>
            {!snapshot.operations ? <p className="team-state__muted">运营工作记录暂不可读取。</p> : snapshot.operations.items.length === 0 ?
              <p className="team-state__muted">暂无未结束的运营工作明细。</p> :
              <div className="team-state__activity-list">{snapshot.operations.items.map((item, index) => <article key={index}>
                <strong>{item.title}</strong>
                {item.nextAction && <p>下一步：{item.nextAction}</p>}
                <small>最近更新：{dateText(item.updatedAt)}</small>
              </article>)}</div>}
            <p className="team-state__muted">任务记录尚未逐项关联至赛季产出，不能据此认定目标完成。</p>
          </section>
          <section className="team-state__panel">
            <div className="team-state__section-head"><h2>组织 · 资料覆盖</h2><OriginalLink href="/dashboard/weekly-reports">工作周报</OriginalLink></div>
            {organizationFocus.map((item) => <div className="team-state__focus-list" key={item.title}><article>
              <strong>{item.title}</strong><p>{item.target}</p><small><OriginalLink href={item.url}>培养规划原文</OriginalLink></small>
            </article></div>)}
            <p className="team-state__muted">培养通过情况尚未和实际记录逐项关联。周报可作为工作线索，但不会自动认定为组织成果。</p>
            {snapshot.reports.length > 0 && <div className="team-state__report-list">
              <strong>近期跨组周报</strong>
              {snapshot.reports.slice(0, 3).map((report) => <div key={report.id}>
                <span>{report.member}{report.group ? ` · ${report.group}` : ""}</span>
                <small>{dateText(report.week)}</small>
              </div>)}
            </div>}
            <OriginalLink href="/dashboard/workbench/organization">查看成员与岗位</OriginalLink>
          </section>
        </div>

        <section className="team-state__panel">
          <div className="team-state__section-head"><h2>最近七天 · 已记录进展</h2><span className="team-state__muted">依据组会日期</span></div>
          {latest.length > 0 ? <div className="team-state__activity-list">
            {latest.map(({ item, date }) => <article key={item.id}>
              <div className="team-state__activity-heading"><strong>{shortName(item.name)}</strong><small>{date}</small></div>
              <p>{meetingPreview(item.meetingExcerpt) || "组会记录已更新，具体内容见原文。"}</p>
              <OriginalLink href={item.meetingUrl}>组会原文</OriginalLink>
            </article>)}
          </div> : <p className="team-state__muted">最近七天未找到带明确日期的组会摘录，不代表项目没有推进。</p>}
        </section>

        {Boolean(snapshot.insights?.length) && <details className="team-state__panel team-state__evidence">
          <summary>任务记录待核实事项 <span className="team-state__muted">{snapshot.insights?.length} 条</span></summary>
          <div className="team-state__insights">{snapshot.insights?.map((item, index) => <div key={index}>
            <span className="team-state__muted">{item.kind}</span><span>{item.text}</span>
            <OriginalLink href={item.sourceUrl}>原始任务</OriginalLink>
          </div>)}</div>
        </details>}
      </>}

      <details className="team-state__sources">
        <summary>数据来源与读取状态</summary>
        <ul>{snapshot.sources.map((source) => <li key={source.name}>
          <span>{source.name} · {source.status === "available" ? "可读取" : source.status === "partial" ? "部分可读取" : "不可读取"}</span>
          {source.detail && <span>{source.detail}</span>}
          {source.setupUrl && <OriginalLink href={source.setupUrl}>开通权限</OriginalLink>}
          <OriginalLink href={source.url}>查看来源</OriginalLink>
        </li>)}</ul>
      </details>
    </>}
  </main>;
}
