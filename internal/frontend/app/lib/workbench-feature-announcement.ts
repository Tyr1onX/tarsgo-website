export const FEATURE_GUIDE_DATE = "2026 年 10 月 30 日";
export const FEATURE_GUIDE_TITLE = "吉甲大师工作台调整｜日常事务与作业指南";
export const GROUP_ACCESS_HELP = "工作台入口按账号角色和所属组别开放；组别信息有误或没有看到本组作业时，请联系战队运营负责人核对。";

const TECHNICAL_GROUPS = ["机械组", "电控组", "视觉组", "AI组"] as const;
const ASSIGNMENT_GROUPS = [...TECHNICAL_GROUPS, "运营组"] as const;

export type WorkbenchFeatureKey = "assignments" | "community";
export type WorkbenchFeatureAudience = "all" | "assignment-groups";

export interface WorkbenchFeature {
  key: WorkbenchFeatureKey;
  title: string;
  status: string;
  audience: WorkbenchFeatureAudience;
  audienceLabel: string;
  description: string;
  href: string;
  action: string;
  adminHref?: string;
  adminAction?: string;
}

export const WORKBENCH_FEATURES: readonly WorkbenchFeature[] = [
  {
    key: "assignments",
    title: "我的作业",
    status: "已开放",
    audience: "assignment-groups",
    audienceLabel: "机械组、电控组、视觉组、AI组、运营组",
    description: "查看本组作业、下载教学资料、提交成果，并查看批改意见或退回重做要求。作业由有权限的组内管理员管理。",
    href: "/dashboard/assignments",
    action: "打开我的作业",
    adminHref: "/dashboard/admin/training/assignments",
    adminAction: "管理本组作业",
  },
  {
    key: "community",
    title: "吉甲社区",
    status: "已开放",
    audience: "all",
    audienceLabel: "所有已启用的战队账号",
    description: "发布项目进展、交流技术经验、回复讨论并收藏值得回看的内容。历史答疑继续按原组别和私密范围展示。",
    href: "/dashboard",
    action: "进入吉甲社区",
  },
] as const;

export function getWorkbenchFeaturesForMember(roleName: string, groupNames: readonly string[] = []) {
  const isSuperAdmin = roleName === "super_admin";
  const hasAssignmentGroup = groupNames.some((name) => ASSIGNMENT_GROUPS.includes(name as (typeof ASSIGNMENT_GROUPS)[number]));
  return WORKBENCH_FEATURES.filter((feature) => feature.key === "community" || isSuperAdmin || hasAssignmentGroup);
}

export function getWorkbenchAdminAction(feature: WorkbenchFeature, roleName: string, groupNames: readonly string[] = []) {
  if (feature.key !== "assignments" || !feature.adminHref || !feature.adminAction || !["admin", "super_admin"].includes(roleName)) return null;
  if (roleName === "super_admin") return { href: feature.adminHref, label: feature.adminAction };
  if (!ASSIGNMENT_GROUPS.some((name) => groupNames.includes(name))) return null;
  return { href: feature.adminHref, label: feature.adminAction };
}
