import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { getUnifiedDashboardMenu, isDashboardMenuPathActive } from "~/lib/dashboard-navigation";
import type { AuthUser } from "~/lib/auth-client";
import type { DashboardTaskCounts } from "~/components/dashboard-steady-ui";

type Props = {
  currentUser: AuthUser;
  hasAssignmentGroup: boolean;
  counts: DashboardTaskCounts;
  onNavigate: () => void;
};

export function DashboardSectionNavigation({
  currentUser,
  hasAssignmentGroup,
  counts,
  onNavigate,
}: Props) {
  const location = useLocation();
  const groups = getUnifiedDashboardMenu(currentUser, hasAssignmentGroup);
  const activeGroup = groups.find(({ children }) =>
    children.some((item) => isDashboardMenuPathActive(location.pathname, item.href)));
  const canManage = currentUser.role.name === "admin" || currentUser.role.name === "super_admin";
  const defaultExpandedGroup = activeGroup?.key ?? (canManage ? groups.find((group) => group.key !== "daily-work")?.key : groups[0]?.key) ?? null;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(defaultExpandedGroup);

  useEffect(() => {
    setExpandedGroup(defaultExpandedGroup);
  }, [defaultExpandedGroup]);

  if (groups.length === 0) return null;

  const reviewTotal = counts.reviewCount ?? 0;

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
                    : item.href;
                  return <Link key={item.key}
                      to={target}
                      prefetch={item.key === "candidate-processing" ? "render" : "intent"}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={`dashboard-subnav__link${isActive ? " is-active" : ""}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {count !== null && count > 0 ? <span className="dashboard-nav-badge shrink-0" aria-label={`待处理 ${count}`}>{count}</span> : null}
                    </Link>;
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}