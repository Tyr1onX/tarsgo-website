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
  compact: boolean;
  onNavigate: () => void;
};

export function DashboardSectionNavigation({
  currentUser,
  hasAssignmentGroup,
  compact,
  onNavigate,
}: Props) {
  const location = useLocation();
  const section = getDashboardSectionKey(location.pathname, currentUser.role.name, currentUser.id);
  const groups = section === "workbench"
    ? getMyWorkbenchMenu(currentUser, hasAssignmentGroup)
    : section === "management"
      ? getVisibleAdminDashboardMenu(currentUser, hasAssignmentGroup)
      : [];
  const activeGroup = groups.find(({ children }) => children.some((item) => isDashboardMenuPathActive(location.pathname, item.href)))?.key ?? null;
  const defaultExpandedGroup = activeGroup ?? (section === "workbench" ? groups[0]?.key ?? null : null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(defaultExpandedGroup);

  useEffect(() => {
    setExpandedGroup(defaultExpandedGroup);
  }, [defaultExpandedGroup]);

  if (compact || groups.length === 0) return null;

  return (
    <div className="dashboard-subnav" role="group" aria-label={section === "workbench" ? "工作台功能" : "管理功能"} data-section={section}>
      {groups.map((group) => {
        const isExpanded = expandedGroup === group.key;
        return (
          <section className="dashboard-subnav__group" key={group.key} aria-label={group.label}>
            <button
              type="button"
              className="dashboard-subnav__heading dashboard-subnav__heading-button"
              aria-expanded={isExpanded}
              onClick={() => setExpandedGroup((current) => current === group.key ? null : group.key)}
            >
              <span>{group.label}</span>
              <span className="dashboard-subnav__chevron" aria-hidden="true">{isExpanded ? "−" : "+"}</span>
            </button>
            {isExpanded ? (
              <div className="dashboard-subnav__links">
                {group.children.map((item) => {
                  const targetPath = item.href.split(/[?#]/, 1)[0];
                  const isActive = item.key === "timetable"
                    ? location.pathname === targetPath && new URLSearchParams(location.search).get("tab") === "settings" && location.hash === "#timetable"
                    : isDashboardMenuPathActive(location.pathname, targetPath);
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
