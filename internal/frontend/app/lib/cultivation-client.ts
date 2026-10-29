import { apiRequest } from "~/lib/api-client";
import type { CapabilityDimension, CapabilityDimensionResult } from "~/lib/capabilities-client";
import type { GrowthEvent } from "~/lib/growth-client";

export interface CultivationActivitySummary {
  total: number;
  completed: number;
}

export interface CultivationMemberSummary {
  userId: number;
  displayName: string;
  groupRole: string;
  dimensions: CapabilityDimensionResult[];
  overallScore: number | null;
  scoredDimensions: number;
  totalDimensions: number;
  assignments: CultivationActivitySummary;
  practiceProjects: CultivationActivitySummary;
  focused: boolean;
  internalNote?: string;
  focusUpdatedAt?: string;
  focusUpdatedBy?: string;
}

export interface CultivationGroup {
  groupId: number;
  groupName: string;
  dimensions: CapabilityDimension[];
  members: CultivationMemberSummary[];
}

export interface CultivationMember extends CultivationMemberSummary {
  groupId: number;
  groupName: string;
  practiceProjects: CultivationActivitySummary;
  events: GrowthEvent[];
}

export const cultivationClient = {
  group: (groupId: number) => apiRequest<CultivationGroup>(`/api/admin/cultivation?groupId=${groupId}`),
  member: (groupId: number, userId: number) => apiRequest<CultivationMember>(`/api/admin/cultivation/groups/${groupId}/members/${userId}`),
  updateFocus: (groupId: number, userId: number, input: { focused: boolean; internalNote: string }) =>
    apiRequest<{ groupId: number; userId: number }>(`/api/admin/cultivation/groups/${groupId}/members/${userId}/focus`, { method: "PUT", body: input }),
};
