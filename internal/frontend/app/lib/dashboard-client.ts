import { apiRequest } from "~/lib/api-client";

export interface DashboardGroupDistribution { id: number; name: string; count: number }
export interface DashboardActivity { id: number; actionKey: string; actorName: string; message: string; groupName?: string; occurredAt: string }
export interface AdminDashboardData {
  totalUsers: number;
  newUsersThisMonth: number;
  activeTechnicalGroups: number;
  groupDistribution: DashboardGroupDistribution[];
  recentActivities: DashboardActivity[];
  generatedAt: string;
}

export function getAdminDashboard(options: { signal?: AbortSignal } = {}): Promise<AdminDashboardData> {
  return apiRequest<AdminDashboardData>("/api/admin/dashboard", {
    cache: "no-store",
    signal: options.signal,
  });
}
