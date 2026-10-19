import { useOutletContext } from "react-router";

import { DailySignalWorkspace } from "~/components/daily-signal-workspace";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./dashboard-home.css";

export function meta() {
  return [{ title: "个人工作台 | TARSGO" }];
}

export default function DashboardIndex() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const displayName = currentUser.nickname?.trim() || currentUser.email;

  return (
    <section className="dashboard-home" aria-labelledby="dashboard-home-title">
      <header className="dashboard-home__header">
        <p className="dashboard-home__eyebrow">个人工作台</p>
        <h1 id="dashboard-home-title">你好，{displayName}</h1>
        <p>今天也从这里开始。</p>
      </header>

      <DailySignalWorkspace key={currentUser.id} currentUser={currentUser} />
    </section>
  );
}
