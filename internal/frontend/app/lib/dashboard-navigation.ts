import type { AuthUser } from "~/lib/auth-client";

export type DashboardMenuIconKey = "community" | "transactions" | "team" | "dashboard" | "people" | "user" | "registration" | "settings" | "analytics" | "report";

export type DashboardSectionKey = "community" | "profile";

export type DashboardMenuLink = {
  key: string;
  label: string;
  href: string;
  iconKey?: DashboardMenuIconKey;
};

export type DashboardMenuGroup = {
  key: string;
  label: string;
  iconKey?: DashboardMenuIconKey;
  children: readonly DashboardMenuLink[];
};

type DashboardAllowedRoles = readonly string[];

type AdminMenuLeaf = DashboardMenuLink & {
  allowedRoles: DashboardAllowedRoles;
  requiresAssignmentGroup?: boolean;
};

type AdminMenuGroup = Omit<DashboardMenuGroup, "children"> & {
  children: readonly AdminMenuLeaf[];
};

const MY_REGISTRATION_ITEM: DashboardMenuLink = { key: "users-registrations", label: "我的报名", href: "/dashboard/users/registrations", iconKey: "registration" };

const ASSIGNMENT_MENU_ITEM: DashboardMenuLink = {
  key: "my-assignments",
  label: "我的作业",
  href: "/dashboard/assignments",
  iconKey: "report",
};

const ASSIGNMENT_GROUP_NAMES = new Set(["机械组", "电控组", "视觉组", "AI组", "运营组"]);

const DASHBOARD_SECTION_MENU: readonly DashboardMenuLink[] = [
  { key: "community", label: "社区", href: "/dashboard", iconKey: "community" },
];

const ADMIN_MENU: readonly AdminMenuGroup[] = [
  {
    key: "members-training",
    label: "成员与培养",
    iconKey: "people",
    children: [
      { key: "accounts", label: "账号与权限", href: "/dashboard/admin/users", allowedRoles: ["super_admin"] },
      { key: "assignment-management", label: "作业管理", href: "/dashboard/admin/training/assignments", allowedRoles: ["admin", "super_admin"], requiresAssignmentGroup: true },
      { key: "training-assessments", label: "培训成绩与能力", href: "/dashboard/admin/training/assessments", allowedRoles: ["admin", "super_admin"], requiresAssignmentGroup: true },
    ],
  },
  {
    key: "recruitment",
    label: "招新",
    iconKey: "registration",
    children: [
      { key: "candidate-processing", label: "候选人处理", href: "/dashboard/admin/registrations", allowedRoles: ["admin", "super_admin"] },
      { key: "recruitment-management", label: "招新设置", href: "/dashboard/admin/recruitment", allowedRoles: ["super_admin"] },
      { key: "recruitment-analytics", label: "招新数据", href: "/dashboard/admin/recruitment-analytics", allowedRoles: ["super_admin"] },
    ],
  },
  {
    key: "collaboration-operations",
    label: "协作与运营",
    iconKey: "settings",
    children: [
      { key: "collection-forms", label: "收集表", href: "/dashboard/admin/forms", allowedRoles: ["admin", "super_admin"] },
      { key: "timetable-availability", label: "时间协调", href: "/dashboard/admin/timetable-availability", allowedRoles: ["admin", "super_admin"] },
      { key: "email-management", label: "邮件管理", href: "/dashboard/admin/email", allowedRoles: ["super_admin"] },
    ],
  },
];

const TECHNICAL_PROGRESS_ITEM: AdminMenuLeaf = {
  key: "team-state", label: "技术研发总览", href: "/dashboard/admin/team-state", allowedRoles: ["super_admin"], iconKey: "analytics",
};

const TEAM_INFORMATION: DashboardMenuGroup = {
  key: "team-information",
  label: "战队信息",
  iconKey: "team",
  children: [
    { key: "team-status", label: "运营动态", href: "/dashboard/workbench/operations", iconKey: "analytics" },
    { key: "people-directory", label: "成员与岗位", href: "/dashboard/workbench/organization", iconKey: "team" },
  ],
};

export function hasOperationsWorkManualAccess(userOrRole: AuthUser | string, groups: readonly { name: string }[] | null | undefined) {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  return roleName === "super_admin" || Boolean(groups?.some((group) => group.name === "运营组"));
}

export function hasAssignmentGroupAccess(groups: readonly { name: string }[] | null | undefined) {
  return Boolean(groups?.some((group) => ASSIGNMENT_GROUP_NAMES.has(group.name)));
}

export function isAssignmentGroupName(name: string) {
  return ASSIGNMENT_GROUP_NAMES.has(name);
}

function isRoleAllowed(roleName: string, allowedRoles: DashboardAllowedRoles) {
  return allowedRoles.includes(roleName);
}

function getAccessibleAdminMenu(roleName: string, hasAssignmentGroup = false): DashboardMenuGroup[] {
  return ADMIN_MENU.map((group) => ({
    ...group,
    children: group.children.filter((item) => isRoleAllowed(roleName, item.allowedRoles)
      && (!item.requiresAssignmentGroup || roleName === "super_admin" || hasAssignmentGroup)),
  })).filter(({ children }) => children.length > 0);
}

function getAccessibleAdminPaths(roleName: string, hasAssignmentGroup = false) {
  const paths = getAccessibleAdminMenu(roleName, hasAssignmentGroup).flatMap(({ children }) => children.map(({ href }) => href));
  if (isRoleAllowed(roleName, TECHNICAL_PROGRESS_ITEM.allowedRoles)) paths.push(TECHNICAL_PROGRESS_ITEM.href);
  if (["admin", "super_admin"].includes(roleName)) paths.push("/dashboard/admin/leave");
  return paths;
}

export function hasWorkbenchAccess(user: Pick<AuthUser, "workbenchAccess">) {
  return user.workbenchAccess === true;
}

// Community, member profiles, recruitment and training materials remain available independently.
export function isInternalDashboardPath(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path.startsWith("/dashboard/")
    && !/^\/dashboard\/(community|members)\/[^/]+$/.test(path)
    && path !== "/dashboard/users/registrations"
    && path !== "/dashboard/training-materials"
    && path !== "/dashboard/questions"
    && !path.startsWith("/dashboard/admin/") && path !== "/dashboard/admin";
}

export function getDashboardSectionMenu(currentUser: AuthUser): DashboardMenuLink[] {
  return [
    ...DASHBOARD_SECTION_MENU,
    { key: "my-profile", label: "我的主页", href: `/dashboard/members/${currentUser.id}`, iconKey: "user" },
  ];
}

export function isDashboardSectionItemActive(sectionKey: DashboardSectionKey | null, itemKey: string) {
  return sectionKey === itemKey || (itemKey === "my-profile" && sectionKey === "profile");
}

export function getDashboardSectionKey(pathname: string, currentUserID?: number): DashboardSectionKey | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/dashboard" || path.startsWith("/dashboard/community/") || path === "/dashboard/questions") return "community";
  const memberProfileMatch = path.match(/^\/dashboard\/members\/(\d+)$/);
  if (memberProfileMatch && Number(memberProfileMatch[1]) === currentUserID) return "profile";
  return null;
}

export function getUnifiedDashboardMenu(currentUser: AuthUser, hasAssignmentGroup = false): DashboardMenuGroup[] {
  const hasWorkbench = hasWorkbenchAccess(currentUser);
  const personalLinks: DashboardMenuLink[] = [
    ...(hasWorkbench ? [
      { key: "weekly-reports", label: "工作周报", href: "/dashboard/weekly-reports", iconKey: "report" as const },
      ...(hasAssignmentGroup ? [ASSIGNMENT_MENU_ITEM] : []),
    ] : []),
    { key: "training-materials", label: "资料中心", href: "/dashboard/training-materials", iconKey: "report" as const },
    ...(hasWorkbench ? [{ key: "leave-workbench", label: "请假", href: "/dashboard/leave", iconKey: "report" as const }] : []),
    ...(currentUser.role.name === "user" ? [MY_REGISTRATION_ITEM] : []),
  ];
  return [
    ...(personalLinks.length > 0 ? [{ key: "daily-work", label: "日常事务", iconKey: "report" as const, children: personalLinks }] : []),
    ...getAccessibleAdminMenu(currentUser.role.name, hasAssignmentGroup).map((group) => ({
      ...group,
      children: group.children.map(({ key, label, href, iconKey }) => ({ key, label, href, iconKey })),
    })),
    ...(hasWorkbench ? [{
      ...TEAM_INFORMATION,
      children: [
        ...[TECHNICAL_PROGRESS_ITEM].filter((item) => isRoleAllowed(currentUser.role.name, item.allowedRoles))
          .map(({ key, label, href, iconKey }) => ({ key, label, href, iconKey })),
        ...TEAM_INFORMATION.children,
      ],
    }] : []),
    {
      key: "interactive-experience",
      label: "互动体验",
      children: [
        { key: "pixel-jijia", label: "像素吉甲", href: "/pixel-jijia" },
        { key: "battle-simulation", label: "战场模拟", href: "/pixel-jijia/arena" },
      ],
    },
  ];
}

export function hasDashboardAdminAccess(roleName: string) {
  return getAccessibleAdminPaths(roleName).some((path) => path.startsWith("/dashboard/admin/"));
}

export function isDashboardMenuPathActive(pathname: string, href: string) {
  if (pathname === href) return true;
  return href !== "/dashboard/admin" && pathname.startsWith(`${href}/`);
}

export function getDefaultDashboardPath(_roleName: string) {
  return "/dashboard";
}

export function canAccessDashboardAdminPath(userOrRole: AuthUser | string, pathname: string, hasAssignmentGroup = false) {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  if (pathname === "/dashboard/admin" || pathname === "/dashboard/admin/" || pathname === "/dashboard/leave") return hasDashboardAdminAccess(roleName);
  if (pathname === "/dashboard/admin/history") return roleName === "super_admin";
  if (pathname === "/dashboard/admin/leave") return ["admin", "super_admin"].includes(roleName);
  if (pathname.startsWith("/dashboard/admin/leave/")) return false;
  if (pathname === "/dashboard/admin/training/submissions") {
    return getAccessibleAdminPaths(roleName, hasAssignmentGroup).includes("/dashboard/admin/training/assignments");
  }
  const accessiblePaths = getAccessibleAdminPaths(roleName, hasAssignmentGroup);
  return accessiblePaths.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}