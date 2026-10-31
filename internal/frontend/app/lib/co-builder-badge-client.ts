import { apiRequest } from "~/lib/api-client";

export interface CoBuilderContribution {
  id: number;
  description: string;
  grantedById: number;
  createdAt: string;
  revokedAt?: string | null;
  revokedById?: number | null;
}

export interface CoBuilderBadgeSummary {
  name: string;
  levelCode: "none" | "bronze" | "silver" | "gold";
  levelLabel: string;
  contributionCount: number;
  awardCounts: Record<CoBuilderBadgeLevel, number>;
  nextLevelLabel?: string;
  nextLevelCount?: number;
  progressCount: number;
  progressPercent: number;
  contributions: CoBuilderContribution[];
}

export type CoBuilderBadgeLevel = Exclude<CoBuilderBadgeSummary["levelCode"], "none">;

export interface CoBuilderBadgeReplayRequest {
  levelCode: CoBuilderBadgeLevel;
  requestId: number;
  userId: number;
}

export interface CoBuilderBadgeUnlockNotice {
  levelCode: Exclude<CoBuilderBadgeSummary["levelCode"], "none">;
  levelLabel: string;
  claimToken: string;
}

export function getMyCoBuilderBadge(): Promise<CoBuilderBadgeSummary> {
  return apiRequest<CoBuilderBadgeSummary>("/api/me/co-builder-badge");
}

export function claimMyCoBuilderBadgeUnlock(): Promise<CoBuilderBadgeUnlockNotice | null> {
  return apiRequest<CoBuilderBadgeUnlockNotice | null>("/api/me/co-builder-badge/unlock-notice", {
    method: "POST",
    body: {},
  });
}

export function acknowledgeMyCoBuilderBadgeUnlock(claimToken: string): Promise<void> {
  return apiRequest<void>("/api/me/co-builder-badge/unlock-notice/seen", {
    method: "POST",
    body: { claimToken },
  });
}

export function getAdminCoBuilderBadge(userId: number): Promise<CoBuilderBadgeSummary> {
  return apiRequest<CoBuilderBadgeSummary>(`/api/admin/users/${userId}/co-builder-badge`);
}

export function grantCoBuilderContribution(userId: number, description: string): Promise<CoBuilderBadgeSummary> {
  return apiRequest<CoBuilderBadgeSummary>(`/api/admin/users/${userId}/co-builder-badge/contributions`, {
    method: "POST",
    body: { description },
  });
}

export function revokeCoBuilderContribution(userId: number, contributionId: number): Promise<CoBuilderBadgeSummary> {
  return apiRequest<CoBuilderBadgeSummary>(`/api/admin/users/${userId}/co-builder-badge/contributions/${contributionId}`, {
    method: "DELETE",
  });
}
