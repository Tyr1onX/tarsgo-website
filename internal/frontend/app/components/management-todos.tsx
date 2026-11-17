import { BrandLoader } from "~/components/brand-loader";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { emptyAdminWorkbenchState, loadAdminWorkbench } from "~/lib/admin-workbench-loader";
import { assignmentClient } from "~/lib/assignment-client";
import { hasAssignmentGroupAccess } from "~/lib/dashboard-navigation";
import { getAdminWorkbenchSummary } from "~/lib/registrations-client";
import { getAdminWorkbenchSnapshot, rememberAdminWorkbenchSnapshot } from "~/lib/personal-workbench-cache";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function ManagementTodos({ showEmpty = false }: { showEmpty?: boolean }) {
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
  const reviewCount = state.assignmentReviewCount ?? 0;
  const hasTodos = pendingScreening > 0 || pendingInterview > 0 || reviewCount > 0;

  if (!loading && errors.length === 0 && !hasTodos && !showEmpty) return null;

  return (
    <section className="personal-workbench__tasks personal-workbench__management" aria-labelledby="management-todos-title">
      <div className="personal-workbench__section-heading">
        <h2 id="management-todos-title">管理待办</h2>
        {errors.length > 0 ? <button type="button" className="personal-workbench__retry" onClick={() => void load()}>重试</button> : null}
      </div>
      {loading && state.recruitment === null && state.assignmentReviewCount === null ? <BrandLoader label="正在检查管理待办" size="sm" /> : null}
      {errors.length > 0 ? <p className="personal-workbench__management-error" role="status">{errors.join("；")}</p> : null}
      {!loading && errors.length === 0 && !hasTodos && showEmpty ? <p className="personal-workbench__empty">当前没有管理待办。</p> : null}
      {hasTodos ? <ul className="personal-workbench__task-list">
        {pendingScreening > 0 ? <li className="personal-workbench__task">
          <span className="personal-workbench__priority is-review" aria-hidden="true" />
          <Link to="/dashboard/admin/registrations?status=pending_screening"><span className="personal-workbench__task-title">候选人待初筛</span><span className="personal-workbench__task-status">招新</span></Link>
          <strong className="personal-workbench__task-count">{pendingScreening}</strong>
        </li> : null}
        {pendingInterview > 0 ? <li className="personal-workbench__task">
          <span className="personal-workbench__priority is-review" aria-hidden="true" />
          <Link to="/dashboard/admin/registrations?view=interviews"><span className="personal-workbench__task-title">候选人待面试</span><span className="personal-workbench__task-status">招新</span></Link>
          <strong className="personal-workbench__task-count">{pendingInterview}</strong>
        </li> : null}
        {reviewCount > 0 ? <li className="personal-workbench__task">
          <span className="personal-workbench__priority is-review" aria-hidden="true" />
          <Link to="/dashboard/admin/training/assignments?view=review"><span className="personal-workbench__task-title">作业待批改</span><span className="personal-workbench__task-status">成员与培养</span></Link>
          <strong className="personal-workbench__task-count">{reviewCount}</strong>
        </li> : null}
      </ul> : null}
    </section>
  );
}
