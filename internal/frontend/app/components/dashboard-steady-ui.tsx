import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { assignmentClient } from "~/lib/assignment-client";
import type { AuthUser } from "~/lib/auth-client";
import {
  getDashboardSectionMenu,
  getUnifiedDashboardMenu,
  hasWorkbenchAccess,
  isDashboardMenuPathActive,
} from "~/lib/dashboard-navigation";
import { getAdminWorkbenchSummary } from "~/lib/registrations-client";
import { getWeeklyReportStatus } from "~/lib/weekly-report-client";
import "./dashboard-steady-ui.css";

export type DashboardTaskCounts = {
  scope: string;
  weeklyPending: boolean | null;
  assignmentCount: number | null;
  recruitmentCount: number | null;
  recruitmentTarget: string;
  reviewCount: number | null;
};

export function createEmptyDashboardTaskCounts(scope: string): DashboardTaskCounts {
  return {
    scope,
    weeklyPending: null,
    assignmentCount: null,
    recruitmentCount: null,
    recruitmentTarget: "/dashboard/admin/registrations",
    reviewCount: null,
  };
}

export function useDashboardTaskCounts({
  currentUser,
  hasAssignmentGroup,
  permissionsKey,
  enabled = true,
}: {
  currentUser: AuthUser;
  hasAssignmentGroup: boolean;
  permissionsKey: string;
  enabled?: boolean;
}) {
  const location = useLocation();
  const canManage = currentUser.role.name === "admin" || currentUser.role.name === "super_admin";
  const canReview = currentUser.role.name === "admin" && hasAssignmentGroup;
  const scope = JSON.stringify([currentUser.id, currentUser.role.name, currentUser.workbenchAccess, permissionsKey]);
  const [state, setState] = useState<DashboardTaskCounts>(() => createEmptyDashboardTaskCounts(scope));

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const update = (patch: Partial<DashboardTaskCounts>) => {
      if (!active) return;
      setState((previous) => ({
        ...(previous.scope === scope ? previous : createEmptyDashboardTaskCounts(scope)),
        ...patch,
      }));
    };

    if (hasWorkbenchAccess(currentUser)) {
      void getWeeklyReportStatus()
        .then((value) => update({ weeklyPending: !value.submitted }))
        .catch(() => update({ weeklyPending: null }));
      if (hasAssignmentGroup) {
        void assignmentClient.listTodos()
          .then((items) =>
            update({
              assignmentCount: items.filter(
                (item) => item.status === "pending" || item.status === "overdue" || item.status === "needs_redo",
              ).length,
            }),
          )
          .catch(() => update({ assignmentCount: null }));
      }
    }

    if (canManage) {
      void getAdminWorkbenchSummary(currentUser.id)
        .then((value) => {
          const screening = value.currentFormAvailable ? value.summary.pendingScreening : 0;
          const interview = value.currentFormAvailable ? value.summary.pendingInterview : 0;
          update({
            recruitmentCount: screening + interview,
            recruitmentTarget:
              screening > 0 && !interview
                ? "/dashboard/admin/registrations?status=pending_screening"
                : interview > 0 && !screening
                  ? "/dashboard/admin/registrations?view=interviews"
                  : "/dashboard/admin/registrations",
          });
        })
        .catch(() => update({ recruitmentCount: null }));
      if (canReview) {
        void assignmentClient.adminTodos()
          .then((value) => update({ reviewCount: value.reviewCount }))
          .catch(() => update({ reviewCount: null }));
      }
    }

    return () => {
      active = false;
    };
  }, [scope, location.pathname, enabled, canManage, canReview, hasAssignmentGroup, currentUser]);

  return state.scope === scope ? state : createEmptyDashboardTaskCounts(scope);
}

export function resolveDashboardBreadcrumb(
  pathname: string,
  currentUser: AuthUser,
  hasAssignmentGroup: boolean,
): { parent: string; current: string } {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/dashboard") return { parent: "工作台", current: "吉甲社区" };
  if (path === "/dashboard/questions") return { parent: "工作台", current: "常见问题" };
  if (path === "/dashboard/timetable") return { parent: "日常事务", current: "课程时间" };
  if (path.startsWith("/dashboard/members/")) {
    const isSelf = path === `/dashboard/members/${currentUser.id}`;
    return { parent: "个人", current: isSelf ? "我的主页" : "成员主页" };
  }

  const groups = getUnifiedDashboardMenu(currentUser, hasAssignmentGroup);
  for (const group of groups) {
    const match = group.children.find((item) => isDashboardMenuPathActive(path, item.href));
    if (match) return { parent: group.label, current: match.label };
  }

  return { parent: "工作台", current: "TARSGO" };
}

export function DashboardTopbarBreadcrumb({
  pathname,
  currentUser,
  hasAssignmentGroup,
}: {
  pathname: string;
  currentUser: AuthUser;
  hasAssignmentGroup: boolean;
}) {
  const { parent, current } = useMemo(
    () => resolveDashboardBreadcrumb(pathname, currentUser, hasAssignmentGroup),
    [pathname, currentUser, hasAssignmentGroup],
  );

  return (
    <nav className="dashboard-breadcrumb" aria-label="当前位置">
      <span className="dashboard-breadcrumb__divider" aria-hidden="true" />
      <span className="dashboard-breadcrumb__parent">{parent}</span>
      <span className="dashboard-breadcrumb__sep" aria-hidden="true">/</span>
      <span className="dashboard-breadcrumb__current">{current}</span>
    </nav>
  );
}

type CommandEntry = {
  id: string;
  label: string;
  group: string;
  href: string;
  keywords: string;
};

export function DashboardCommandPalette({
  currentUser,
  hasAssignmentGroup,
}: {
  currentUser: AuthUser;
  hasAssignmentGroup: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const entries = useMemo<CommandEntry[]>(() => {
    const items: CommandEntry[] = [];
    const seen = new Set<string>();
    const push = (id: string, label: string, group: string, href: string, keywords = "") => {
      if (seen.has(href)) return;
      seen.add(href);
      items.push({ id, label, group, href, keywords: `${label} ${group} ${keywords}`.toLowerCase() });
    };

    for (const item of getDashboardSectionMenu(currentUser)) {
      push(item.key, item.label, "主要入口", item.href);
    }
    for (const group of getUnifiedDashboardMenu(currentUser, hasAssignmentGroup)) {
      for (const item of group.children) {
        push(item.key, item.label, group.label, item.href);
      }
    }
    if (hasWorkbenchAccess(currentUser)) {
      push("timetable", "课程时间", "日常事务", "/dashboard/timetable", "课表 excel 空闲");
    }
    push("questions", "常见问题", "帮助", "/dashboard/questions", "faq 指南");
    return items;
  }, [currentUser, hasAssignmentGroup]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((item) => item.keywords.includes(q));
  }, [entries, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function selectEntry(entry: CommandEntry | undefined) {
    if (!entry) return;
    setOpen(false);
    navigate(entry.href);
  }

  return (
    <>
      <button
        type="button"
        className="dashboard-cmdk-trigger"
        onClick={() => setOpen(true)}
        aria-label="快速跳转工作台模块（快捷键 Command+K）"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="dashboard-cmdk-trigger__label">快速跳转…</span>
        <kbd className="dashboard-cmdk-kbd">⌘K</kbd>
      </button>

      {open ? (
        <div
          className="dashboard-cmdk-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="工作台快速跳转"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="dashboard-cmdk-dialog">
            <div className="dashboard-cmdk-input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="dashboard-cmdk-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((idx) => (filtered.length ? (idx + 1) % filtered.length : 0));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((idx) => (filtered.length ? (idx - 1 + filtered.length) % filtered.length : 0));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    selectEntry(filtered[activeIndex]);
                  }
                }}
                placeholder="输入模块名称快速跳转，如：作业、周报、资料、课表…"
              />
              <kbd className="dashboard-cmdk-kbd">ESC</kbd>
            </div>
            <div className="dashboard-cmdk-list" role="listbox">
              {filtered.length > 0 ? (
                filtered.map((entry, idx) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={idx === activeIndex}
                    className={`dashboard-cmdk-item${idx === activeIndex ? " is-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => selectEntry(entry)}
                  >
                    <span>{entry.label}</span>
                    <small>{entry.group}</small>
                  </button>
                ))
              ) : (
                <p className="dashboard-cmdk-empty">没有匹配的工作台模块</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type TodoItem = {
  id: string;
  label: string;
  actionLabel: string;
  href: string;
};

function buildTodoItems(counts: DashboardTaskCounts): TodoItem[] {
  const items: TodoItem[] = [];
  if (counts.weeklyPending) {
    items.push({
      id: "weekly",
      label: "本周工作周报尚未提交",
      actionLabel: "去填写",
      href: "/dashboard/weekly-reports?edit=1",
    });
  }
  if (counts.assignmentCount && counts.assignmentCount > 0) {
    items.push({
      id: "assignments",
      label: `有 ${counts.assignmentCount} 项培训作业待完成`,
      actionLabel: "去查看",
      href: "/dashboard/assignments",
    });
  }
  if (counts.reviewCount && counts.reviewCount > 0) {
    items.push({
      id: "reviews",
      label: `有 ${counts.reviewCount} 份组内作业待批改`,
      actionLabel: "去批改",
      href: "/dashboard/admin/training/assignments",
    });
  }
  if (counts.recruitmentCount && counts.recruitmentCount > 0) {
    items.push({
      id: "recruitment",
      label: `有 ${counts.recruitmentCount} 条招新记录待处理`,
      actionLabel: "去处理",
      href: counts.recruitmentTarget,
    });
  }
  return items;
}

export function DashboardTopbarTodoPill({ counts }: { counts: DashboardTaskCounts }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const items = useMemo(() => buildTodoItems(counts), [counts]);
  const totalCount =
    (counts.weeklyPending ? 1 : 0) +
    (counts.assignmentCount ?? 0) +
    (counts.reviewCount ?? 0) +
    (counts.recruitmentCount ?? 0);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !wrapRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (totalCount === 0) return null;

  return (
    <div className="dashboard-todo-pill-wrap" ref={wrapRef}>
      <button
        type="button"
        className="dashboard-todo-pill"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="dashboard-todo-pill__dot" aria-hidden="true" />
        <span>{totalCount} 项待办</span>
      </button>

      {open ? (
        <div className="dashboard-todo-popover" role="menu" aria-label="当前待办事项">
          <div className="dashboard-todo-popover__title">当前待办</div>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="dashboard-todo-popover__item"
              onClick={() => {
                setOpen(false);
                navigate(item.href);
              }}
            >
              <span>{item.label}</span>
              <span className="dashboard-todo-popover__tag">{item.actionLabel}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardWeeklyTodoStrip({ counts }: { counts: DashboardTaskCounts }) {
  const navigate = useNavigate();
  const hasWeekly = Boolean(counts.weeklyPending);
  const pendingAssignments = counts.assignmentCount ?? 0;

  if (!hasWeekly && pendingAssignments === 0) return null;

  const summaryParts: string[] = [];
  if (hasWeekly) summaryParts.push("1 份本周周报");
  if (pendingAssignments > 0) summaryParts.push(`${pendingAssignments} 项培训作业`);

  return (
    <section className="dashboard-todo-strip" aria-label="本周待办提醒">
      <div className="dashboard-todo-strip__left">
        <span className="dashboard-todo-strip__tag">本周待办</span>
        <span className="dashboard-todo-strip__text">还有 {summaryParts.join("和 ")}待提交</span>
      </div>
      <div className="dashboard-todo-strip__actions">
        {hasWeekly ? (
          <button
            type="button"
            className="dashboard-todo-strip__chip"
            onClick={() => navigate("/dashboard/weekly-reports?edit=1")}
          >
            填写本周周报 →
          </button>
        ) : null}
        {pendingAssignments > 0 ? (
          <button
            type="button"
            className="dashboard-todo-strip__chip"
            onClick={() => navigate("/dashboard/assignments")}
          >
            查看我的作业 →
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function DashboardMobileBottomNav({
  currentUser,
  hasAssignmentGroup,
  counts,
}: {
  currentUser: AuthUser;
  hasAssignmentGroup: boolean;
  counts: DashboardTaskCounts;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const hasWorkbench = hasWorkbenchAccess(currentUser);

  const items: Array<{
    key: string;
    label: string;
    href: string;
    badge?: number;
    active: boolean;
  }> = [
    {
      key: "community",
      label: "社区",
      href: "/dashboard",
      active: location.pathname === "/dashboard" || location.pathname.startsWith("/dashboard/community/"),
    },
    {
      key: "materials",
      label: "资料",
      href: "/dashboard/training-materials",
      active: isDashboardMenuPathActive(location.pathname, "/dashboard/training-materials"),
    },
  ];

  if (hasWorkbench && hasAssignmentGroup) {
    items.push({
      key: "assignments",
      label: "作业",
      href: "/dashboard/assignments",
      badge: counts.assignmentCount ?? 0,
      active: isDashboardMenuPathActive(location.pathname, "/dashboard/assignments"),
    });
  } else if (hasWorkbench) {
    items.push({
      key: "leave",
      label: "请假",
      href: "/dashboard/leave",
      active: isDashboardMenuPathActive(location.pathname, "/dashboard/leave"),
    });
  }

  if (hasWorkbench) {
    items.push({
      key: "weekly",
      label: "周报",
      href: counts.weeklyPending ? "/dashboard/weekly-reports?edit=1" : "/dashboard/weekly-reports",
      badge: counts.weeklyPending ? 1 : 0,
      active: isDashboardMenuPathActive(location.pathname, "/dashboard/weekly-reports"),
    });
  } else {
    items.push({
      key: "profile",
      label: "我的",
      href: `/dashboard/members/${currentUser.id}`,
      active: location.pathname === `/dashboard/members/${currentUser.id}`,
    });
  }

  function renderIcon(key: string) {
    switch (key) {
      case "community":
        return (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.25 18.25 4 20l.85-3.7A8.5 8.5 0 1 1 7.25 18.25Z" />
          </svg>
        );
      case "materials":
        return (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          </svg>
        );
      case "assignments":
        return (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="m9 14 2 2 4-4" />
          </svg>
        );
      case "weekly":
        return (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h5" />
          </svg>
        );
      case "leave":
        return (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        );
      default:
        return (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
        );
    }
  }

  return (
    <nav className="dashboard-mobile-bottom-nav" aria-label="移动端快捷导航">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`dashboard-mobile-bottom-nav__item${item.active ? " is-active" : ""}`}
          aria-current={item.active ? "page" : undefined}
          onClick={() => navigate(item.href)}
        >
          <span className="dashboard-mobile-bottom-nav__icon">
            {renderIcon(item.key)}
            {item.badge && item.badge > 0 ? <span className="dashboard-mobile-bottom-nav__dot" aria-hidden="true" /> : null}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 120) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(1, Math.max(0, window.scrollY / scrollable)));
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (progress <= 0.01) return null;
  return (
    <div className="dashboard-reading-progress" aria-hidden="true">
      <span style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

export function useActiveHeadingId(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0] ?? "");
  const idsKey = ids.join("|");

  useEffect(() => {
    if (!ids.length || typeof IntersectionObserver === "undefined") {
      setActiveId("");
      return;
    }
    setActiveId(ids[0] ?? "");
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-84px 0px -65% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [idsKey]);

  return activeId;
}
