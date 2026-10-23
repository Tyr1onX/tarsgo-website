import { apiRequest } from "~/lib/api-client";

export type SkillState = "locked" | "available" | "practiced" | "mastered";

export interface SkillGroup {
  id: number;
  name: string;
}

export interface SkillNode {
  id: number;
  groupId: number;
  name: string;
  description: string;
  learningGoal: string;
  passingCriteria: string;
  sortOrder: number;
  active: boolean;
  prerequisiteIds: number[];
  assignmentIds: number[];
  canDelete?: boolean;
  deleteBlockReason?: string;
  state?: SkillState;
  startedAt?: string;
  reviewHistory?: SkillReviewEvent[];
}

export interface SkillReviewEvent {
  id: number;
  skillName: string;
  action: "mastered" | "revoked";
  actorId: number;
  actorName: string;
  evidenceType: "assignment" | "question" | "note";
  evidenceId?: number;
  evidenceNote: string;
  createdAt: string;
}

export interface SkillGroupProgress extends SkillGroup {
  nodes: SkillNode[];
}

export interface SkillMember {
  userId: number;
  displayName: string;
  state: SkillState;
  startedAt?: string;
  reviewHistory?: SkillReviewEvent[];
}

export interface SkillNodeInput {
  groupId: number;
  name: string;
  description: string;
  learningGoal: string;
  passingCriteria: string;
  sortOrder: number;
}

function query(params: Record<string, number>) {
  return new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
}

export const skillsClient = {
  listMine: () => apiRequest<{ groups: SkillGroupProgress[] }>("/api/skills/me"),
  start: (nodeId: number) => apiRequest<SkillNode>(`/api/skills/nodes/${nodeId}/start`, { method: "POST" }),
  adminGroups: () => apiRequest<SkillGroup[]>("/api/admin/skills/groups"),
  adminNodes: (groupId: number) => apiRequest<SkillNode[]>(`/api/admin/skills/nodes?${query({ groupId })}`),
  reorderLayout: (groupId: number, orders: Array<{ nodeId: number; sortOrder: number }>) =>
    apiRequest<{ updated: number }>(`/api/admin/skills/groups/${groupId}/layout`, { method: "PUT", body: { orders } }),
  create: (input: SkillNodeInput) => apiRequest<SkillNode>("/api/admin/skills/nodes", { method: "POST", body: input }),
  update: (nodeId: number, input: SkillNodeInput) => apiRequest<SkillNode>(`/api/admin/skills/nodes/${nodeId}`, { method: "PUT", body: input }),
  setActive: (nodeId: number, active: boolean) => apiRequest<{ active: boolean }>(`/api/admin/skills/nodes/${nodeId}/active`, { method: "PATCH", body: { active } }),
  deleteNode: (nodeId: number) => apiRequest<{ id: number }>(`/api/admin/skills/nodes/${nodeId}`, { method: "DELETE" }),
  setPrerequisites: (nodeId: number, prerequisiteIds: number[]) => apiRequest<{ prerequisiteIds: number[] }>(`/api/admin/skills/nodes/${nodeId}/prerequisites`, { method: "PUT", body: { prerequisiteIds } }),
  setAssignments: (nodeId: number, assignmentIds: number[]) => apiRequest<{ assignmentIds: number[] }>(`/api/admin/skills/nodes/${nodeId}/assignments`, { method: "PUT", body: { assignmentIds } }),
  members: (groupId: number, skillNodeId: number) => apiRequest<SkillMember[]>(`/api/admin/skills/members?${query({ groupId, skillNodeId })}`),
  history: (nodeId: number, userId: number) => apiRequest<SkillReviewEvent[]>(`/api/admin/skills/nodes/${nodeId}/members/${userId}/history`),
  review: (nodeId: number, userId: number, input: { action: "mastered" | "revoked"; evidenceType: "assignment" | "question" | "note"; evidenceId?: number; evidenceNote: string }) =>
    apiRequest<SkillReviewEvent[]>(`/api/admin/skills/nodes/${nodeId}/members/${userId}/reviews`, { method: "POST", body: input }),
};

export function skillStateLabel(state: SkillState) {
  switch (state) {
    case "available": return "可挑战";
    case "practiced": return "已实践";
    case "mastered": return "已掌握";
    default: return "未解锁";
  }
}

export function skillEvidenceHref(event: SkillReviewEvent, groupId: number, admin = false) {
  if (!event.evidenceId) return null;
  if (event.evidenceType === "assignment") {
    return admin
      ? `/dashboard/admin/training/submissions?assignmentId=${event.evidenceId}`
      : `/dashboard/assignments?assignmentId=${event.evidenceId}`;
  }
  if (event.evidenceType === "question" && !admin) {
    return `/dashboard/questions?groupId=${groupId}&questionId=${event.evidenceId}`;
  }
  return null;
}

export function skillEvidenceLabel(event: SkillReviewEvent) {
  if (event.evidenceType === "assignment") return `关联作业 #${event.evidenceId}`;
  if (event.evidenceType === "question") return `答疑记录 #${event.evidenceId}`;
  return "实操或成果说明";
}

export function formatSkillDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}
