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
  {
    key: "leave-workbench",
    label: "请假工作台",
    href: "/dashboard/leave",
    iconKey: "report",
  },
];

const GROWTH_MENU_ITEM: DashboardMenuLink = {
  key: "my-growth",
  label: "我的成长",
  href: "/dashboard/growth",
  iconKey: "report",
};

const EXPEDITION_MENU_ITEM: DashboardMenuLink = {
  key: "tars-base-expedition",
  label: "TARS BASE",
  href: "/dashboard/expedition",
  iconKey: "dashboard",
};

const ASSIGNMENT_MENU_ITEM: DashboardMenuLink = {
  key: "my-assignments",
  label: "我的作业",
  href: "/dashboard/assignments",
  iconKey: "report",
};

const TRAINING_QUESTIONS_MENU_ITEM: DashboardMenuLink = {
  key: "training-questions",
  label: "提问答疑",
  href: "/dashboard/questions",
  iconKey: "report",
};

const TECHNICAL_GROUP_NAMES = new Set(["机械组", "电控组", "视觉组", "AI组"]);
const SKILL_GROUP_NAMES = new Set([...TECHNICAL_GROUP_NAMES, "运营组"]);

export function isTechnicalGroupName(name: string) {
  return TECHNICAL_GROUP_NAMES.has(name);
}

export function hasSkillGroupAccess(groups: readonly { name: string }[] | null | undefined) {
	return Boolean(groups?.some((group) => SKILL_GROUP_NAMES.has(group.name)));
}

export function canAccessExpedition(userOrRole: AuthUser | string, hasSkillGroup: boolean) {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  return hasSkillGroup || roleName === "super_admin";
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
    key: "practice-projects",
    label: "实践项目",
    href: "/dashboard/practice-projects",
    iconKey: "people",
  },
  {
    key: "personal-timetable",
    label: "我的课表",
    href: "/dashboard/timetable",
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
      {
        key: "training-question-management",
        label: "答疑管理",
        href: "/dashboard/admin/training/questions",
        allowedRoles: ["admin", "super_admin"],
      },
      {
        key: "skill-route-management",
        label: "技能路线管理",
        href: "/dashboard/admin/training/skills",
        allowedRoles: ["admin", "super_admin"],
      },
      {
        key: "expedition-project-management",
        label: "赛季协作",
        href: "/dashboard/admin/training/expedition",
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
        key: "leave-management",
        label: "请假管理",
        href: "/dashboard/admin/leave",
        allowedRoles: ["admin", "super_admin"],
      },
      {
        key: "practice-project-management",
        label: "实践项目管理",
        href: "/dashboard/admin/training/practice-projects",
        allowedRoles: ["admin", "super_admin"],
      },
      {
        key: "capability-management",
        label: "能力评价管理",
        href: "/dashboard/admin/training/capabilities",
        allowedRoles: ["admin", "super_admin"],
      },
      {
        key: "cultivation-view",
        label: "人员培养",
        href: "/dashboard/admin/cultivation",
        allowedRoles: ["admin", "super_admin"],
      },
      {
        key: "timetable-availability",
        label: "组内空闲分析",
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

function getAccessibleAdminPaths(roleName: string, hasTechnicalGroup = false, hasSkillGroup = hasTechnicalGroup, hasCapabilityGroup = hasSkillGroup) {
  return ADMIN_MENU.flatMap((item) => {
    if (isDashboardMenuLinkDefinition(item)) {
      return isRoleAllowed(roleName, item.allowedRoles) ? [item.href] : [];
    }

    return item.children
      .filter((child) => {
        if (!isRoleAllowed(roleName, child.allowedRoles)) return false;
        if (roleName === "super_admin") return true;
        if (child.key === "capability-management") return hasCapabilityGroup;
        if (child.key === "cultivation-view") return hasCapabilityGroup;
        if (child.key === "skill-route-management") return hasSkillGroup;
        if (child.key === "expedition-project-management") return hasSkillGroup;
        if (item.key === "newcomer-training") return hasTechnicalGroup;
        return true;
      })
      .map((child) => child.href);
  });
}

export function hasTechnicalGroupAccess(groups: readonly { name: string }[] | null | undefined) {
  return Boolean(groups?.some((group) => isTechnicalGroupName(group.name)));
}

export function getUserDashboardMenu(userOrRole: AuthUser | string, hasTechnicalGroup = false, hasSkillGroup = hasTechnicalGroup): DashboardMenuLink[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const menu = [...(roleName === "user" ? USER_MENU : []), GROWTH_MENU_ITEM];
  if ((hasSkillGroup || roleName === "super_admin") && ["user", "admin", "super_admin"].includes(roleName)) {
    menu.push(EXPEDITION_MENU_ITEM);
  }
  if (hasTechnicalGroup && ["user", "admin", "super_admin"].includes(roleName)) {
    menu.push(TRAINING_QUESTIONS_MENU_ITEM, ASSIGNMENT_MENU_ITEM);
  }
  return menu;
}

export function getGrowthDashboardTabs(userOrRole: AuthUser | string, hasSkillGroup = false, hasCapabilityGroup = false): GrowthDashboardTab[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const tabs: GrowthDashboardTab[] = [{ key: "profile", label: "成长档案" }];
  if (hasCapabilityGroup) {
    tabs.push({ key: "capabilities", label: "能力雷达" });
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

export function getDailyDashboardMenu(): DashboardMenuLink[] {
  return [...DAILY_DASHBOARD_MENU];
}

export function getVisibleAdminDashboardMenu(userOrRole: AuthUser | string, hasTechnicalGroup = false, hasSkillGroup = hasTechnicalGroup, hasCapabilityGroup = hasSkillGroup): VisibleDashboardAdminMenuItem[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const accessiblePaths = getAccessibleAdminPaths(roleName, hasTechnicalGroup, hasSkillGroup, hasCapabilityGroup);
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

export function canAccessDashboardAdminPath(userOrRole: AuthUser | string, pathname: string, hasTechnicalGroup = false, hasSkillGroup = hasTechnicalGroup, hasCapabilityGroup = hasSkillGroup) {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const accessiblePaths = getAccessibleAdminPaths(roleName, hasTechnicalGroup, hasSkillGroup, hasCapabilityGroup);
  return accessiblePaths.some(
    (href) => href === "/dashboard/admin"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`),
  );
}
