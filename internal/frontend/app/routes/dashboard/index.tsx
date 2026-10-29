import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { FEATURE_GUIDE_DATE, FEATURE_GUIDE_TITLE, GROUP_ACCESS_HELP } from "~/lib/workbench-feature-announcement";
import "./dashboard-home.css";

export function meta() {
  return [{ title: "个人工作台 | TARSGO" }];
}

export default function DashboardIndex() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const displayName = currentUser.nickname?.trim() || currentUser.email;
  const dismissalKey = `workbench-feature-guide-dismissed:${currentUser.id}:${FEATURE_GUIDE_DATE}`;
  const [announcementVisible, setAnnouncementVisible] = useState(true);

  useEffect(() => {
    try {
      setAnnouncementVisible(window.localStorage.getItem(dismissalKey) !== "1");
    } catch {
      setAnnouncementVisible(true);
    }
  }, [dismissalKey]);

  function deferAnnouncement() {
    try {
      window.localStorage.setItem(dismissalKey, "1");
    } catch {
      // The persistent guide link remains available if browser storage is disabled.
    }
    setAnnouncementVisible(false);
  }

  return (
    <section className="dashboard-home" aria-labelledby="dashboard-home-title">
      <header className="dashboard-home__header">
        <div className="dashboard-home__heading">
          <div>
            <p className="dashboard-home__eyebrow">个人工作台</p>
            <h1 id="dashboard-home-title">你好，{displayName}</h1>
            <p>今天也从这里开始。</p>
          </div>
          <Link className="dashboard-home__guide-link" to="/dashboard/updates">查看功能公告 <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      {announcementVisible ? <aside className="dashboard-announcement" aria-labelledby="dashboard-announcement-title">
        <div className="dashboard-announcement__copy">
          <p className="dashboard-announcement__date">功能更新 · {FEATURE_GUIDE_DATE}</p>
          <h2 id="dashboard-announcement-title"><Link to="/dashboard/updates">{FEATURE_GUIDE_TITLE}</Link></h2>
          <p>了解哪些功能现在可以使用、开放到什么阶段，以及从哪里开始。</p>
          <p>{GROUP_ACCESS_HELP}</p>
        </div>
        <div className="dashboard-announcement__actions">
          <Link to="/dashboard/updates">阅读公告与使用引导 <span aria-hidden="true">↗</span></Link>
          <button type="button" onClick={deferAnnouncement}>稍后查看</button>
        </div>
      </aside> : null}

    </section>
  );
}
