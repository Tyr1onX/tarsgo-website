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

const CORE_DASHBOARD_MENU: readonly DashboardMenuLink[] = [
  {
    key: "personal-workspace",
    label: "个人工作台",
    href: "/dashboard",
    iconKey: "dashboard",
  },
];

const ADMIN_MENU: readonly DashboardMenuDefinition[] = [
  {
    key: "admin-panel",
    label: "招新总览",
    href: "/dashboard/admin",
    iconKey: "dashboard",
    allowedRoles: ["super_admin", "admin"],
  },
  {
    key: "candidate-processing",
    label: "候选人处理",
    href: "/dashboard/admin/registrations",
    iconKey: "registration",
    allowedRoles: ["super_admin", "admin"],
  },
  {
    key: "recruitment-analytics",
    label: "招新数据分析",
    href: "/dashboard/admin/recruitment-analytics",
    iconKey: "analytics",
    allowedRoles: ["super_admin"],
  },
  {
	key: "recruitment-management",
	label: "招新管理",
	href: "/dashboard/admin/recruitment",
	iconKey: "registration",
	allowedRoles: ["super_admin"],
  },
  {
	key: "accounts",
	label: "账号与权限",
    iconKey: "people",
    href: "/dashboard/admin/users",
    allowedRoles: ["super_admin"],
  },
  {
    key: "email-management",
    label: "邮件管理",
    href: "/dashboard/admin/email",
    iconKey: "settings",
    allowedRoles: ["super_admin"],
  },
  {
    key: "leave-management",
    label: "请假管理",
    href: "/dashboard/admin/leave",
    iconKey: "report",
    allowedRoles: ["admin", "super_admin"],
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

function getAccessibleAdminPaths(roleName: string) {
  return ADMIN_MENU.flatMap((item) => {
    if (isDashboardMenuLinkDefinition(item)) {
      return isRoleAllowed(roleName, item.allowedRoles) ? [item.href] : [];
    }

    return item.children
      .filter((child) => isRoleAllowed(roleName, child.allowedRoles))
      .map((child) => child.href);
  });
}

export function getUserDashboardMenu(userOrRole: AuthUser | string): DashboardMenuLink[] {
	const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
	return roleName === "user" ? [...USER_MENU] : [];
}

export function getCoreDashboardMenu(isOperationsMember = false): DashboardMenuLink[] {
	return [
		...CORE_DASHBOARD_MENU,
		...(isOperationsMember ? [{
			key: "weekly-reports",
			label: "工作周报",
			href: "/dashboard/weekly-reports",
			iconKey: "report" as const,
		}] : []),
	];
}

export function getVisibleAdminDashboardMenu(userOrRole: AuthUser | string): VisibleDashboardAdminMenuItem[] {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const accessiblePaths = getAccessibleAdminPaths(roleName);
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

export function getDefaultDashboardPath(_roleName: string) {
  return "/dashboard";
}

export function canAccessDashboardAdminPath(userOrRole: AuthUser | string, pathname: string) {
  const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const accessiblePaths = getAccessibleAdminPaths(roleName);
  return accessiblePaths.some(
    (href) => href === "/dashboard/admin"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`),
  );
}
