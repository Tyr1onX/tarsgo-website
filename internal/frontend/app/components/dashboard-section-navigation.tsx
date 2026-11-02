import { Link, useLocation } from "react-router";

import {
  getDashboardSectionKey,
  getMyTransactionsMenu,
  getVisibleAdminDashboardLinks,
  isDashboardMenuPathActive,
} from "~/lib/dashboard-navigation";
import type { AuthUser } from "~/lib/auth-client";

type Props = {
  currentUser: AuthUser;
  hasAssignmentGroup: boolean;
  candidateTodoCount: number | null;
  leaveActionableCount: number | null;
};

export function DashboardSectionNavigation({ currentUser, hasAssignmentGroup, candidateTodoCount, leaveActionableCount }: Props) {
  const location = useLocation();
  const section = getDashboardSectionKey(location.pathname, location.search, currentUser.role.name, location.hash);
  if (section !== "transactions" && section !== "management") return null;

  const links = section === "transactions"
    ? getMyTransactionsMenu(currentUser, hasAssignmentGroup)
    : getVisibleAdminDashboardLinks(currentUser, hasAssignmentGroup);

  return (
    <nav className="dashboard-section-nav" aria-label={section === "transactions" ? "我的事务" : "管理功能"} data-section={section}>
      {links.map((item) => {
        const targetPath = item.href.split(/[?#]/, 1)[0];
        const isActive = item.key === "timetable"
          ? location.pathname === targetPath && new URLSearchParams(location.search).get("tab") === "settings" && location.hash === "#timetable"
          : isDashboardMenuPathActive(location.pathname, targetPath);
        const badgeCount = item.key === "candidate-processing" ? candidateTodoCount
          : item.key === "leave-workbench" ? leaveActionableCount
            : null;
        const badgeLabel = item.key === "leave-workbench" ? "请假待处理事项" : "待处理报名";
        return (
          <Link
            key={item.key}
            to={item.href}
            prefetch={item.key === "candidate-processing" || item.key === "admin-panel" || item.key === "recruitment-analytics" ? "render" : "intent"}
            aria-current={isActive ? "page" : undefined}
            className={`dashboard-section-nav__link${isActive ? " is-active" : ""}`}
          >
            <span>{item.label}</span>
            {(badgeCount ?? 0) > 0 ? <span className="dashboard-nav-badge" aria-label={`${badgeCount} 项${badgeLabel}`}>{badgeCount}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
