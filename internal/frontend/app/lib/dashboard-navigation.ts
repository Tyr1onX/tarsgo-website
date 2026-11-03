import type { AuthUser } from "~/lib/auth-client";

export type DashboardMenuIconKey = "community" | "transactions" | "team" | "management" | "dashboard" | "people" | "user" | "registration" | "settings" | "analytics" | "report";

export type DashboardSectionKey = "community" | "workbench" | "profile" | "management";

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
  href?: string;
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

const USER_MENU: readonly DashboardMenuLink[] = [
  { key: "users-registrations", label: "我的报名", href: "/dashboard/users/registrations", iconKey: "registration" },
];

const ASSIGNMENT_MENU_ITEM: DashboardMenuLink = {
  key: "my-assignments",
  label: "我的作业",
  href: "/dashboard/assignments",
  iconKey: "report",
};

const TECHNICAL_GROUP_NAMES = new Set(["机械组", "电控组", "视觉组", "AI组"]);
const ASSIGNMENT_GROUP_NAMES = new Set([...TECHNICAL_GROUP_NAMES, "运营组"]);

const DASHBOARD_SECTION_MENU: readonly DashboardMenuLink[] = [
  { key: "community", label: "社区", href: "/dashboard", iconKey: "community" },
  { key: "workbench", label: "工作台", href: "/dashboard/workbench", iconKey: "transactions" },
  { key: "management", label: "管理", href: "/dashboard/admin", iconKey: "management" },
];

const ADMIN_MENU: readonly AdminMenuGroup[] = [
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
    key: "members-training",
    label: "成员与培养",
    iconKey: "people",
    children: [
      { key: "history-archive", label: "历史档案", href: "/dashboard/admin/history", allowedRoles: ["super_admin"] },
      { key: "accounts", label: "账号与权限", href: "/dashboard/admin/users", allowedRoles: ["super_admin"] },
      { key: "assignment-management", label: "作业管理", href: "/dashboard/admin/training/assignments", allowedRoles: ["admin", "super_admin"], requiresAssignmentGroup: true },
      { key: "assignment-submissions", label: "提交批改", href: "/dashboard/admin/training/submissions", allowedRoles: ["admin", "super_admin"], requiresAssignmentGroup: true },
    ],
  },
  {
    key: "collaboration-operations",
    label: "协作与运营",
    iconKey: "settings",
    children: [
      { key: "leave-workbench", label: "请假处理", href: "/dashboard/leave", allowedRoles: ["admin", "super_admin"] },
      { key: "timetable-availability", label: "时间协调", href: "/dashboard/admin/timetable-availability", allowedRoles: ["admin", "super_admin"] },
      { key: "email-management", label: "邮件管理", href: "/dashboard/admin/email", allowedRoles: ["super_admin"] },
    ],
  },
];

const WORKBENCH_MENU: readonly DashboardMenuGroup[] = [
  {
    key: "my-work",
    label: "我的事务",
    iconKey: "report",
    children: [],
  },
  {
    key: "people-directory",
    label: "成员与岗位",
    iconKey: "team",
    href: "/dashboard/workbench/organization",
    children: [],
  },
];

export function hasOperationsWorkManualAccess(userOrRole: AuthUser | string, groups: readonly { name: string }[] | null | undefined) {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  return roleName === "super_admin" || Boolean(groups?.some((group) => group.name === "运营组"));
}

export function isTechnicalGroupName(name: string) {
  return TECHNICAL_GROUP_NAMES.has(name);
}

export function hasAssignmentGroupAccess(groups: readonly { name: string }[] | null | undefined) {
  return Boolean(groups?.some((group) => ASSIGNMENT_GROUP_NAMES.has(group.name)));
}

export function isAssignmentGroupName(name: string) {
  return ASSIGNMENT_GROUP_NAMES.has(name);
}

export function canAccessExpedition(userOrRole: AuthUser | string, hasAssignmentGroup: boolean) {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  return hasAssignmentGroup || roleName === "super_admin";
}

export function isTemporarilyUnavailableDashboardPath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, "");
  const unavailablePaths = [
    "/dashboard/base",
    "/dashboard/practice-projects",
    "/dashboard/growth",
    "/dashboard/skills",
    "/dashboard/capabilities",
    "/dashboard/expedition",
    "/dashboard/admin/training/practice-projects",
    "/dashboard/admin/training/skills",
    "/dashboard/admin/training/capabilities",
    "/dashboard/admin/training/expedition",
    "/dashboard/admin/cultivation",
  ];
  return unavailablePaths.some((path) => normalizedPath === path || normalizedPath.startsWith(`${path}/`));
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
  if (["admin", "super_admin"].includes(roleName)) paths.push("/dashboard/admin/leave");
  return paths;
}

export function hasTechnicalGroupAccess(groups: readonly { name: string }[] | null | undefined) {
  return Boolean(groups?.some(({ name }) => isTechnicalGroupName(name)));
}

export function getUserDashboardMenu(userOrRole: AuthUser | string, hasAssignmentGroup = false): DashboardMenuLink[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const menu = [...(roleName === "user" ? USER_MENU : [])];
  if (hasAssignmentGroup && roleName === "user") menu.push(ASSIGNMENT_MENU_ITEM);
  return menu;
}

export function getDashboardSectionMenu(currentUser: AuthUser): DashboardMenuLink[] {
  const managementItem = DASHBOARD_SECTION_MENU.find((item) => item.key === "management");
  return [
    ...DASHBOARD_SECTION_MENU.filter((item) => item.key !== "management").map((item) => ({ ...item })),
    { key: "my-profile", label: "我的主页", href: `/dashboard/members/${currentUser.id}`, iconKey: "user" },
    ...(managementItem && hasDashboardAdminAccess(currentUser.role.name) ? [{ ...managementItem }] : []),
  ];
}

export function isDashboardSectionItemActive(sectionKey: DashboardSectionKey | null, itemKey: string) {
  return sectionKey === itemKey || (itemKey === "my-profile" && sectionKey === "profile");
}

export function getDashboardSectionKey(pathname: string, roleName = "user", currentUserID?: number): DashboardSectionKey | null {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/dashboard" || normalizedPath.startsWith("/dashboard/community/") || normalizedPath === "/dashboard/questions") {
    return "community";
  }
  if (normalizedPath === "/dashboard/admin" || normalizedPath.startsWith("/dashboard/admin/")) return "management";
  if (normalizedPath === "/dashboard/leave" && hasDashboardAdminAccess(roleName)) return "management";
  const memberProfileMatch = normalizedPath.match(/^\/dashboard\/members\/(\d+)$/);
  if (memberProfileMatch) return Number(memberProfileMatch[1]) === currentUserID ? "profile" : "workbench";

  if (
    normalizedPath === "/dashboard/workbench"
    || normalizedPath.startsWith("/dashboard/workbench/")
    || normalizedPath === "/dashboard/team"
    || [
      "/dashboard/weekly-reports",
      "/dashboard/updates",
      "/dashboard/leave",
      "/dashboard/guide",
      "/dashboard/timetable",
      "/dashboard/assignments",
      "/dashboard/users/registrations",
    ].includes(normalizedPath)
  ) {
    return "workbench";
  }
  return null;
}

export function getMyWorkbenchMenu(userOrRole: AuthUser | string, hasAssignmentGroup = false): DashboardMenuGroup[] {
  const myWorkLinks: DashboardMenuLink[] = [
    { key: "weekly-reports", label: "工作周报", href: "/dashboard/weekly-reports", iconKey: "report" },
    ...(hasAssignmentGroup ? [ASSIGNMENT_MENU_ITEM] : []),
    { key: "leave-workbench", label: "请假事务", href: "/dashboard/leave", iconKey: "report" },
    ...getUserDashboardMenu(userOrRole),
  ];
  return WORKBENCH_MENU.map((group) => group.key === "my-work" ? { ...group, children: myWorkLinks } : { ...group, children: [...group.children] });
}

export function getVisibleAdminDashboardMenu(userOrRole: AuthUser | string, hasAssignmentGroup = false): DashboardMenuGroup[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  return getAccessibleAdminMenu(roleName, hasAssignmentGroup).map((group) => ({
    ...group,
    children: group.children.map(({ key, label, href, iconKey }) => ({ key, label, href, iconKey })),
  }));
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
  if (pathname === "/dashboard/admin/leave") return ["admin", "super_admin"].includes(roleName);
  if (pathname.startsWith("/dashboard/admin/leave/")) return false;
  const accessiblePaths = getAccessibleAdminPaths(roleName, hasAssignmentGroup);
  return accessiblePaths.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}
