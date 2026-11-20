import { useEffect, useState } from "react";

import { getAuthUserName, type AuthUser } from "~/lib/auth-client";
import {
  GroupAnimatedMark,
  resolveGroupKey,
  TARS_ROBOT_PATHS,
  type GroupKey,
} from "./tarsgo-motion-marks";
import "./dashboard-group-checkin.css";

const CHECKIN_STORAGE_KEY = "tarsgo-dashboard-checkin-user";

export type DashboardGroupItem = {
  groupId: number;
  name: string;
  role: number;
};

export function markDashboardLoginCeremony(userId: number) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CHECKIN_STORAGE_KEY, String(userId));
  } catch {
    // Ignore storage failures in restricted browsing modes.
  }
}

function consumeDashboardLoginCeremony(userId: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(CHECKIN_STORAGE_KEY);
    if (raw !== String(userId)) return false;
    window.sessionStorage.removeItem(CHECKIN_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function buildGreeting(name: string, groups: DashboardGroupItem[], hour: number) {
  const isLateNight = hour >= 23 || hour < 5;
  const salutation =
    hour >= 5 && hour < 12
      ? `早安，${name}`
      : hour >= 12 && hour < 18
        ? `下午好，${name}`
        : hour >= 18 && hour < 23
          ? `晚上好，${name}`
          : `夜深了，${name}`;

  if (groups.length === 0) {
    return {
      title: salutation,
      subtitle: isLateNight ? "欢迎来到 TARSGO 工作台，记得早点休息。" : "欢迎来到 TARSGO 工作台。",
    };
  }

  if (groups.length > 1) {
    return {
      title: salutation,
      subtitle: isLateNight ? "跨组辛苦，收尾后记得早点休息。" : "跨组协同，今天也顺利。",
    };
  }

  const key: GroupKey = resolveGroupKey(groups[0].name);
  const copyByGroup: Record<GroupKey, { day: string; night: string }> = {
    mech: { day: "把结构落到实处。", night: "收工前注意安全，早点休息。" },
    elec: { day: "链路就绪，开工顺利。", night: "板子明天再调，早点休息。" },
    vision: { day: "视野清晰，稳步推进。", night: "屏幕看久了，注意护眼休息。" },
    ai: { day: "思路在线，继续迭代。", night: "跑完这一轮，记得早点休息。" },
    ops: { day: "协同就位，推进顺利。", night: "辛苦了，收尾后早点休息。" },
  };

  return {
    title: salutation,
    subtitle: isLateNight ? copyByGroup[key].night : copyByGroup[key].day,
  };
}

export function DashboardGroupCheckinToast({
  currentUser,
  groups,
}: {
  currentUser: AuthUser;
  groups: DashboardGroupItem[];
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [greeting, setGreeting] = useState<{ title: string; subtitle: string } | null>(null);

  useEffect(() => {
    if (!consumeDashboardLoginCeremony(currentUser.id)) return;

    const name = getAuthUserName(currentUser);
    const hour = new Date().getHours();
    setGreeting(buildGreeting(name, groups, hour));
    setLeaving(false);
    setVisible(true);

    const hideTimer = window.setTimeout(() => setLeaving(true), 2850);
    const removeTimer = window.setTimeout(() => {
      setVisible(false);
      setLeaving(false);
    }, 3250);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [currentUser.id]);

  if (!visible || !greeting) return null;

  const primaryGroup = groups[0] ?? null;
  const extraGroups = groups.slice(1);

  return (
    <div
      className={`dashboard-checkin-toast ${leaving ? "dashboard-checkin-toast--leaving" : ""}`}
      role="status"
      aria-live="polite"
      onClick={() => setVisible(false)}
    >
      <span className="dashboard-checkin-toast__emblem" aria-hidden="true">
        {primaryGroup ? (
          <GroupAnimatedMark groupName={primaryGroup.name} play />
        ) : (
          <svg
            className="dashboard-checkin-toast__tars"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="18 6 84 94"
          >
            {TARS_ROBOT_PATHS.map((item, i) => (
              <path
                key={i}
                className={item.pillar === "mid" ? "dashboard-checkin-toast__tars-mid" : undefined}
                d={item.d}
                fillRule="evenodd"
              />
            ))}
          </svg>
        )}
      </span>

      <div className="dashboard-checkin-toast__body">
        <div className="dashboard-checkin-toast__meta">
          <span className="dashboard-checkin-toast__group">
            {primaryGroup ? primaryGroup.name : "TARSGO"}
          </span>
          {extraGroups.map((group) => (
            <span key={group.groupId} className="dashboard-checkin-toast__extra">
              <span className="dashboard-checkin-toast__extra-icon" aria-hidden="true">
                <GroupAnimatedMark groupName={group.name} play={false} />
              </span>
              {group.name}
            </span>
          ))}
        </div>
        <p className="dashboard-checkin-toast__title">{greeting.title}</p>
        <p className="dashboard-checkin-toast__subtitle">{greeting.subtitle}</p>
      </div>

      <span className="dashboard-checkin-toast__progress" aria-hidden="true">
        <span className="dashboard-checkin-toast__progress-bar" />
      </span>
    </div>
  );
}
