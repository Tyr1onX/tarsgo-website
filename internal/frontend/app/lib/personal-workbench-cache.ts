import type { AssignmentTodo } from "./assignment-client.ts";
import type { AdminWorkbenchState } from "./admin-workbench-loader.ts";
import type { LeaveAccessState, LatestLeaveStatus } from "./leave-client.ts";
import type { WeeklyReportStatus } from "./weekly-report-client.ts";
import type { WeeklyReportDashboard } from "./weekly-report-client.ts";

export type PersonalSnapshot = {
	weekly: WeeklyReportStatus | null;
	assignments: AssignmentTodo[] | null;
	leaveAccess: LeaveAccessState | null;
	leaveLatest: LatestLeaveStatus | null;
	errors: { weekly?: string; assignments?: string; leave?: string };
};

export const emptyPersonalSnapshot: PersonalSnapshot = {
	weekly: null,
	assignments: null,
	leaveAccess: null,
	leaveLatest: null,
	errors: {},
};

const MAX_CACHED_WORKBENCH_SCOPES = 12;
const snapshots = new Map<string, PersonalSnapshot>();
const adminSnapshots = new Map<string, AdminWorkbenchState>();
const weeklyDashboards = new Map<number, WeeklyReportDashboard>();

export function getAdminWorkbenchSnapshot(key: string) { return adminSnapshots.get(key); }
export function rememberAdminWorkbenchSnapshot(key: string, snapshot: AdminWorkbenchState) {
  adminSnapshots.set(key, snapshot);
}
export function getWeeklyDashboardSnapshot(accountId: number) { return weeklyDashboards.get(accountId); }
export function rememberWeeklyDashboardSnapshot(accountId: number, snapshot: WeeklyReportDashboard) {
  weeklyDashboards.set(accountId, snapshot);
}

export function getPersonalWorkbenchSnapshot(key: string) {
	return snapshots.get(key);
}

export function rememberPersonalWorkbenchSnapshot(key: string, snapshot: PersonalSnapshot) {
	snapshots.delete(key);
	snapshots.set(key, snapshot);
	while (snapshots.size > MAX_CACHED_WORKBENCH_SCOPES) {
		const oldest = snapshots.keys().next().value;
		if (oldest === undefined) break;
		snapshots.delete(oldest);
	}
}

export function clearPersonalWorkbenchSnapshots(accountId?: number) {
	if (accountId === undefined) {
		snapshots.clear();
		adminSnapshots.clear();
		weeklyDashboards.clear();
		return;
	}
	weeklyDashboards.delete(accountId);
	for (const key of adminSnapshots.keys()) {
		try {
			if (JSON.parse(key)[0] === accountId) adminSnapshots.delete(key);
		} catch { adminSnapshots.delete(key); }
	}
	for (const key of snapshots.keys()) {
		try {
			const scope: unknown = JSON.parse(key);
			if (Array.isArray(scope) && scope[0] === accountId) snapshots.delete(key);
		} catch {
			snapshots.delete(key);
		}
	}
}

// Publish each independent section as it settles. Callers guard publication by
// request/account generation so old requests cannot repopulate an invalid cache.
export async function loadPersonalWorkbenchSections(
  previous: PersonalSnapshot,
  requests: {
    weekly: Promise<WeeklyReportStatus>;
    assignments: Promise<AssignmentTodo[]>;
    leave: Promise<{ access: LeaveAccessState; latest: LatestLeaveStatus | null }>;
  },
  publish: (snapshot: PersonalSnapshot, pending: number) => void,
) {
  let next: PersonalSnapshot = { ...previous, errors: {} };
  let pending = 3;
  const run = async <T>(key: keyof PersonalSnapshot["errors"], request: Promise<T>, apply: (value: T) => Partial<PersonalSnapshot>, fallback: string) => {
    try {
      const value = await request;
      next = { ...next, ...apply(value) };
    } catch (error) {
      next = { ...next, errors: { ...next.errors, [key]: error instanceof Error ? error.message : fallback } };
    }
    publish(next, --pending);
  };
  await Promise.all([
    run("weekly", requests.weekly, (weekly) => ({ weekly }), "周报状态暂时无法读取。"),
    run("assignments", requests.assignments, (assignments) => ({ assignments }), "作业状态暂时无法读取。"),
    run("leave", requests.leave, ({ access, latest }) => ({ leaveAccess: access, leaveLatest: latest }), "请假状态暂时无法读取。"),
  ]);
}
