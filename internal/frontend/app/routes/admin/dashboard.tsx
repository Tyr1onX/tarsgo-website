import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { emptyAdminWorkbenchState, loadAdminWorkbench } from "~/lib/admin-workbench-loader";
import { assignmentClient } from "~/lib/assignment-client";
import { hasAssignmentGroupAccess } from "~/lib/dashboard-navigation";
import { getAdminWorkbenchSummary } from "~/lib/registrations-client";
import { getAdminWorkbenchSnapshot, rememberAdminWorkbenchSnapshot } from "~/lib/personal-workbench-cache";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [{ title: "管理工作台 | TARSGO" }];
}

export default function AdminDashboard() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const canManageAssignments = currentUser.role.name === "super_admin" || hasAssignmentGroupAccess(groupResolution?.groups);
  const scope = JSON.stringify([currentUser.id, currentUser.role.name, canManageAssignments]);
  const [result, setResult] = useState(() => ({
    scope, state: getAdminWorkbenchSnapshot(scope) ?? emptyAdminWorkbenchState, loading: true,
  }));
  const state = result.scope === scope ? result.state : getAdminWorkbenchSnapshot(scope) ?? emptyAdminWorkbenchState;
  const loading = result.scope !== scope || result.loading;
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const previous = getAdminWorkbenchSnapshot(scope) ?? emptyAdminWorkbenchState;
    setResult({ scope, state: previous, loading: true });
    await loadAdminWorkbench(
      getAdminWorkbenchSummary(currentUser.id),
      canManageAssignments ? assignmentClient.adminTodos() : null,
      (next, pending) => {
        if (requestSequence.current !== requestId) return;
        rememberAdminWorkbenchSnapshot(scope, next);
        setResult({ scope, state: next, loading: pending > 0 });
      },
      previous,
    );
  }, [canManageAssignments, currentUser.id, scope]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  const errors = Object.values(state.errors);
  const pendingScreening = state.recruitment?.currentFormAvailable ? state.recruitment.summary.pendingScreening : 0;
  const pendingInterview = state.recruitment?.currentFormAvailable ? state.recruitment.summary.pendingInterview : 0;
  const hasTodos = pendingScreening > 0 || pendingInterview > 0 || (state.assignmentReviewCount ?? 0) > 0;

  return (
    <main className="admin-design admin-workbench" aria-labelledby="admin-workbench-title">
      <div className="admin-workbench__content">
        <header className="admin-workbench__header">
          <h1 id="admin-workbench-title" className="admin-workbench__title">管理工作台</h1>
          {errors.length > 0 ? <button type="button" className="admin-button admin-button--quiet" onClick={() => void load()}>重试</button> : null}
        </header>

        <section className="admin-workbench__todos" aria-labelledby="admin-workbench-todos-title">
          <h2 id="admin-workbench-todos-title">待处理事项</h2>
          {loading && state.recruitment === null && state.assignmentReviewCount === null ? <p className="admin-workbench__state" role="status">正在检查待办…</p> : null}
          {errors.length > 0 ? <p className="admin-workbench__read-error" role="status">{errors.join("；")}</p> : null}
          {!loading && errors.length === 0 && !hasTodos ? <p className="admin-workbench__state">目前没有待处理事项。</p> : null}
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

          </div> : null}
        </section>
      </div>
    </main>
  );
}
