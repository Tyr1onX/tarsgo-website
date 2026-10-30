import type { AuthUser } from "~/lib/auth-client";

export type DashboardMenuIconKey = "dashboard" | "people" | "registration" | "settings" | "analytics" | "report";

type DashboardAllowedRoles = readonly string[];

export type DashboardMenuLeaf = {
  key: string;
  label: string;
  href: string;
  allowedRoles: DashboardAllowedRoles;
};

type DashboardMenuGroupDefinition = {
  key: string;
  label: string;
  iconKey: DashboardMenuIconKey;
  children: readonly DashboardMenuLeaf[];
  href?: undefined;
  allowedRoles?: undefined;
};

type DashboardMenuLinkDefinition = {
  key: string;
  label: string;
  href: string;
  iconKey: DashboardMenuIconKey;
  allowedRoles: DashboardAllowedRoles;
  children?: undefined;
};

type DashboardMenuDefinition = DashboardMenuLinkDefinition | DashboardMenuGroupDefinition;

export type DashboardMenuLink = {
  key: string;
  label: string;
  href: string;
  iconKey: DashboardMenuIconKey;
};

export type GrowthDashboardTabKey = "profile" | "capabilities" | "skills";

export type GrowthDashboardTab = {
  key: GrowthDashboardTabKey;
  label: string;
};

export type VisibleDashboardAdminMenuItem =
  | DashboardMenuLink
  | {
      key: string;
      label: string;
      iconKey: DashboardMenuIconKey;
      children: readonly DashboardMenuLeaf[];
    };

const USER_MENU: readonly DashboardMenuLink[] = [
  {
    key: "users-registrations",
    label: "我的招新",
    href: "/dashboard/users/registrations",
    iconKey: "registration",
  },
];

const ASSIGNMENT_MENU_ITEM: DashboardMenuLink = {
  key: "my-assignments",
  label: "我的作业",
  href: "/dashboard/assignments",
  iconKey: "report",
};

const TECHNICAL_GROUP_NAMES = new Set(["机械组", "电控组", "视觉组", "AI组"]);
const ASSIGNMENT_GROUP_NAMES = new Set([...TECHNICAL_GROUP_NAMES, "运营组"]);
const SKILL_GROUP_NAMES = new Set([...TECHNICAL_GROUP_NAMES, "运营组"]);

export function isTechnicalGroupName(name: string) {
  return TECHNICAL_GROUP_NAMES.has(name);
}

export function hasAssignmentGroupAccess(groups: readonly { name: string }[] | null | undefined) {
  return Boolean(groups?.some((group) => ASSIGNMENT_GROUP_NAMES.has(group.name)));
}

export function isAssignmentGroupName(name: string) {
  return ASSIGNMENT_GROUP_NAMES.has(name);
}

export function hasSkillGroupAccess(groups: readonly { name: string }[] | null | undefined) {
	return Boolean(groups?.some((group) => SKILL_GROUP_NAMES.has(group.name)));
}

export function canAccessExpedition(userOrRole: AuthUser | string, hasSkillGroup: boolean) {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  return hasSkillGroup || roleName === "super_admin";
}

export function isTemporarilyUnavailableDashboardPath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, "");
  const unavailablePaths = [
    "/dashboard/base",
    "/dashboard/practice-projects",
    "/dashboard/questions",
    "/dashboard/growth",
    "/dashboard/skills",
    "/dashboard/capabilities",
    "/dashboard/expedition",
    "/dashboard/admin/training/practice-projects",
    "/dashboard/admin/training/questions",
    "/dashboard/admin/training/skills",
    "/dashboard/admin/training/capabilities",
    "/dashboard/admin/training/expedition",
    "/dashboard/admin/cultivation",
  ];
  return unavailablePaths.some((path) => normalizedPath === path || normalizedPath.startsWith(`${path}/`));
}

const CORE_DASHBOARD_MENU: readonly DashboardMenuLink[] = [
  {
    key: "personal-workspace",
    label: "首页",
    href: "/dashboard",
    iconKey: "dashboard",
  },
];

const DAILY_DASHBOARD_MENU: readonly DashboardMenuLink[] = [
  {
    key: "weekly-reports",
    label: "工作周报",
    href: "/dashboard/weekly-reports",
    iconKey: "report",
  },
  {
    key: "leave-workbench",
    label: "请假工作台",
    href: "/dashboard/leave",
    iconKey: "report",
  },
  {
    key: "usage-guide",
    label: "使用指南",
    href: "/dashboard/guide",
    iconKey: "report",
  },
];

const ADMIN_MENU: readonly DashboardMenuDefinition[] = [
  {
    key: "recruitment-operations",
    label: "招新事务",
    iconKey: "registration",
    children: [
      {
        key: "admin-panel",
        label: "招新总览",
        href: "/dashboard/admin",
        allowedRoles: ["super_admin", "admin"],
      },
      {
        key: "candidate-processing",
        label: "候选人处理",
        href: "/dashboard/admin/registrations",
        allowedRoles: ["super_admin", "admin"],
      },
      {
        key: "recruitment-management",
        label: "招新管理",
        href: "/dashboard/admin/recruitment",
        allowedRoles: ["super_admin"],
      },
      {
        key: "recruitment-analytics",
        label: "招新数据分析",
        href: "/dashboard/admin/recruitment-analytics",
        allowedRoles: ["super_admin"],
      },
    ],
  },
  {
    key: "newcomer-training",
    label: "新人培养",
    iconKey: "report",
    children: [
      {
        key: "assignment-management",
        label: "作业管理",
        href: "/dashboard/admin/training/assignments",
        allowedRoles: ["admin", "super_admin"],
      },
      {
        key: "assignment-submissions",
        label: "提交记录",
        href: "/dashboard/admin/training/submissions",
        allowedRoles: ["admin", "super_admin"],
      },
    ],
  },
  {
    key: "member-management",
    label: "成员管理",
    iconKey: "people",
    children: [
      {
        key: "accounts",
        label: "账号与权限",
        href: "/dashboard/admin/users",
        allowedRoles: ["super_admin"],
      },
      {
        key: "timetable-availability",
        label: "时间协调",
        href: "/dashboard/admin/timetable-availability",
        allowedRoles: ["admin", "super_admin"],
      },
    ],
  },
  {
    key: "email-management",
    label: "邮件管理",
    href: "/dashboard/admin/email",
    iconKey: "settings",
    allowedRoles: ["super_admin"],
  },
];

function isRoleAllowed(roleName: string, allowedRoles: DashboardAllowedRoles) {
  return allowedRoles.includes(roleName);
}

function isDashboardMenuLinkDefinition(
  item: DashboardMenuDefinition,
): item is DashboardMenuLinkDefinition {
  return typeof item.href === "string";
}

function getAccessibleAdminPaths(roleName: string, hasAssignmentGroup = false) {
  const paths = ADMIN_MENU.flatMap((item) => {
    if (isDashboardMenuLinkDefinition(item)) {
      return isRoleAllowed(roleName, item.allowedRoles) ? [item.href] : [];
    }

    return item.children
      .filter((child) => {
        if (!isRoleAllowed(roleName, child.allowedRoles)) return false;
        if (roleName === "super_admin") return true;
        if (item.key === "newcomer-training") return hasAssignmentGroup;
        return true;
      })
      .map((child) => child.href);
  });
  if (["admin", "super_admin"].includes(roleName)) paths.push("/dashboard/admin/leave");
  return paths;
}

export function hasTechnicalGroupAccess(groups: readonly { name: string }[] | null | undefined) {
  return Boolean(groups?.some((group) => isTechnicalGroupName(group.name)));
}

export function getUserDashboardMenu(userOrRole: AuthUser | string, hasAssignmentGroup = false): DashboardMenuLink[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const menu = [...(roleName === "user" ? USER_MENU : [])];
  if (hasAssignmentGroup && roleName === "user") {
    menu.push(ASSIGNMENT_MENU_ITEM);
  }
  return menu;
}

export function getGrowthDashboardTabs(userOrRole: AuthUser | string, hasSkillGroup = false, hasCapabilityGroup = false): GrowthDashboardTab[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const tabs: GrowthDashboardTab[] = [{ key: "profile", label: "成长档案" }];
  if (hasCapabilityGroup) {
    tabs.push({ key: "capabilities", label: "能力评价" });
  }
  if (hasSkillGroup || roleName === "super_admin") {
    tabs.push({ key: "skills", label: "技能树" });
  }
  return tabs;
}

export function getGrowthTabPath(tab: GrowthDashboardTabKey, currentSearch = "") {
  const search = new URLSearchParams(currentSearch);
  search.set("tab", tab);
  return `/dashboard/growth?${search.toString()}`;
}

export function getCoreDashboardMenu(): DashboardMenuLink[] {
	return [...CORE_DASHBOARD_MENU];
}

export function getDailyDashboardMenu(userOrRole: AuthUser | string = "user"): DashboardMenuLink[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const menu = [...DAILY_DASHBOARD_MENU];
  if (["admin", "super_admin"].includes(roleName)) {
    menu.splice(2, 0, {
      key: "leave-management",
      label: "请假管理",
      href: "/dashboard/admin/leave",
      iconKey: "people",
    });
  }
  return menu;
}

export function getVisibleAdminDashboardMenu(userOrRole: AuthUser | string, hasAssignmentGroup = false): VisibleDashboardAdminMenuItem[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const accessiblePaths = getAccessibleAdminPaths(roleName, hasAssignmentGroup);
  const visibleItems: VisibleDashboardAdminMenuItem[] = [];

  for (const item of ADMIN_MENU) {
    if (isDashboardMenuLinkDefinition(item)) {
      if (accessiblePaths.includes(item.href)) {
        visibleItems.push({
          key: item.key,
          label: item.label,
          href: item.href,
          iconKey: item.iconKey,
        });
      }
      continue;
    }

    const children = item.children.filter((child) => accessiblePaths.includes(child.href));
    if (children.length === 0) {
      continue;
    }

    visibleItems.push({
      key: item.key,
      label: item.label,
      iconKey: item.iconKey,
      children,
    });
  }

  return visibleItems;
}

export function hasDashboardAdminAccess(roleName: string) {
  return getAccessibleAdminPaths(roleName).length > 0;
}

export function isDashboardMenuPathActive(pathname: string, href: string) {
  if (pathname === href) {
    return true;
  }

  return href !== "/dashboard/admin" && pathname.startsWith(`${href}/`);
}

export function getDefaultDashboardPath(_roleName: string) {
  return "/dashboard";
}

export function canAccessDashboardAdminPath(userOrRole: AuthUser | string, pathname: string, hasAssignmentGroup = false) {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const accessiblePaths = getAccessibleAdminPaths(roleName, hasAssignmentGroup);
  return accessiblePaths.some(
    (href) => href === "/dashboard/admin" || href === "/dashboard/admin/leave"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`),
  );
}
