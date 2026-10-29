import { apiRequest } from "~/lib/api-client";

export type CapabilitySourceType = "assignment" | "practice_project";

export interface CapabilitySourceRef {
  type: CapabilitySourceType;
  id: number;
}

export interface CapabilityGrowthEvent {
  id: number;
  sourceType: CapabilitySourceType | "manual";
  sourceTitle: string;
  evaluatedAt: string;
}

export interface CapabilityEvaluationSource extends CapabilityGrowthEvent {
  sourceId?: number;
  score: number;
  decision?: "passed" | "needs_redo";
  reviewerName?: string;
  comment?: string;
}

export interface CapabilityDimensionResult {
  id: number;
  name: string;
  description: string;
  active?: boolean;
  score: number | null;
  evaluationCount: number;
  history?: CapabilityGrowthEvent[];
  sources?: CapabilityEvaluationSource[];
}

export interface CapabilityGroupResult {
  groupId: number;
  groupName: string;
  dimensions: CapabilityDimensionResult[];
}

export interface CapabilityMineResult {
  groups: CapabilityGroupResult[];
}

export interface CapabilityGroup {
  id: number;
  name: string;
}

export interface CapabilitySourceOption extends CapabilitySourceRef {
  title: string;
}

export interface CapabilityDimension {
  id: number;
  groupId: number;
  name: string;
  description: string;
  sortOrder: number;
  active: boolean;
  sources: CapabilitySourceRef[];
}

export interface CapabilityMemberSummary {
  userId: number;
  displayName: string;
  dimensions: CapabilityDimensionResult[];
}

export interface CapabilityAdminGroup {
  groupId: number;
  groupName: string;
  dimensions: CapabilityDimension[];
  sources: CapabilitySourceOption[];
  members: CapabilityMemberSummary[];
}

export interface CapabilityAdminMember extends CapabilityGroupResult {
  userId: number;
  displayName: string;
}

export interface CapabilityDimensionInput {
  groupId?: number;
  name: string;
  description: string;
  sortOrder: number;
  sources: CapabilitySourceRef[];
}

function groupQuery(groupId: number) {
  return new URLSearchParams({ groupId: String(groupId) }).toString();
}

export const capabilitiesClient = {
  mine: () => apiRequest<CapabilityMineResult>("/api/capabilities/me"),
  adminGroups: () => apiRequest<CapabilityGroup[]>("/api/admin/capabilities/groups"),
  adminGroup: (groupId: number) => apiRequest<CapabilityAdminGroup>(`/api/admin/capabilities?${groupQuery(groupId)}`),
  adminMember: (groupId: number, userId: number) =>
    apiRequest<CapabilityAdminMember>(`/api/admin/capabilities/groups/${groupId}/members/${userId}`),
  createDimension: (input: CapabilityDimensionInput) =>
    apiRequest<CapabilityDimension>("/api/admin/capabilities/dimensions", { method: "POST", body: input }),
  updateDimension: (id: number, input: CapabilityDimensionInput) =>
    apiRequest<CapabilityDimension>(`/api/admin/capabilities/dimensions/${id}`, { method: "PUT", body: input }),
  deleteDimension: (id: number) =>
    apiRequest<{ id: number }>(`/api/admin/capabilities/dimensions/${id}`, { method: "DELETE" }),
  addManualReview: (groupId: number, userId: number, input: { dimensionId: number; score: number; comment: string }) =>
    apiRequest<CapabilityAdminMember>(`/api/admin/capabilities/groups/${groupId}/members/${userId}/reviews`, { method: "POST", body: input }),
};

export function capabilitySourceLabel(type: CapabilitySourceType | "manual") {
  if (type === "assignment") return "作业";
  if (type === "practice_project") return "实践项目";
  return "人工评价";
}

export function formatCapabilityDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}
