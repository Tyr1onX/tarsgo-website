import { apiRequest } from "~/lib/api-client";

export interface ExpeditionProjectMilestone {
  id: number;
  groupId?: number;
  groupName?: string;
  name: string;
  criteria: string;
  dueAt?: string;
  state: "open" | "submitted" | "accepted";
  acceptedAt?: string;
}

export interface ExpeditionProjectEvent {
  id: number;
  milestoneId?: number;
  groupId?: number;
  groupName?: string;
  actorName: string;
  action: "project_created" | "milestone_added" | "evidence_submitted" | "milestone_accepted" | "acceptance_revoked";
  content: string;
  createdAt: string;
}

export interface ExpeditionProject {
  id: number;
  title: string;
  objective: string;
  visibility: "team" | "participants";
  creatorName: string;
  participantGroups: string[];
  participants: { userId: number; displayName: string; groupName: string }[];
  milestones: ExpeditionProjectMilestone[];
  events: ExpeditionProjectEvent[];
  acceptedGroupNames: string[];
  hasAcceptedJoint: boolean;
  createdAt: string;
}

export interface ExpeditionProjectInput {
  title: string;
  objective: string;
  visibility: "team" | "participants";
  milestones: { groupId: number | null; name: string; criteria: string; dueAt?: string }[];
  participants: { groupId: number; userId: number }[];
}

export interface ExpeditionGroupMemberOption {
  userId: number;
  displayName: string;
}

export const expeditionProjectClient = {
  listMine: () => apiRequest<ExpeditionProject[]>("/api/expedition/projects"),
  listAdmin: () => apiRequest<ExpeditionProject[]>("/api/admin/expedition/projects"),
  groupMembers: (groupId: number) => apiRequest<ExpeditionGroupMemberOption[]>(`/api/admin/expedition/group-members?groupId=${groupId}`),
  create: (input: ExpeditionProjectInput) => apiRequest<ExpeditionProject>("/api/admin/expedition/projects", { method: "POST", body: input }),
  submitEvidence: (milestoneId: number, content: string) => apiRequest<ExpeditionProject>(`/api/expedition/milestones/${milestoneId}/evidence`, { method: "POST", body: { content } }),
  review: (milestoneId: number, action: "accept" | "revoke", content: string) => apiRequest<ExpeditionProject>(`/api/admin/expedition/milestones/${milestoneId}/review`, { method: "POST", body: { action, content } }),
};

export function expeditionMilestoneStateLabel(state: ExpeditionProjectMilestone["state"]) {
  switch (state) {
    case "submitted": return "待验收";
    case "accepted": return "已验收";
    default: return "进行中";
  }
}

export function expeditionEventLabel(action: ExpeditionProjectEvent["action"]) {
  switch (action) {
    case "evidence_submitted": return "提交成果";
    case "milestone_accepted": return "验收通过";
    case "acceptance_revoked": return "撤销验收";
    case "milestone_added": return "建立阶段";
    default: return "建立项目";
  }
}

export function formatExpeditionDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
