import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { assignmentClient, assignmentStatusLabel, formatAssignmentDate, type Assignment } from "~/lib/assignment-client";
import { hasAssignmentGroupAccess } from "~/lib/dashboard-navigation";
import { leaveClient, type LeaveAccessState, type LeaveRequest } from "~/lib/leave-client";
import { formatWeekLabel } from "~/lib/weekly-report-calendar";
import { getWeeklyReportDashboard, type WeeklyReportDashboard } from "~/lib/weekly-report-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./workbench.css";

export function meta() {
  return [{ title: "我的工作台 | TARSGO" }];
}

type PersonalSnapshot = {
  weekly: WeeklyReportDashboard | null;
  assignments: Assignment[] | null;
  leaveAccess: LeaveAccessState | null;
  leaveRequests: LeaveRequest[] | null;
  errors: { weekly?: string; assignments?: string; leave?: string };
};

const emptySnapshot: PersonalSnapshot = {
  weekly: null,
  assignments: null,
  leaveAccess: null,
  leaveRequests: null,
  errors: {},
};

function getLeaveStatus(access: LeaveAccessState | null, requests: LeaveRequest[] | null, isAdmin: boolean) {
  const latest = requests?.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (latest) {
    const labels: Record<string, string> = {
      pending: "待汇总",
      included: "已纳入汇总",
      withdrawn: "已撤回",
    };
    return labels[latest.status] ?? latest.status;
  }
  if (isAdmin) return "可办理请假事项";
  if (access?.status === "approved") return "请假功能已开通";
  if (access?.status === "pending") return "开通申请审核中";
  if (access?.status === "rejected") return "开通申请未通过";
  if (access?.status === "not_requested") return "尚未开通";
  return "状态暂不可用";
}

export default function PersonalWorkbench() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const hasAssignments = hasAssignmentGroupAccess(groupResolution?.groups);
  const isAdmin = currentUser.role.name === "admin" || currentUser.role.name === "super_admin";
  const [snapshot, setSnapshot] = useState<PersonalSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    const leaveRequest = leaveClient.leaveAccess().then(async (access) => ({
      access,
      requests: access.status === "approved" || isAdmin ? await leaveClient.schoolRequests() : [],
    }));
    const [weekly, assignments, leave] = await Promise.allSettled([
      getWeeklyReportDashboard(),
      hasAssignments ? assignmentClient.listMine() : Promise.resolve([]),
      leaveRequest,
    ]);
    if (requestSequence.current !== requestId) return;

    const next: PersonalSnapshot = { ...emptySnapshot };
    if (weekly.status === "fulfilled") next.weekly = weekly.value;
    else next.errors.weekly = weekly.reason instanceof Error ? weekly.reason.message : "周报状态暂时无法读取。";
    if (assignments.status === "fulfilled") next.assignments = assignments.value;
    else next.errors.assignments = assignments.reason instanceof Error ? assignments.reason.message : "作业状态暂时无法读取。";
    if (leave.status === "fulfilled") {
      next.leaveAccess = leave.value.access;
      next.leaveRequests = leave.value.requests;
    } else next.errors.leave = leave.reason instanceof Error ? leave.reason.message : "请假状态暂时无法读取。";
    setSnapshot(next);
    setLoading(false);
  }, [hasAssignments, isAdmin]);

  useEffect(() => {
    setSnapshot(emptySnapshot);
    void load();
  }, [currentUser.id, load]);

  const currentReport = snapshot.weekly?.reports.find((report) => report.weekStart === snapshot.weekly?.currentWeekStart) ?? null;
  const assignmentTodos = (snapshot.assignments ?? []).filter((assignment) => ["pending", "overdue", "needs_redo"].includes(assignment.status ?? ""));
  const overdueAssignments = assignmentTodos.filter(({ status }) => status === "overdue").length;
  const hasErrors = Object.values(snapshot.errors).some(Boolean);

  return (
    <main className="personal-workbench admin-design" aria-labelledby="personal-workbench-title">
      <header className="personal-workbench__header">
        <h1 id="personal-workbench-title">我的工作台</h1>
        {!loading && hasErrors ? <button type="button" className="personal-workbench__retry" onClick={() => void load()}>重试</button> : null}
      </header>

      {loading ? <p className="personal-workbench__loading" role="status">正在读取个人事务状态…</p> : null}

      <div className="personal-workbench__grid">
        <section className="personal-workbench__card" aria-labelledby="personal-weekly-title">
          <div className="personal-workbench__card-head">
            <div>
              <h2 id="personal-weekly-title">工作周报</h2>
              <p>{snapshot.weekly ? formatWeekLabel(snapshot.weekly.currentWeekStart) : "本周"}</p>
            </div>
            <span className={`personal-workbench__status${currentReport ? " is-complete" : " is-action"}`}>
              {loading ? "读取中" : snapshot.errors.weekly ? "状态未知" : currentReport ? "已提交" : "待填写"}
            </span>
          </div>
          {snapshot.errors.weekly ? <p className="personal-workbench__error" role="status">{snapshot.errors.weekly}</p> : null}
          {snapshot.weekly ? <p className="personal-workbench__detail">{snapshot.weekly.reports.length ? `已有 ${snapshot.weekly.reports.length} 篇周报记录` : "暂无历史记录"}</p> : null}
          {!loading ? <div className="personal-workbench__actions">
            <Link className="admin-button admin-button--primary" to={currentReport ? "/dashboard/weekly-reports" : "/dashboard/weekly-reports?edit=1"}>
              {currentReport ? "查看本周周报" : "填写周报"}
            </Link>
            {currentReport ? <Link className="personal-workbench__text-link" to="/dashboard/weekly-reports?edit=1">修改</Link> : null}
          </div> : null}
        </section>

        {hasAssignments ? (
          <section className="personal-workbench__card" aria-labelledby="personal-assignments-title">
            <div className="personal-workbench__card-head">
              <div>
                <h2 id="personal-assignments-title">我的作业</h2>
                <p>{snapshot.assignments ? `${assignmentTodos.length} 项待处理` : "个人提交"}</p>
              </div>
              {loading ? <span className="personal-workbench__status">读取中</span> : snapshot.errors.assignments ? <span className="personal-workbench__status">状态未知</span> : snapshot.assignments ? (
                <span className={`personal-workbench__status${assignmentTodos.length ? " is-action" : " is-complete"}`}>
                  {overdueAssignments ? `${overdueAssignments} 项逾期` : assignmentTodos.length ? "待处理" : "已完成"}
                </span>
              ) : null}
            </div>
            {snapshot.errors.assignments ? <p className="personal-workbench__error" role="status">{snapshot.errors.assignments}</p> : null}
            {snapshot.assignments ? assignmentTodos.length ? (
              <ul className="personal-workbench__assignment-list">
                {assignmentTodos.slice(0, 3).map((assignment) => (
                  <li key={assignment.id}>
                    <Link to={`/dashboard/assignments?assignmentId=${assignment.id}`}>
                      <span>{assignment.title}</span>
                      <span>{assignmentStatusLabel(assignment.status)}</span>
                    </Link>
                    <time dateTime={assignment.dueAt}>{formatAssignmentDate(assignment.dueAt)}</time>
                  </li>
                ))}
              </ul>
            ) : <p className="personal-workbench__detail">目前没有待处理作业。</p> : null}
            {!loading ? <div className="personal-workbench__actions">
              <Link className="admin-button admin-button--secondary" to="/dashboard/assignments">查看作业</Link>
            </div> : null}
          </section>
        ) : null}

        <section className="personal-workbench__card" aria-labelledby="personal-leave-title">
          <div className="personal-workbench__card-head">
            <div>
              <h2 id="personal-leave-title">请假事务</h2>
              <p>个人申请与请假条</p>
            </div>
            <span className={`personal-workbench__status${snapshot.leaveAccess?.status === "approved" ? " is-complete" : snapshot.leaveAccess ? " is-action" : ""}`}>
              {loading ? "读取中" : snapshot.errors.leave ? "状态未知" : getLeaveStatus(snapshot.leaveAccess, snapshot.leaveRequests, isAdmin)}
            </span>
          </div>
          {snapshot.errors.leave ? <p className="personal-workbench__error" role="status">{snapshot.errors.leave}</p> : null}
          <div className="personal-workbench__actions">
            <Link className="admin-button admin-button--secondary" to="/dashboard/leave">打开请假事务</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
