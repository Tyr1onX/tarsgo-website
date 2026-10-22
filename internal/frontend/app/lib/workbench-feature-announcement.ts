export const FEATURE_GUIDE_DATE = "2026 年 10 月 22 日";
export const FEATURE_GUIDE_TITLE = "吉甲大师官网更新｜新人培养与 TARS BASE 使用指南";

const TECHNICAL_GROUPS = ["机械组", "电控组", "视觉组", "AI组"] as const;
const ALL_SKILL_GROUPS = [...TECHNICAL_GROUPS, "运营组"] as const;

export type WorkbenchFeatureKey = "assignments" | "questions" | "growth" | "skills" | "base" | "collaboration";
export type WorkbenchFeatureAudience = "all" | "technical" | "skill-groups";

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
    status: "已上线 · 试运行",
    audience: "technical",
    audienceLabel: "机械组、电控组、视觉组、AI组",
    description: "查看作业、下载教学资料、上传文件、查看批改结果及退回重做。作业由各技术组管理员发布。",
    href: "/dashboard/assignments",
    action: "打开我的作业",
    adminHref: "/dashboard/admin/training/assignments",
    adminAction: "管理本组作业",
  },
  {
    key: "questions",
    title: "提问答疑",
    status: "已上线 · 试运行",
    audience: "technical",
    audienceLabel: "机械组、电控组、视觉组、AI组",
    description: "支持公开或私密提问、图片、追问、解决状态及 FAQ；组内知识内容仍在积累。",
    href: "/dashboard/questions",
    action: "进入提问答疑",
    adminHref: "/dashboard/admin/training/questions",
    adminAction: "管理本组答疑",
  },
  {
    key: "growth",
    title: "我的成长",
    status: "已上线 · 持续完善",
    audience: "all",
    audienceLabel: "所有成员",
    description: "根据真实作业、答疑、技能确认等记录形成成长档案；运营组可记录工作周报。",
    href: "/dashboard/growth",
    action: "查看我的成长",
  },
  {
    key: "skills",
    title: "技能路线",
    status: "测试阶段 · 待配置",
    audience: "skill-groups",
    audienceLabel: "机械组、电控组、视觉组、AI组及运营组",
    description: "技能树、挑战和审核功能已开发，但各组正式技能节点、培养目标及考核标准尚待配置，不代表正式考核已经开始。",
    href: "/dashboard/skills",
    action: "查看技能路线",
    adminHref: "/dashboard/admin/training/skills",
    adminAction: "配置本组路线",
  },
  {
    key: "base",
    title: "TARS BASE",
    status: "V1 体验版",
    audience: "skill-groups",
    audienceLabel: "机械组、电控组、视觉组、AI组及运营组",
    description: "六大设施及设备交互已开放体验。部分技能点亮、装配效果及成长展示依赖真实业务数据，仍将持续优化。",
    href: "/dashboard/expedition",
    action: "进入 TARS BASE",
  },
  {
    key: "collaboration",
    title: "赛季协作",
    status: "测试阶段 · 待开放",
    audience: "skill-groups",
    audienceLabel: "机械组、电控组、视觉组、AI组及运营组",
    description: "项目、里程碑和成果验收功能已实现，具体赛季协作项目仍需负责人创建和安排。",
    href: "/dashboard/expedition/projects",
    action: "查看协作项目",
    adminHref: "/dashboard/admin/training/expedition",
    adminAction: "管理协作项目",
  },
] as const;

export function getWorkbenchFeaturesForMember(roleName: string, groupNames: readonly string[] = []) {
  const isSuperAdmin = roleName === "super_admin";
  const hasTechnicalGroup = groupNames.some((name) => TECHNICAL_GROUPS.includes(name as (typeof TECHNICAL_GROUPS)[number]));
  const hasSkillGroup = groupNames.some((name) => ALL_SKILL_GROUPS.includes(name as (typeof ALL_SKILL_GROUPS)[number]));

  return WORKBENCH_FEATURES.filter((feature) => {
    if (isSuperAdmin) return true;
    if (feature.audience === "all") return true;
    if (feature.audience === "technical") return hasTechnicalGroup;
    return hasSkillGroup;
  });
}

export function getWorkbenchAdminAction(feature: WorkbenchFeature, roleName: string, groupNames: readonly string[] = []) {
  if (!feature.adminHref || !feature.adminAction || !["admin", "super_admin"].includes(roleName)) return null;
  if (roleName === "super_admin") return { href: feature.adminHref, label: feature.adminAction };
  const requiredGroups = feature.audience === "technical" ? TECHNICAL_GROUPS : ALL_SKILL_GROUPS;
  if (!requiredGroups.some((name) => groupNames.includes(name))) return null;
  return { href: feature.adminHref, label: feature.adminAction };
}
