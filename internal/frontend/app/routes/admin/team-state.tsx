import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import type { IconifyIcon } from "@iconify/react";
import cpu from "@iconify-icons/lucide/cpu";
import megaphone from "@iconify-icons/lucide/megaphone";
import users from "@iconify-icons/lucide/users";
import targetIcon from "@iconify-icons/lucide/target";
import checkCircle from "@iconify-icons/lucide/check-circle-2";
import xCircle from "@iconify-icons/lucide/x-circle";
import clockIcon from "@iconify-icons/lucide/clock-3";
import helpCircle from "@iconify-icons/lucide/help-circle";
import chevronRight from "@iconify-icons/lucide/chevron-right";
import arrowLeft from "@iconify-icons/lucide/arrow-left";
import { useOutletContext } from "react-router";
import type { ReactNode } from "react";

import { apiRequest } from "~/lib/api-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./team-state.css";

type Source = { name: string; status: "available" | "partial" | "unavailable"; detail?: string; url?: string; setupUrl?: string };
type Goal = { id: string; title: string; target: string; url: string; kind?: string; status?: string };
type Acceptance = {
  total: number; passed: number; failed: number; pending: number; unknown: number;
  unscoped: number; achievedPct: number | null; evidencePct: number | null;
};
type Task = {
  id: string; title: string; assignees: string[]; status: string; priority?: string;
  due?: string; completedAt?: string; overdue: boolean;
};
type Project = {
  id: string; name: string; owner?: string; members?: string; status?: string; tasksLoaded: boolean;
  tasks: Task[]; completed: number; goals: Goal[]; acceptance: Acceptance;
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
  domains: { technology: Acceptance; operations: Acceptance; organization: Acceptance };
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

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}

function AcceptanceMeters({ metrics, compact = false }: { metrics: Acceptance; compact?: boolean }) {
  const rows = [
    { label: "已证实达成", value: metrics.achievedPct, count: metrics.passed, tone: "passed" },
    { label: "验收证据覆盖", value: metrics.evidencePct, count: metrics.passed + metrics.failed, tone: "evidence" },
  ];
  return <div className={"team-state__meters" + (compact ? " team-state__meters--compact" : "")}>
    {rows.map((row) => <div className="team-state__metric" key={row.tone}>
      <div className="team-state__metric-heading">
        <span>{row.label}</span>
        <strong className={row.value === null ? "team-state__metric-unknown" : ""}>{formatPercent(row.value)}</strong>
      </div>
      <div className={"team-state__meter team-state__meter--" + row.tone}
        role="progressbar" aria-label={row.label}
        aria-valuemin={row.value === null ? undefined : 0}
        aria-valuemax={row.value === null ? undefined : 100}
        aria-valuenow={row.value ?? undefined}
        aria-valuetext={row.value === null ? "尚未建立有效验收基线" : `${row.count} / ${metrics.total} 项`}>
        {row.value !== null && <div style={{ width: `${row.value}%` }} />}
      </div>
      <small>{metrics.total > 0 ? `${row.count} / ${metrics.total} 项` : "目标基线待建立"}</small>
    </div>)}
  </div>;
}

function AcceptanceBreakdown({ metrics }: { metrics: Acceptance }) {
  return <div className="team-state__breakdown" aria-label="目标验收状态分布">
    {[
      { count: metrics.passed, label: "通过", icon: checkCircle, tone: "passed" },
      { count: metrics.failed, label: "未达标", icon: xCircle, tone: "failed" },
      { count: metrics.pending, label: "待验收", icon: clockIcon, tone: "pending" },
      { count: metrics.unknown, label: "无法判断", icon: helpCircle, tone: "unknown" },
    ].filter(() => metrics.total > 0).map((item) => <span key={item.tone} className={"team-state__status-item team-state__status-item--" + item.tone}>
      <Icon icon={item.icon} aria-hidden="true" />{item.label} {item.count}
    </span>)}
    {metrics.total === 0 && <span className="team-state__status-item team-state__status-item--unknown">
      <Icon icon={helpCircle} aria-hidden="true" />验收基线未建立
    </span>}
    {metrics.unscoped > 0 && <span className="team-state__status-item team-state__status-item--unscoped">
      <Icon icon={targetIcon} aria-hidden="true" />缺验收标准 {metrics.unscoped}
    </span>}
  </div>;
}

function DomainCard({ title, icon, metrics, detail, href }: {
  title: string; icon: IconifyIcon; metrics: Acceptance; detail: string; href: string;
}) {
  return <section className="team-state__domain">
    <div className="team-state__domain-heading">
      <span className="team-state__domain-icon"><Icon icon={icon} aria-hidden="true" /></span>
      <strong>{title}</strong>
    </div>
    <AcceptanceMeters metrics={metrics} />
    <AcceptanceBreakdown metrics={metrics} />
    <div className="team-state__domain-bottom">
      <p>{detail}</p>
      <a href={href}>查看{title}<Icon icon={chevronRight} aria-hidden="true" /></a>
    </div>
  </section>;
}

function GoalState({ goal }: { goal: Goal }) {
  const type = goal.kind !== "验收要求" ? "unscoped" :
    goal.status === "已验证达成" ? "passed" :
    goal.status === "已验证未达标" ? "failed" :
    goal.status === "有成果待验收" ? "pending" : "unknown";
  const icon = type === "passed" ? checkCircle : type === "failed" ? xCircle :
    type === "pending" ? clockIcon : helpCircle;
  const label = type === "unscoped" ? (goal.status === "有成果待验收" ? "有成果待验收 · 标准未关联" : "验收标准待关联") :
    (goal.status || "无法判断");
  return <span className={"team-state__goal-state team-state__goal-state--" + type}>
    <Icon icon={icon} aria-hidden="true" />{label}
  </span>;
}

function TeamStateSkeleton() {
  const bar = "rounded bg-[var(--admin-border-subtle)]";
  return <div className="content-skeleton space-y-4" role="status" aria-label="正在读取战队运行状态">
    <div className="motion-safe:animate-pulse space-y-4" aria-hidden="true">
      <div className="team-state__domains">
        {[0, 1, 2].map((key) => <div key={key} className="team-state__domain space-y-3">
          <div className={bar + " h-4 w-20"} />
          <div className={bar + " h-7 w-32 max-w-full"} />
          <div className={bar + " h-4 w-full"} />
          <div className={bar + " h-4 w-3/4"} />
        </div>)}
      </div>
      <section className="team-state__panel space-y-4">
        <div className={bar + " h-6 w-44 max-w-full"} />
        <div className="team-state__project-grid">
          {[0, 1, 2, 3, 4, 5].map((key) => <div key={key} className="team-state__outcome-card pointer-events-none space-y-3">
            <div className={bar + " h-5 w-20"} />
            <div className={bar + " h-4 w-32 max-w-full"} />
            <div className={bar + " h-4 w-40 max-w-full"} />
            <div className={bar + " h-4 w-3/4"} />
          </div>)}
        </div>
      </section>
      <div className="team-state__columns">
        {[0, 1].map((key) => <section key={key} className="team-state__panel space-y-4">
          <div className={bar + " h-6 w-28"} />
          <div className={bar + " h-4 w-full"} />
          <div className={bar + " h-4 w-3/4"} />
        </section>)}
      </div>
    </div>
  </div>;
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
    {loading && !snapshot && <TeamStateSkeleton />}
    {snapshot && <>
      {snapshot.sources.some((source) => source.status === "unavailable") && <section className="team-state__access" aria-label="数据源读取问题">
        {snapshot.sources.filter((source) => source.status === "unavailable").map((source) => <div key={source.name}>
          <strong>{source.name}</strong><span>{source.detail || "暂不可读取"}</span>
          {source.setupUrl && <OriginalLink href={source.setupUrl}>开通读取权限</OriginalLink>}
          <OriginalLink href={source.url}>查看来源</OriginalLink>
        </div>)}
      </section>}

      {project ? <section className="team-state__project-view" aria-label="项目成果详情">
        <button className="team-state__back" type="button" onClick={() => setSelectedID("")}>
          <Icon icon={arrowLeft} aria-hidden="true" />战队全景
        </button>
        <div className="team-state__project-heading">
          <div>
            <h2>{project.name}</h2>
            {(project.owner || project.status) && <p className="team-state__muted">{project.owner ? `负责人：${project.owner}` : ""}{project.status ? ` · ${project.status}` : ""}</p>}
          </div>
          <OriginalLink href={project.url}>{project.tasksLoaded ? "飞书项目表" : "项目资料"}</OriginalLink>
        </div>

        <section className="team-state__panel">
          <div className="team-state__section-head">
            <h3>目标验收概况</h3>
            <span className="team-state__muted">只统计有明确标准的目标</span>
          </div>
          <AcceptanceMeters metrics={project.acceptance} />
          <AcceptanceBreakdown metrics={project.acceptance} />
          {project.acceptance.total === 0 && <p className="team-state__muted">
            尚无可用于计算的正式验收基线。现有研发计划和阶段成果仍可在下方核查。
          </p>}
        </section>

        <section className="team-state__panel">
          <h3>关键目标与成果核查</h3>
          {project.goals.length > 0 ? <>
            <p className="team-state__muted">状态以来源文档为依据；记载“已研发”仅代表有阶段成果，未自动视为通过验收。</p>
            <div className="team-state__goal-list">
              {project.goals.map((goal) => <article className="team-state__goal" key={goal.id}>
                <div className="team-state__goal-top"><strong>{goal.id} · {goal.title}</strong><GoalState goal={goal} /></div>
                <p>{goal.target}</p>
                <div className="team-state__goal-foot"><small>{goal.kind || "目标要求"} · {goal.kind === "验收要求" ? "未关联测试时不判定达标" : "不计入验收百分比"}</small><OriginalLink href={goal.url}>目标原文</OriginalLink></div>
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
        <section aria-label="全队领域全景">
          <div className="team-state__section-head">
            <h2>全队态势</h2>
            <span className="team-state__muted">各领域独立统计，不计算全队综合完成率</span>
          </div>
          <div className="team-state__domains">
            <DomainCard title="技术研发" icon={cpu} metrics={snapshot.domains.technology}
              detail={`${technical.length} 个兵种项目 · ${snapshot.domains.technology.unscoped} 条计划或阶段记录未纳入验收基线`}
              href="#team-technical" />
            <DomainCard title="运营" icon={megaphone} metrics={snapshot.domains.operations}
              detail={`${operationsFocus.length} 项赛季产出计划 · ${snapshot.operations ? `${snapshot.operations.active} 个未结束工作项` : "工作数据暂不可读"}`}
              href="#team-operations" />
            <DomainCard title="组织事务" icon={users} metrics={snapshot.domains.organization}
              detail={`${organizationFocus.length} 项培养规划 · ${snapshot.reports.length} 条近期周报线索`}
              href="#team-organization" />
          </div>
        </section>

        <section className="team-state__panel" id="team-technical">
          <div className="team-state__section-head">
            <h2>技术研发 · 项目验收矩阵</h2>
            <OriginalLink href={snapshot.sources.find((item) => item.name === "飞书项目管理")?.url}>项目来源</OriginalLink>
          </div>
          {technical.length === 0 ? <p className="team-state__muted">暂无可读取的兵种项目资料。</p> : <div className="team-state__project-grid">
            {technical.map((item) => <button key={item.id} className="team-state__outcome-card" type="button" onClick={() => setSelectedID(item.id)}>
              <div className="team-state__outcome-head">
                <h3><Icon icon={targetIcon} aria-hidden="true" />{shortName(item.name)}</h3>
                <span>查看目标 <Icon icon={chevronRight} aria-hidden="true" /></span>
              </div>
              <AcceptanceMeters metrics={item.acceptance} compact />
              <AcceptanceBreakdown metrics={item.acceptance} />
              <p className="team-state__outcome-note">
                {item.acceptance.total === 0 ? "尚无正式验收基线；研发计划和阶段成果可在详情查看。" :
                  `${item.acceptance.total} 项验收要求 · ${item.acceptance.unknown} 项尚无足够验收证据`}
                {item.goals.some((goal) => goal.status === "有成果待验收") && " · 有阶段成果记录"}
              </p>
              <small>{item.meetingExcerpt ? `最近组会：${meetingDate(item.meetingExcerpt, Number(snapshot.generatedAt.slice(0, 4))) || "日期待确认"}` : "近期组会记录暂不可用"}</small>
            </button>)}
          </div>}
          {other.length > 0 && <p className="team-state__unclassified">
            {other.length} 条飞书项目记录尚未归入兵种：{other.map((item) => item.name).join("、")}。
            <OriginalLink href={snapshot.sources.find((item) => item.name === "飞书项目管理")?.url}>查看原表</OriginalLink>
          </p>}
        </section>

        <div className="team-state__columns">
          <section className="team-state__panel" id="team-operations">
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
          <section className="team-state__panel" id="team-organization">
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
