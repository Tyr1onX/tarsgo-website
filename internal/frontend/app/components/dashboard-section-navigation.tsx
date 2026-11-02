import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import {
  getDashboardSectionKey,
  getMyWorkbenchMenu,
  getVisibleAdminDashboardMenu,
  isDashboardMenuPathActive,
} from "~/lib/dashboard-navigation";
import type { AuthUser } from "~/lib/auth-client";

type Props = {
  currentUser: AuthUser;
  hasAssignmentGroup: boolean;
  candidateTodoCount: number | null;
  leaveActionableCount: number | null;
  collapsed: boolean;
  onNavigate: () => void;
};

export function DashboardSectionNavigation({
  currentUser,
  hasAssignmentGroup,
  candidateTodoCount,
  leaveActionableCount,
  collapsed,
  onNavigate,
}: Props) {
  const location = useLocation();
  const section = getDashboardSectionKey(location.pathname, location.search, currentUser.role.name, location.hash);
  const groups = section === "workbench"
    ? getMyWorkbenchMenu(currentUser, hasAssignmentGroup)
    : section === "management"
      ? getVisibleAdminDashboardMenu(currentUser, hasAssignmentGroup)
      : [];
  const activeGroup = groups.find(({ children }) => children.some((item) => isDashboardMenuPathActive(location.pathname, item.href)))?.key ?? null;
  const [expandedAdminGroup, setExpandedAdminGroup] = useState<string | null>(activeGroup);

  useEffect(() => {
    if (section === "management") setExpandedAdminGroup(activeGroup);
  }, [activeGroup, section]);

  if (collapsed || groups.length === 0) return null;

  return (
    <div className="dashboard-subnav" role="group" aria-label={section === "workbench" ? "工作台功能" : "管理功能"} data-section={section}>
      {groups.map((group) => {
        const isWorkbench = section === "workbench";
        const isExpanded = isWorkbench || expandedAdminGroup === group.key;
        return (
          <section className="dashboard-subnav__group" key={group.key} aria-label={group.label}>
            {isWorkbench ? (
              <h2 className="dashboard-subnav__heading">{group.label}</h2>
            ) : (
              <button
                type="button"
                className="dashboard-subnav__heading dashboard-subnav__heading-button"
                aria-expanded={isExpanded}
                onClick={() => setExpandedAdminGroup((current) => current === group.key ? null : group.key)}
              >
                <span>{group.label}</span>
                <span className="dashboard-subnav__chevron" aria-hidden="true">{isExpanded ? "−" : "+"}</span>
              </button>
            )}
            {isExpanded ? (
              <div className="dashboard-subnav__links">
                {group.children.map((item) => {
                  const targetPath = item.href.split(/[?#]/, 1)[0];
                  const isActive = item.key === "timetable"
                    ? location.pathname === targetPath && new URLSearchParams(location.search).get("tab") === "settings" && location.hash === "#timetable"
                    : isDashboardMenuPathActive(location.pathname, targetPath);
                  const badgeCount = item.key === "candidate-processing" ? candidateTodoCount
                    : item.key === "leave-workbench" && section === "management" ? leaveActionableCount
                      : null;
                  const badgeLabel = item.key === "leave-workbench" ? "请假待处理事项" : "待处理报名";
                  return (
                    <Link
                      key={item.key}
                      to={item.href}
                      prefetch={item.key === "candidate-processing" ? "render" : "intent"}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={`dashboard-subnav__link${isActive ? " is-active" : ""}`}
                    >
                      <span>{item.label}</span>
                      {(badgeCount ?? 0) > 0 ? <span className="dashboard-nav-badge" aria-label={`${badgeCount} 项${badgeLabel}`}>{badgeCount}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
