import type { AuthUser } from "~/lib/auth-client";

export type DashboardMenuIconKey = "dashboard" | "people" | "registration" | "team-management" | "settings";

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
    key: "users-home",
    label: "主页",
    href: "/dashboard/users",
    iconKey: "dashboard",
  },
  {
    key: "users-registrations",
    label: "纳新报名",
    href: "/dashboard/users/registrations",
    iconKey: "registration",
  },
];

const ADMIN_MENU: readonly DashboardMenuDefinition[] = [
  {
    key: "admin-panel",
    label: "工作台",
    href: "/dashboard/admin",
    iconKey: "dashboard",
    allowedRoles: ["super_admin", "admin"],
  },
  {
    key: "registration",
    label: "招新管理",
    iconKey: "registration",
    children: [
      {
        key: "form-config",
        label: "报名表配置",
        href: "/dashboard/admin/form-config",
        allowedRoles: ["super_admin"],
      },
      {
        key: "registrations",
        label: "报名处理",
        href: "/dashboard/admin/registrations",
        allowedRoles: ["super_admin", "admin"],
      },
    ],
  },
  {
    key: "portal-content",
    label: "内容管理",
    href: "/dashboard/admin/portal-content",
    iconKey: "team-management",
    allowedRoles: ["super_admin", "admin"],
  },
  {
    key: "recruitment-statistics",
    label: "统计",
    href: "/dashboard/admin/statistics",
    iconKey: "dashboard",
    allowedRoles: ["super_admin", "admin"],
  },
  {
    key: "people",
    label: "人员管理",
    iconKey: "people",
    children: [
      {
        key: "users",
        label: "用户数据",
        href: "/dashboard/admin/users",
        allowedRoles: ["super_admin", "admin"],
      },
      {
        key: "user-groups",
        label: "用户分组",
        href: "/dashboard/admin/user-groups",
        allowedRoles: ["super_admin"],
      },
    ],
  },
  {
    key: "system-config",
    label: "系统配置",
    iconKey: "settings",
    children: [
      {
        key: "system-config-email",
        label: "邮件服务",
        href: "/dashboard/admin/system-config/email",
        allowedRoles: ["super_admin"],
      },
      {
        key: "system-config-oauth",
        label: "第三方登录",
        href: "/dashboard/admin/system-config/oauth",
        allowedRoles: ["super_admin"],
      },
    ],
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

function getAccessibleAdminPaths(roleName: string, _user?: AuthUser) {
  return ADMIN_MENU.flatMap((item) => {
    if (isDashboardMenuLinkDefinition(item)) {
      return isRoleAllowed(roleName, item.allowedRoles) ? [item.href] : [];
    }

    return item.children
      .filter((child) => isRoleAllowed(roleName, child.allowedRoles))
      .map((child) => child.href);
  });
}

export function getUserDashboardMenu(user: AuthUser): DashboardMenuLink[] {
  return USER_MENU.filter((item) => {
    if (item.key === "users-registrations") {
      return Boolean(user.portal?.showRecruitmentEntry);
    }
    return true;
  });
}

export function getVisibleAdminDashboardMenu(userOrRole: AuthUser | string): VisibleDashboardAdminMenuItem[] {
	const user = typeof userOrRole === "string" ? undefined : userOrRole;
	const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
  const visibleItems: VisibleDashboardAdminMenuItem[] = [];

  for (const item of ADMIN_MENU) {
    if (isDashboardMenuLinkDefinition(item)) {
		if (getAccessibleAdminPaths(roleName, user).includes(item.href)) {
        visibleItems.push({
          key: item.key,
          label: item.label,
          href: item.href,
          iconKey: item.iconKey,
        });
      }
      continue;
    }

		const children = item.children.filter((child) => getAccessibleAdminPaths(roleName, user).includes(child.href));
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

export function getDefaultDashboardPath(roleName: string) {
  return hasDashboardAdminAccess(roleName) ? "/dashboard/admin" : "/dashboard/users";
}

export function canAccessDashboardAdminPath(userOrRole: AuthUser | string, pathname: string) {
	const roleName = typeof userOrRole === "string" ? userOrRole : userOrRole.role.name;
	const accessiblePaths = getAccessibleAdminPaths(roleName, typeof userOrRole === "string" ? undefined : userOrRole);
  return accessiblePaths.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
