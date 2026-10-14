import { apiRequest } from "~/lib/api-client";

export interface RecruitmentAnalyticsGroup {
  name: string;
  registrationCount: number;
}

export interface RecruitmentAnalyticsCohort {
  formId: number;
  title: string;
  createdAt: string;
  hasData: boolean;
  registrationCount: number;
  admittedCount: number;
  rejectedCount: number;
  withdrawnCount: number;
  pendingCount: number;
  otherStatusCount: number;
  admissionRate?: number;
  matchedFormalMemberCount: number;
  groups: RecruitmentAnalyticsGroup[];
}

export interface RecruitmentAnalyticsReport {
  cohortCount: number;
  hasCohorts: boolean;
  hasRecords: boolean;
  totalRegistrations: number;
  totalAdmitted: number;
  cohorts: RecruitmentAnalyticsCohort[];
  generatedAt: string;
  coverageStart?: string;
  coverageEnd?: string;
}

export function getRecruitmentAnalytics(signal?: AbortSignal) {
  return apiRequest<RecruitmentAnalyticsReport>("/api/admin/recruitment-analytics", { signal });
}
