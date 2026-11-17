import type { WeeklyReportDashboard } from "./weekly-report-client.ts";

const weeklyDashboards = new Map<number, WeeklyReportDashboard>();

export function getWeeklyDashboardSnapshot(accountId: number) {
  return weeklyDashboards.get(accountId);
}

export function rememberWeeklyDashboardSnapshot(accountId: number, snapshot: WeeklyReportDashboard) {
  weeklyDashboards.set(accountId, snapshot);
}

export function clearWeeklyDashboardSnapshots(accountId?: number) {
  if (accountId === undefined) weeklyDashboards.clear();
  else weeklyDashboards.delete(accountId);
}
