import { useEffect, useState } from "react";
import { useOutletContext } from "react-router";

import { apiRequest } from "~/lib/api-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./team-state.css";

type Source = { name: string; status: "available" | "partial" | "unavailable"; detail?: string; url?: string };
type Goal = { id: string; title: string; target: string; url: string };
type Task = {
  id: string; title: string; assignees: string[]; status: string; priority?: string;
  due?: string; completedAt?: string; overdue: boolean;
};
type Project = {
  id: string; name: string; tasks: Task[]; completed: number; goals: Goal[];
  meetingExcerpt?: string; meetingUrl?: string; url: string;
};
type Report = { id: number; member: string; group: string; week: string; completed?: string; blockers?: string; nextPlan?: string };
type Insight = { kind: "事实" | "推断"; text: string; sourceUrl: string };
type Snapshot = {
  generatedAt: string;
  sources: Source[];
  insights?: Insight[];
  summary: null | {
    total: number; completed: number; inProgress: number; notStarted: number;
    stalled: number; overdue: number; missingCompletedDate: number;
  };
  projects: Project[];
  reports: Report[];
  operations: null | { active: number; blocked: number; url: string };
};

export function meta() {
  return [{ title: "战队运行状态 | TARSGO" }];
}

const dateText = (raw?: string) => raw?.slice(0, 10) || "未记录";

function OriginalLink({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return null;
  return <a href={href} target={href.startsWith("http") ? "_blank" : undefined}
    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}>{children}</a>;
}

function TaskStatus({ task }: { task: Task }) {
  if (task.overdue) return <span className="team-state__status team-state__status--warning">逾期待核实</span>;
  return <span className={"team-state__status" + (task.status === "已完成" ? " team-state__status--done" : "")}>
    {task.status || "未标记"}
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
        setSelectedID((previous) => data.projects.some((item) => item.id === previous) ? previous : (data.projects[0]?.id || ""));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "读取战队运行状态失败");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currentUser.id, currentUser.role.name, version]);

  if (currentUser.role.name !== "super_admin") {
    return <div className="admin-design"><div role="alert" className="admin-alert admin-alert--error">仅超级管理员可查看战队运行状态。</div></div>;
  }

  const project = snapshot?.projects.find((item) => item.id === selectedID);
  const summary = snapshot?.summary;

  return <main className="admin-design team-state">
    <header className="admin-page-header team-state__header">
      <h1 className="admin-page-title">战队运行状态</h1>
      <button className="team-state__refresh" type="button" disabled={loading} onClick={() => setVersion((value) => value + 1)}>
        {loading ? "读取中" : "刷新"}
      </button>
    </header>

    {error && <div role="alert" className="admin-alert admin-alert--error">{error}</div>}
    {loading && !snapshot && <div role="status" className="team-state__empty">正在读取运行状态…</div>}
    {snapshot && <>
      {summary ? <section className="team-state__metrics" aria-label="项目任务概况">
        <div><strong>{snapshot.projects.length}</strong><span>已登记项目</span></div>
        <div><strong>{summary.completed} / {summary.total}</strong><span>任务标记完成</span></div>
        <div><strong>{summary.overdue}</strong><span>逾期待核实</span></div>
        <div><strong>{summary.stalled}</strong><span>已停滞</span></div>
      </section> : <section className="team-state__empty">飞书项目暂不可读取；其他已连接的数据仍可查看。</section>}

      {Boolean(snapshot.insights?.length) && <section className="team-state__panel" aria-labelledby="team-insights-title">
        <h2 id="team-insights-title">需要关注</h2>
        <div className="team-state__insights">{snapshot.insights?.map((item, index) => <div key={index}>
          <span className="team-state__insight-kind">{item.kind}</span>
          <span>{item.text}</span>
          <OriginalLink href={item.sourceUrl}>原始任务</OriginalLink>
        </div>)}</div>
      </section>}

      <div className="team-state__columns">
        <section className="team-state__panel" aria-labelledby="team-projects-title">
          <div className="team-state__section-head">
            <h2 id="team-projects-title">项目</h2>
            <OriginalLink href={snapshot.sources.find((item) => item.name === "飞书项目管理")?.url}>飞书项目表</OriginalLink>
          </div>
          {snapshot.projects.length === 0 && <p className="team-state__muted">暂无可读取的项目。</p>}
          <div className="team-state__project-list">
            {snapshot.projects.map((item) => <button key={item.id} type="button"
              className={"team-state__project" + (item.id === selectedID ? " team-state__project--selected" : "")}
              onClick={() => setSelectedID(item.id)} aria-pressed={item.id === selectedID}>
              <span>{item.name}</span>
              <small>{item.completed} / {item.tasks.length} 条任务</small>
            </button>)}
          </div>
        </section>

        <section className="team-state__panel team-state__detail" aria-label="项目详情">
          {project ? <>
            <div className="team-state__section-head">
              <h2>{project.name}</h2>
              <OriginalLink href={project.url}>原始任务</OriginalLink>
            </div>
            <h3>最终目标</h3>
            {project.goals.length ? <div className="team-state__goals">
              {project.goals.map((goal) => <div key={goal.id} className="team-state__goal">
                <div><strong>{goal.id} · {goal.title}</strong><OriginalLink href={goal.url}>目标来源</OriginalLink></div>
                <p>{goal.target}</p>
                <small>本看板尚未关联验收结果</small>
              </div>)}
            </div> : <p className="team-state__muted">尚未关联可核验的最终目标。</p>}

            <div className="team-state__section-head team-state__subhead">
              <h3>当前任务</h3>
              <span className="team-state__muted">{project.tasks.length} 条</span>
            </div>
            {project.tasks.length === 0 && <p className="team-state__muted">暂无关联任务。</p>}
            <div className="team-state__task-list">
              {[...project.tasks].sort((a, b) => Number(b.overdue) - Number(a.overdue)).map((task) =>
                <div key={task.id} className="team-state__task">
                  <div><strong>{task.title}</strong><TaskStatus task={task} /></div>
                  <small>{task.assignees.join("、") || "执行人未识别"} · 截止 {dateText(task.due)}</small>
                  {task.status === "已完成" && !task.completedAt && <small>未记录实际完成时间</small>}
                </div>,
              )}
            </div>

            {project.meetingUrl && <div className="team-state__meeting">
              <div className="team-state__section-head">
                <h3>组会记录</h3><OriginalLink href={project.meetingUrl}>查看原文</OriginalLink>
              </div>
              {project.meetingExcerpt ? <p>{project.meetingExcerpt}</p> : <p className="team-state__muted">未提取到近期会议原文，查看来源确认进展。</p>}
            </div>}
          </> : <p className="team-state__muted">选择项目查看目标、任务和依据。</p>}
        </section>
      </div>

      <div className="team-state__columns team-state__lower">
        <section className="team-state__panel" aria-labelledby="team-operations-title">
          <div className="team-state__section-head">
            <h2 id="team-operations-title">运营</h2>
            <OriginalLink href={snapshot.operations?.url}>运营动态</OriginalLink>
          </div>
          {snapshot.operations ? <div className="team-state__operations">
            <div><strong>{snapshot.operations.active}</strong><span>未结束工作项</span></div>
            <div><strong>{snapshot.operations.blocked}</strong><span>受阻环节</span></div>
          </div> : <p className="team-state__muted">运营状态暂不可读取。</p>}
        </section>
        <section className="team-state__panel" aria-labelledby="team-reports-title">
          <div className="team-state__section-head">
            <h2 id="team-reports-title">近期周报</h2>
            <OriginalLink href="/dashboard/weekly-reports">工作周报</OriginalLink>
          </div>
          {snapshot.reports.length === 0 && <p className="team-state__muted">近三周暂无可读取的周报。</p>}
          <div className="team-state__reports">
            {snapshot.reports.map((report) => <details key={report.id}>
              <summary><strong>{report.member}</strong><small>{report.group || "未分组"} · {report.week}</small></summary>
              {report.completed && <p><b>本周完成</b>{report.completed}</p>}
              {report.blockers && <p><b>需要帮助</b>{report.blockers}</p>}
              {report.nextPlan && <p><b>下周计划</b>{report.nextPlan}</p>}
            </details>)}
          </div>
        </section>
      </div>

      <details className="team-state__sources">
        <summary>数据来源与读取状态</summary>
        <ul>{snapshot.sources.map((source) => <li key={source.name}>
          <span>{source.name} · {source.status === "available" ? "可读取" : source.status === "partial" ? "部分可读取" : "不可读取"}</span>
          <span>{source.detail}</span>
          <OriginalLink href={source.url}>打开来源</OriginalLink>
        </li>)}</ul>
      </details>
    </>}
  </main>;
}
