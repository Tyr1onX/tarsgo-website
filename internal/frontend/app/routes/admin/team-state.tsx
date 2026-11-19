import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useOutletContext } from "react-router";
import { Icon } from "@iconify/react";
import arrowLeft from "@iconify-icons/lucide/arrow-left";
import chevronRight from "@iconify-icons/lucide/chevron-right";
import cpu from "@iconify-icons/lucide/cpu";
import checkCircle from "@iconify-icons/lucide/check-circle-2";
import clock from "@iconify-icons/lucide/clock-3";
import alertTriangle from "@iconify-icons/lucide/alert-triangle";
import calendarDays from "@iconify-icons/lucide/calendar-days";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { apiRequest } from "~/lib/api-client";
import "./team-state.css";

type Source = { name: string; status: "available" | "partial" | "unavailable"; detail?: string; url?: string; setupUrl?: string };
type Task = {
  id: string; title: string; assignees: string[]; status: string; priority?: string;
  due?: string; completedAt?: string; overdue: boolean;
};
type Project = {
  id: string; name: string; owner?: string; tasksLoaded: boolean; tasks: Task[];
  completed: number; inProgress: number; notStarted: number; stalled: number;
  lastMeetingDate?: string; updates: string[]; blocker?: string; nextAction?: string;
  meetingExcerpt?: string; meetingUrl?: string; url: string;
};
type Summary = {
  total: number; completed: number; inProgress: number; notStarted: number;
  stalled: number; missingCompletedDate: number;
};
type Snapshot = { generatedAt: string; refreshing?: boolean; sources: Source[]; summary: Summary | null; projects: Project[] };

export function meta() {
  return [{ title: "技术研发总览 | TARSGO" }];
}

const dateText = (value?: string) => value?.slice(0, 10) || "未记录";
const percent = (done: number, total: number) => total > 0 ? Math.round(done / total * 1000) / 10 : 0;
const groupName = (name: string) => name.replace(/^27赛季/, "");

function SourceLink({ url, children }: { url?: string; children: ReactNode }) {
  if (!url) return null;
  const external = url.startsWith("http");
  return <a href={url} target={external ? "_blank" : undefined}
    rel={external ? "noopener noreferrer" : undefined}>{children}</a>;
}

function Progress({ done, total, name }: { done: number; total: number; name: string }) {
  const value = percent(done, total);
  return <div className="team-state__progress">
    <div className="team-state__progress-head">
      <span>已录入任务完成率</span>
      <strong className="team-state__percent">{total > 0 ? `${value}%` : "—"}</strong>
    </div>
    <div className="team-state__progress-track" role="progressbar" aria-label={name + "已录入任务完成率"}
      aria-valuemin={total > 0 ? 0 : undefined} aria-valuemax={total > 0 ? 100 : undefined}
      aria-valuenow={total > 0 ? value : undefined}
      aria-valuetext={total > 0 ? `${done} / ${total} 条任务` : "没有已录入的任务"}>
      {total > 0 && <div style={{ width: `${value}%` }} />}
    </div>
    <small>{total > 0 ? `${done} / ${total} 条任务` : "暂无任务记录"}</small>
  </div>;
}

function TeamStateSkeleton() {
  const bar = "rounded bg-[var(--admin-border-subtle)]";
  return <div className="content-skeleton space-y-4" role="status" aria-label="正在读取技术研发进度">
    <div className="motion-safe:animate-pulse space-y-4" aria-hidden="true">
      <div className="team-state__stats">
        {[0, 1, 2].map((key) => <div key={key} className="team-state__stat space-y-3">
          <div className={bar + " h-4 w-28"} />
          <div className={bar + " h-8 w-20"} />
          <div className={bar + " h-3 w-4/5"} />
        </div>)}
      </div>
      <section className="team-state__panel space-y-4">
        <div className={bar + " h-6 w-36"} />
        <div className="team-state__project-grid">
          {[0, 1, 2, 3, 4, 5].map((key) => <div className="team-state__project-card space-y-3" key={key}>
            <div className={bar + " h-5 w-20"} />
            <div className={bar + " h-7 w-24"} />
            <div className={bar + " h-3 w-full"} />
            <div className={bar + " h-4 w-4/5"} />
            <div className={bar + " h-4 w-3/5"} />
          </div>)}
        </div>
      </section>
    </div>
  </div>;
}

function ProjectCard({ project, onSelect }: { project: Project; onSelect: () => void }) {
  const pending = project.inProgress + project.notStarted;
  return <button className="team-state__project-card" type="button" onClick={onSelect}>
    <div className="team-state__card-head">
      <h3><Icon icon={cpu} aria-hidden="true" />{groupName(project.name)}</h3>
      <Icon icon={chevronRight} aria-hidden="true" />
    </div>
    {project.tasksLoaded ? <>
      <Progress done={project.completed} total={project.tasks.length} name={groupName(project.name)} />
      <div className="team-state__counts">
        <span><Icon icon={clock} aria-hidden="true" />推进中/未开始 {pending}</span>
        {project.stalled > 0 && <span className="team-state__stalled"><Icon icon={alertTriangle} aria-hidden="true" />停滞 {project.stalled}</span>}
      </div>
    </> : <div className="team-state__missing">任务数据暂不可读取</div>}
    <div className="team-state__latest">
      <span className="team-state__meeting-date"><Icon icon={calendarDays} aria-hidden="true" />最近组会 {project.lastMeetingDate || "尚无记录"}</span>
      {project.updates.length ? <p>{project.updates[0]}</p> : <p>尚未获取到可识别的组会进展</p>}
    </div>
    <span className="team-state__card-more">查看兵种详情 <Icon icon={chevronRight} aria-hidden="true" /></span>
  </button>;
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  return <section className="team-state__details">
    <button className="team-state__back" type="button" onClick={onBack}>
      <Icon icon={arrowLeft} aria-hidden="true" />技术研发总览
    </button>
    <header className="team-state__detail-title">
      <div>
        <h2>{project.name}</h2>
        {project.owner && <p className="team-state__muted">项目负责人：{project.owner}</p>}
      </div>
      <SourceLink url={project.url}>飞书项目管理</SourceLink>
    </header>
    <div className="team-state__panel">
      <h3>任务推进情况</h3>
      {project.tasksLoaded ? <>
        <Progress done={project.completed} total={project.tasks.length} name={groupName(project.name)} />
        <div className="team-state__counts">
          <span><Icon icon={checkCircle} aria-hidden="true" />完成 {project.completed}</span>
          <span><Icon icon={clock} aria-hidden="true" />进行中 {project.inProgress}</span>
          <span>未开始 {project.notStarted}</span>
          {project.stalled > 0 && <span className="team-state__stalled"><Icon icon={alertTriangle} aria-hidden="true" />已停滞 {project.stalled}</span>}
        </div>
      </> : <p className="team-state__muted">飞书项目任务暂不可读取，无法计算任务完成率。</p>}
      <p className="team-state__muted">这里只统计已经录入飞书的任务，不代表整个赛季研发完成比例。</p>
    </div>

    <div className="team-state__panel">
      <div className="team-state__section-head">
        <h3>最近组会进展</h3>
        <SourceLink url={project.meetingUrl}>查看原始组会</SourceLink>
      </div>
      <p className="team-state__meeting-date"><Icon icon={calendarDays} aria-hidden="true" />组会日期：{project.lastMeetingDate || "未记录"}</p>
      {project.updates.length > 0 ? <ul className="team-state__update-list">
        {project.updates.map((item, i) => <li key={i}>{item}</li>)}
      </ul> : <p className="team-state__muted">未能识别出最新组会中的实际进展。</p>}
      {project.blocker && <div className="team-state__note">
        <strong><Icon icon={alertTriangle} aria-hidden="true" />组会记录的问题</strong><p>{project.blocker}</p>
      </div>}
      {project.nextAction && <div className="team-state__note">
        <strong><Icon icon={clock} aria-hidden="true" />组会记录的下一步</strong><p>{project.nextAction}</p>
      </div>}
      {project.meetingExcerpt && <details className="team-state__expand">
        <summary>查看最新组会摘录</summary>
        <p className="team-state__meeting-text">{project.meetingExcerpt}</p>
      </details>}
    </div>

    <details className="team-state__panel team-state__expand">
      <summary>全部已录入任务（{project.tasksLoaded ? project.tasks.length + " 项" : "不可读取"}）</summary>
      {project.tasksLoaded ? <div className="team-state__task-list">
        {project.tasks.length === 0 && <p className="team-state__muted">当前未登记关联任务。</p>}
        {[...project.tasks].sort((a, b) => Number(a.status === "已完成") - Number(b.status === "已完成")).map((task) =>
          <div key={task.id} className="team-state__task">
            <div><strong>{task.title}</strong><span className={task.status === "已停滞" ? "team-state__stalled" : "team-state__muted"}>{task.status || "未标记"}</span></div>
            <small>{task.assignees.join("、") || "执行人未识别"} · 截止：{dateText(task.due)}</small>
            {task.completedAt && <small>实际完成：{dateText(task.completedAt)}</small>}
            {task.status === "已完成" && !task.completedAt && <small>实际完成日期未记录</small>}
          </div>,
        )}
      </div> : <p className="team-state__muted">无法读取任务状态，请查看飞书原始来源。</p>}
      <SourceLink url={project.url}>查看飞书任务表</SourceLink>
    </details>
  </section>;
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
    let inFlight = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const load = async (force = false) => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const path = force ? "/api/admin/team-state?refresh=1" : "/api/admin/team-state";
        const data = await apiRequest<Snapshot>(path, { signal: controller.signal, cache: "no-store" });
        if (controller.signal.aborted) return;
        setSnapshot(data);
        setSelectedID((previous) => data.projects.some((p) => p.id === previous) ? previous : "");
        setError("");
        if (data.refreshing) refreshTimer = setTimeout(() => void load(), 3000);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "读取技术研发进度失败");
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    setLoading(true);
    void load(version > 0);
    // Reading the cached snapshot is inexpensive; the server deduplicates Feishu refreshes.
    const interval = setInterval(() => { if (!document.hidden) void load(); }, 60000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [currentUser.id, currentUser.role.name, version]);

  if (currentUser.role.name !== "super_admin") {
    return <div className="admin-design"><div role="alert" className="admin-alert admin-alert--error">仅超级管理员可查看技术研发总览。</div></div>;
  }

  const current = snapshot?.projects.find((p) => p.id === selectedID);
  const summary = snapshot?.summary;
  const pending = summary ? summary.inProgress + summary.notStarted : null;

  return <main className="admin-design team-state">
    <header className="admin-page-header team-state__header">
      <div>
        <h1 className="admin-page-title">技术研发总览</h1>
        {snapshot && <p className="team-state__muted">2027 赛季 · 数据更新于 {new Date(snapshot.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}{snapshot.refreshing ? " · 正在后台同步" : ""}</p>}
      </div>
      <button className="team-state__refresh" type="button" disabled={loading} onClick={() => setVersion((n) => n + 1)}>{loading ? "读取中" : "刷新"}</button>
    </header>

    {error && <div role="alert" className="admin-alert admin-alert--error">{error}</div>}
    {loading && !snapshot && <TeamStateSkeleton />}
    {snapshot && <>
      {snapshot.sources.filter((s) => s.status === "unavailable").map((s) => <div key={s.name} className="team-state__access">
        <strong>{s.name}不可读取</strong><span>{s.detail}</span>
        {s.setupUrl && <SourceLink url={s.setupUrl}>开通飞书权限</SourceLink>}
        <SourceLink url={s.url}>原始来源</SourceLink>
      </div>)}
      {current ? <ProjectDetail project={current} onBack={() => setSelectedID("")} /> : <>
        <section aria-label="技术研发任务总体进度" className="team-state__overview">
          <div className="team-state__stats">
            <div className="team-state__stat">
              <span><Icon icon={checkCircle} aria-hidden="true" />已录入任务完成</span>
              <strong>{summary && summary.total > 0 ? `${percent(summary.completed, summary.total)}%` : "—"}</strong>
              <small>{summary ? `${summary.completed} / ${summary.total} 条任务` : "任务数据暂不可读取"}</small>
            </div>
            <div className="team-state__stat">
              <span><Icon icon={clock} aria-hidden="true" />进行中 / 未开始</span>
              <strong>{pending ?? "—"}</strong>
              <small>{summary ? `进行中 ${summary.inProgress} · 未开始 ${summary.notStarted}` : "任务数据暂不可读取"}</small>
            </div>
            <div className="team-state__stat">
              <span><Icon icon={alertTriangle} aria-hidden="true" />已停滞任务</span>
              <strong>{summary?.stalled ?? "—"}</strong>
              <small>{summary ? `6 个兵种 · ${summary.missingCompletedDate} 项完成日期缺失` : "任务数据暂不可读取"}</small>
            </div>
          </div>
          {summary && summary.total > 0 && <div className="team-state__overall-bar">
            <div role="progressbar" aria-label="六兵种已录入任务完成率" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={percent(summary.completed, summary.total)}
              aria-valuetext={`${summary.completed} / ${summary.total} 条任务`}>
              <div style={{ width: `${percent(summary.completed, summary.total)}%` }} />
            </div>
            <p>统计范围：六个兵种当前录入飞书的任务。比例不代表赛季研发完成度。</p>
          </div>}
        </section>

        <section className="team-state__panel">
          <div className="team-state__section-head">
            <h2>各兵种推进情况</h2>
            <SourceLink url={snapshot.sources.find((s) => s.name === "飞书项目任务")?.url}>任务数据来源</SourceLink>
          </div>
          <div className="team-state__project-grid">
            {snapshot.projects.map((p) => <ProjectCard key={p.id} project={p} onSelect={() => setSelectedID(p.id)} />)}
          </div>
          {snapshot.projects.length === 0 && <p className="team-state__muted">未找到六个兵种的项目记录。</p>}
        </section>
      </>}

      <details className="team-state__sources">
        <summary>查看数据来源状态</summary>
        <ul>{snapshot.sources.map((s) => <li key={s.name}>
          <span>{s.name} · {s.status === "available" ? "已读取" : s.status === "partial" ? "部分读取" : "不可读取"}</span>
          {s.detail && <span>{s.detail}</span>}
          <SourceLink url={s.url}>打开来源</SourceLink>
        </li>)}</ul>
      </details>
    </>}
  </main>;
}
