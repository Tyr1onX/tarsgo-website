import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";

import type { DashboardMenuLink } from "~/lib/dashboard-navigation";
import { getUserDashboardMenu, getVisibleAdminDashboardMenu } from "~/lib/dashboard-navigation";
import { apiRequest } from "~/lib/api-client";
import { getCurrentBeijingDate } from "~/lib/daily-signal-calendar";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./dashboard-home.css";

type DailySignalSummary = {
  today: string;
  signedToday: boolean;
  todayMood: string | null;
};

type DailySignalResponse = DailySignalSummary & {
  year: number;
  authenticated: boolean;
  days: string[];
  moods: Array<{ date: string; mood: string }>;
};

function formatBeijingDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

function getQuickLinks(roleName: string): DashboardMenuLink[] {
  const adminLinks = getVisibleAdminDashboardMenu(roleName)
    .filter((item): item is DashboardMenuLink => "href" in item);
  return [...getUserDashboardMenu(roleName), ...adminLinks].slice(0, 3);
}

export default function DashboardIndex() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [signal, setSignal] = useState<DailySignalSummary | null>(null);
  const [signalState, setSignalState] = useState<"loading" | "ready" | "error">("loading");
  const shortcuts = getQuickLinks(currentUser.role.name);
  const displayName = currentUser.nickname?.trim() || currentUser.email;

  useEffect(() => {
    const controller = new AbortController();
    const today = getCurrentBeijingDate();
    setSignal(null);
    setSignalState("loading");

    // The existing archive endpoint scopes mood data to the authenticated session user.
    void apiRequest<DailySignalResponse>(`/api/daily-signals?year=${today.slice(0, 4)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((archive) => {
        if (controller.signal.aborted) return;
        setSignal({ today: archive.today, signedToday: archive.signedToday, todayMood: archive.todayMood });
        setSignalState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSignalState("error");
      });

    return () => controller.abort();
  }, [currentUser.id]);

  const today = signal?.today ?? getCurrentBeijingDate();
  const signalStatus = signalState === "loading"
    ? "正在读取今天的状态…"
    : signalState === "error"
      ? "今天的状态暂时无法读取"
      : signal?.signedToday
        ? `今日已发送${signal.todayMood ? ` · ${signal.todayMood}` : " · 未记录情绪"}`
        : "今天还没有发送信号";

  return (
    <section className="dashboard-home" aria-labelledby="dashboard-home-title">
      <header className="dashboard-home__header">
        <p className="dashboard-home__eyebrow">个人工作台</p>
        <h1 id="dashboard-home-title">你好，{displayName}</h1>
        <p>从今天开始，继续你的吉甲日常。</p>
      </header>

      <section className="dashboard-home__signal" aria-labelledby="dashboard-home-signal-title" aria-busy={signalState === "loading"}>
        <div className="dashboard-home__signal-mark" aria-hidden="true">
          <i />
          <i />
          <b />
        </div>
        <div className="dashboard-home__signal-copy">
          <p className="dashboard-home__eyebrow">{formatBeijingDate(today)}</p>
          <h2 id="dashboard-home-signal-title">今日通信</h2>
          <p role={signalState === "error" ? "status" : undefined}>{signalStatus}</p>
        </div>
        <Link to="/dashboard/base" className="dashboard-home__signal-link">
          {signal?.signedToday ? "查看今日通信" : "打开每日通信"}
          <span aria-hidden="true">→</span>
        </Link>
      </section>

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
