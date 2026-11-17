import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { getUnifiedDashboardMenu, isDashboardMenuPathActive } from "~/lib/dashboard-navigation";
import type { AuthUser } from "~/lib/auth-client";

type Props = {
  currentUser: AuthUser;
  hasAssignmentGroup: boolean;
  onNavigate: () => void;
};

export function DashboardSectionNavigation({
  currentUser,
  hasAssignmentGroup,
  onNavigate,
}: Props) {
  const location = useLocation();
  const groups = getUnifiedDashboardMenu(currentUser, hasAssignmentGroup);
  const activeGroup = groups.find(({ children }) =>
    children.some((item) => isDashboardMenuPathActive(location.pathname, item.href)));
  const defaultExpandedGroup = activeGroup?.key ?? groups[0]?.key ?? null;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(defaultExpandedGroup);

  useEffect(() => {
    setExpandedGroup(defaultExpandedGroup);
  }, [defaultExpandedGroup]);

  if (groups.length === 0) return null;

  return (
    <div className="dashboard-subnav" role="group" aria-label="业务功能">
      {groups.map((group) => {
        const isExpanded = expandedGroup === group.key;
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
              <span className="dashboard-subnav__chevron" aria-hidden="true">{isExpanded ? "−" : "+"}</span>
            </button>
            {isExpanded ? (
              <div id={`dashboard-subnav-${group.key}`} className="dashboard-subnav__links">
                {group.children.map((item) => {
                  const isActive = isDashboardMenuPathActive(location.pathname, item.href);
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
