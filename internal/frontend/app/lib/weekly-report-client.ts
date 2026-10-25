import { apiRequest } from "~/lib/api-client";

export interface WeeklyReportInput {
  completed: string;
  gains: string;
  blockers: string;
  nextPlan: string;
  groupId?: number;
}

export interface WeeklyReport extends WeeklyReportInput {
  id: number;
  groupName?: string;
  weekStart: string;
  updatedAt: string;
}

export interface WeeklyReportGroup {
  groupId: number;
  name: string;
}

export interface WeeklyReportDashboard {
  groupName?: string;
  groups: WeeklyReportGroup[];
  teamGroups: WeeklyReportGroup[];
  currentWeekStart: string;
  canViewTeam: boolean;
  reports: WeeklyReport[];
}

export interface WeeklyReportTeamMember {
  userId: number;
  name: string;
  submitted: boolean;
  report: WeeklyReport | null;
}

export interface WeeklyReportTeamWeek {
  groupId: number;
  groupName: string;
  weekStart: string;
  submittedCount: number;
  totalCount: number;
  members: WeeklyReportTeamMember[];
}

export function getWeeklyReportDashboard(): Promise<WeeklyReportDashboard> {
  return apiRequest<WeeklyReportDashboard>("/api/weekly-reports");
}

export function getWeeklyReportTeamWeek(groupId: number, weekStart: string): Promise<WeeklyReportTeamWeek> {
  const query = new URLSearchParams({ groupId: String(groupId), weekStart });
  return apiRequest<WeeklyReportTeamWeek>(`/api/weekly-reports/team?${query.toString()}`);
}

export function saveCurrentWeeklyReport(input: WeeklyReportInput): Promise<WeeklyReport> {
  return apiRequest<WeeklyReport>("/api/weekly-reports/current", { method: "PUT", body: input });
}

export function updateWeeklyReport(id: number, input: WeeklyReportInput): Promise<WeeklyReport> {
  return apiRequest<WeeklyReport>(`/api/weekly-reports/${id}`, { method: "PUT", body: input });
}
