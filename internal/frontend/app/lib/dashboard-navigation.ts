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
    label: "数据面板",
    href: "/dashboard/admin",
    iconKey: "dashboard",
    allowedRoles: ["super_admin", "admin"],
  },
  {
    key: "portal-content",
    label: "队务管理",
    href: "/dashboard/admin/portal-content",
    iconKey: "team-management",
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
    key: "registration",
    label: "报名管理",
    iconKey: "registration",
    children: [
      {
        key: "form-config",
        label: "表单配置",
        href: "/dashboard/admin/form-config",
        allowedRoles: ["super_admin"],
      },
      {
        key: "registrations",
        label: "报名列表",
        href: "/dashboard/admin/registrations",
        allowedRoles: ["super_admin", "admin"],
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
        label: "邮件发信",
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

export function getUserDashboardMenu(user: AuthUser): DashboardMenuLink[] {
  return USER_MENU.filter((item) => {
    if (item.key === "users-registrations") {
      return Boolean(user.portal?.showRecruitmentEntry);
    }
    return true;
  });
}

export function getVisibleAdminDashboardMenu(roleName: string): VisibleDashboardAdminMenuItem[] {
  const visibleItems: VisibleDashboardAdminMenuItem[] = [];

  for (const item of ADMIN_MENU) {
    if (isDashboardMenuLinkDefinition(item)) {
      if (isRoleAllowed(roleName, item.allowedRoles)) {
        visibleItems.push({
          key: item.key,
          label: item.label,
          href: item.href,
          iconKey: item.iconKey,
        });
      }
      continue;
    }

    const children = item.children.filter((child) =>
      isRoleAllowed(roleName, child.allowedRoles),
    );
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

export function canAccessDashboardAdminPath(roleName: string, pathname: string) {
  const accessiblePaths = getAccessibleAdminPaths(roleName);
  return accessiblePaths.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
