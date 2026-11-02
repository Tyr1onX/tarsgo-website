import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { assignmentClient } from "~/lib/assignment-client";
import { hasAssignmentGroupAccess } from "~/lib/dashboard-navigation";
import { leaveClient } from "~/lib/leave-client";
import { getAdminWorkbenchSummary, type AdminWorkbenchSummaryResponse } from "~/lib/registrations-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [{ title: "管理工作台 | TARSGO" }];
}

type WorkbenchState = {
  recruitment: AdminWorkbenchSummaryResponse | null;
  assignmentReviewCount: number | null;
  leaveActionableCount: number | null;
  errors: string[];
};

const emptyState: WorkbenchState = {
  recruitment: null,
  assignmentReviewCount: null,
  leaveActionableCount: null,
  errors: [],
};

function describeError(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export default function AdminDashboard() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const canManageAssignments = currentUser.role.name === "super_admin" || hasAssignmentGroupAccess(groupResolution?.groups);
  const [state, setState] = useState<WorkbenchState>(emptyState);
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    const [recruitment, assignments, leave] = await Promise.allSettled([
      getAdminWorkbenchSummary(currentUser.id),
      canManageAssignments ? assignmentClient.listAdmin() : Promise.resolve(null),
      leaveClient.schoolSummary(),
    ]);
    if (requestSequence.current !== requestId) return;

    const next: WorkbenchState = { ...emptyState, errors: [] };
    if (recruitment.status === "fulfilled") next.recruitment = recruitment.value;
    else next.errors.push(describeError(recruitment.reason, "招新待办暂时无法读取。"));
    if (assignments.status === "fulfilled" && assignments.value) {
      next.assignmentReviewCount = assignments.value
        .filter((assignment) => assignment.publicationStatus !== "withdrawn")
        .reduce((total, assignment) => total + Math.max(0, assignment.submittedCount - assignment.reviewedCount), 0);
    } else if (assignments.status === "rejected") next.errors.push(describeError(assignments.reason, "作业批改待办暂时无法读取。"));
    if (leave.status === "fulfilled") next.leaveActionableCount = leave.value.actionableCount;
    else next.errors.push(describeError(leave.reason, "请假待办暂时无法读取。"));
    setState(next);
    setLoading(false);
  }, [canManageAssignments, currentUser.id]);

  useEffect(() => {
    setState(emptyState);
    void load();
  }, [load]);

  const pendingScreening = state.recruitment?.currentFormAvailable ? state.recruitment.summary.pendingScreening : 0;
  const pendingInterview = state.recruitment?.currentFormAvailable ? state.recruitment.summary.pendingInterview : 0;
  const hasTodos = pendingScreening > 0 || pendingInterview > 0 || (state.assignmentReviewCount ?? 0) > 0 || (state.leaveActionableCount ?? 0) > 0;

  return (
    <main className="admin-design admin-workbench" aria-labelledby="admin-workbench-title">
      <div className="admin-workbench__content">
        <header className="admin-workbench__header">
          <h1 id="admin-workbench-title" className="admin-workbench__title">管理工作台</h1>
          {!loading && state.errors.length > 0 ? <button type="button" className="admin-button admin-button--quiet" onClick={() => void load()}>重试</button> : null}
        </header>

        <section className="admin-workbench__todos" aria-labelledby="admin-workbench-todos-title">
          <h2 id="admin-workbench-todos-title">待处理事项</h2>
          {loading ? <p className="admin-workbench__state" role="status">正在检查待办…</p> : null}
          {!loading && state.errors.length > 0 ? <p className="admin-workbench__read-error" role="status">{state.errors.join("；")}</p> : null}
          {!loading && state.errors.length === 0 && !hasTodos ? <p className="admin-workbench__state">目前没有待处理事项。</p> : null}
          {hasTodos ? <div className="admin-workbench__todo-list">
            {pendingScreening > 0 ? <Link className="admin-workbench__todo" to="/dashboard/admin/registrations?status=pending_screening">
              <span><strong>候选人待初筛</strong><small>招新</small></span><b>{pendingScreening}</b>
            </Link> : null}
            {pendingInterview > 0 ? <Link className="admin-workbench__todo" to="/dashboard/admin/registrations?view=interviews">
              <span><strong>候选人待面试</strong><small>招新</small></span><b>{pendingInterview}</b>
            </Link> : null}
            {(state.assignmentReviewCount ?? 0) > 0 ? <Link className="admin-workbench__todo" to="/dashboard/admin/training/submissions">
              <span><strong>作业待批改</strong><small>成员与培养</small></span><b>{state.assignmentReviewCount}</b>
            </Link> : null}
            {(state.leaveActionableCount ?? 0) > 0 ? <Link className="admin-workbench__todo" to="/dashboard/leave">
              <span><strong>请假事项待处理</strong><small>协作与运营</small></span><b>{state.leaveActionableCount}</b>
            </Link> : null}
          </div> : null}
        </section>
      </div>
    </main>
  );
}
