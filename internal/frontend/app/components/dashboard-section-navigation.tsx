import { Fragment, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { assignmentClient } from "~/lib/assignment-client";
import { getUnifiedDashboardMenu, hasWorkbenchAccess, isDashboardMenuPathActive } from "~/lib/dashboard-navigation";
import { getAdminWorkbenchSummary } from "~/lib/registrations-client";
import { getWeeklyReportStatus } from "~/lib/weekly-report-client";
import type { AuthUser } from "~/lib/auth-client";

type ReviewGroup = { groupId: number; groupName: string; reviewCount: number };
type TaskCounts = {
  scope: string;
  weeklyPending: boolean | null;
  assignmentCount: number | null;
  recruitmentCount: number | null;
  recruitmentTarget: string;
  reviewGroups: ReviewGroup[] | null;
};

type Props = {
  currentUser: AuthUser;
  hasAssignmentGroup: boolean;
  permissionsKey: string;
  visible: boolean;
  onNavigate: () => void;
};

function emptyCounts(scope: string): TaskCounts {
  return {
    scope, weeklyPending: null, assignmentCount: null, recruitmentCount: null,
    recruitmentTarget: "/dashboard/admin/registrations", reviewGroups: null,
  };
}

export function DashboardSectionNavigation({
  currentUser,
  hasAssignmentGroup,
  permissionsKey,
  visible,
  onNavigate,
}: Props) {
  const location = useLocation();
  const groups = getUnifiedDashboardMenu(currentUser, hasAssignmentGroup);
  const activeGroup = groups.find(({ children }) =>
    children.some((item) => isDashboardMenuPathActive(location.pathname, item.href)));
  const defaultExpandedGroup = activeGroup?.key ?? groups[0]?.key ?? null;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(defaultExpandedGroup);
  const scope = JSON.stringify([currentUser.id, currentUser.role.name, currentUser.workbenchAccess, permissionsKey]);
  const [taskCounts, setTaskCounts] = useState<TaskCounts>(() => emptyCounts(scope));
  const counts = taskCounts.scope === scope ? taskCounts : emptyCounts(scope);
  const canManage = currentUser.role.name === "admin" || currentUser.role.name === "super_admin";
  const canReview = currentUser.role.name === "super_admin" || (canManage && hasAssignmentGroup);

  useEffect(() => {
    setExpandedGroup(defaultExpandedGroup);
  }, [defaultExpandedGroup]);

  // Task indicators refresh on business navigation, without blocking the page.
  // Ignore late responses when the account or its permissions change.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    const update = (patch: Partial<TaskCounts>) => {
      if (active) setTaskCounts((previous) => ({ ...(previous.scope === scope ? previous : emptyCounts(scope)), ...patch }));
    };
    if (hasWorkbenchAccess(currentUser)) {
      void getWeeklyReportStatus()
        .then((value) => update({ weeklyPending: !value.submitted }))
        .catch(() => update({ weeklyPending: null }));
      if (hasAssignmentGroup) {
        void assignmentClient.listTodos()
          .then((items) => update({ assignmentCount: items.filter((item) =>
            item.status === "pending" || item.status === "overdue" || item.status === "needs_redo").length }))
          .catch(() => update({ assignmentCount: null }));
      }
    }
    if (canManage) {
      void getAdminWorkbenchSummary(currentUser.id)
        .then((value) => {
          const screening = value.currentFormAvailable ? value.summary.pendingScreening : 0;
          const interview = value.currentFormAvailable ? value.summary.pendingInterview : 0;
          update({
            recruitmentCount: screening + interview,
            recruitmentTarget: screening > 0 && !interview
              ? "/dashboard/admin/registrations?status=pending_screening"
              : interview > 0 && !screening ? "/dashboard/admin/registrations?view=interviews" : "/dashboard/admin/registrations",
          });
        })
        .catch(() => update({ recruitmentCount: null }));
      if (canReview) {
        void assignmentClient.adminTodos()
          .then((value) => update({ reviewGroups: value.groups }))
          .catch(() => update({ reviewGroups: null }));
      }
    }
    return () => { active = false; };
  }, [scope, location.pathname, visible, canManage, canReview, hasAssignmentGroup, currentUser.id]);

  if (groups.length === 0) return null;

  const reviewGroups = counts.reviewGroups?.filter((item) => item.reviewCount > 0)
    .sort((left, right) => right.reviewCount - left.reviewCount) ?? [];
  const reviewTotal = reviewGroups.reduce((total, group) => total + group.reviewCount, 0);

  return (
    <div className="dashboard-subnav" role="group" aria-label="业务功能">
      {groups.map((group) => {
        const isExpanded = expandedGroup === group.key;
        const groupCount = group.key === "daily-work"
          ? (counts.weeklyPending ? 1 : 0) + (counts.assignmentCount ?? 0)
          : group.key === "members-training" ? reviewTotal
          : group.key === "recruitment" ? counts.recruitmentCount ?? 0 : 0;
        return (
          <section className="dashboard-subnav__group" key={group.key} aria-label={group.label}>
            <button
              type="button"
              className="dashboard-subnav__heading dashboard-subnav__heading-button"
              aria-expanded={isExpanded}
              aria-controls={`dashboard-subnav-${group.key}`}
              onClick={() => setExpandedGroup((current) => current === group.key ? null : group.key)}
            >
              <span>{group.label}</span>
              {!isExpanded && groupCount > 0 ? <span className="dashboard-nav-badge ml-auto" aria-label={`待处理 ${groupCount}`}>{groupCount}</span> : null}
              <span className="dashboard-subnav__chevron" aria-hidden="true">{isExpanded ? "−" : "+"}</span>
            </button>
            {isExpanded ? (
              <div id={`dashboard-subnav-${group.key}`} className="dashboard-subnav__links">
                {group.children.map((item) => {
                  const isActive = isDashboardMenuPathActive(location.pathname, item.href);
                  const count = item.key === "weekly-reports" ? (counts.weeklyPending ? 1 : 0)
                    : item.key === "my-assignments" ? counts.assignmentCount
                    : item.key === "candidate-processing" ? counts.recruitmentCount
                    : item.key === "assignment-management" ? reviewTotal : null;
                  const target = item.key === "weekly-reports" && counts.weeklyPending ? item.href + "?edit=1"
                    : item.key === "candidate-processing" ? counts.recruitmentTarget
                    : item.key === "assignment-management" && reviewGroups.length === 1
                      ? item.href + "?view=review&groupId=" + reviewGroups[0].groupId : item.href;
                  return <Fragment key={item.key}>
                    <Link
                      to={target}
                      prefetch={item.key === "candidate-processing" ? "render" : "intent"}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={`dashboard-subnav__link${isActive ? " is-active" : ""}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {count !== null && count > 0 ? <span className="dashboard-nav-badge shrink-0" aria-label={`待处理 ${count}`}>{count}</span> : null}
                    </Link>
                    {item.key === "assignment-management" && reviewGroups.length > 1 ? <div className="space-y-0.5 pl-4" aria-label="按技术组批改">
                      {reviewGroups.map((reviewGroup) => <Link key={reviewGroup.groupId}
                        to={`/dashboard/admin/training/assignments?view=review&groupId=${reviewGroup.groupId}`}
                        onClick={onNavigate}
                        className="dashboard-subnav__link text-xs"
                        aria-label={`${reviewGroup.groupName}待批改 ${reviewGroup.reviewCount}`}>
                        <span className="min-w-0 flex-1 truncate">{reviewGroup.groupName}</span>
                        <span className="shrink-0 tabular-nums text-[var(--admin-muted)]">{reviewGroup.reviewCount}</span>
                      </Link>)}
                    </div> : null}
                  </Fragment>;
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
