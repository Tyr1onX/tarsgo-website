import { Link, useOutletContext } from "react-router";

import type { DashboardMenuLink } from "~/lib/dashboard-navigation";
import { getUserDashboardMenu, getVisibleAdminDashboardMenu } from "~/lib/dashboard-navigation";
import { DailySignalWorkspace } from "~/components/daily-signal-workspace";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./dashboard-home.css";

function getQuickLinks(roleName: string): DashboardMenuLink[] {
  const adminLinks = getVisibleAdminDashboardMenu(roleName)
    .filter((item): item is DashboardMenuLink => "href" in item);
  return [...getUserDashboardMenu(roleName), ...adminLinks].slice(0, 3);
}

export default function DashboardIndex() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const shortcuts = getQuickLinks(currentUser.role.name);
  const displayName = currentUser.nickname?.trim() || currentUser.email;

  return (
    <section className="dashboard-home" aria-labelledby="dashboard-home-title">
      <header className="dashboard-home__header">
        <p className="dashboard-home__eyebrow">个人工作台</p>
        <h1 id="dashboard-home-title">你好，{displayName}</h1>
        <p>今天也从这里开始。</p>
      </header>

      <DailySignalWorkspace key={currentUser.id} currentUser={currentUser} />

      {shortcuts.length > 0 ? (
        <section className="dashboard-home__shortcuts" aria-labelledby="dashboard-home-shortcuts-title">
          <h2 id="dashboard-home-shortcuts-title">快捷入口</h2>
          <div className="dashboard-home__shortcut-list">
            {shortcuts.map((item) => (
              <Link key={item.href} to={item.href} className="dashboard-home__shortcut">
                <span>{item.label}</span>
                <span aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
