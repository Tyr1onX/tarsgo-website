import type { AssignmentTodo } from "./assignment-client.ts";
import type { LeaveAccessState, LatestLeaveStatus } from "./leave-client.ts";
import type { WeeklyReportStatus } from "./weekly-report-client.ts";

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

export function getPersonalWorkbenchSnapshot(key: string) {
	return snapshots.get(key);
}

export function hasPersonalWorkbenchData(snapshot: PersonalSnapshot | undefined): snapshot is PersonalSnapshot {
	return Boolean(snapshot && (snapshot.weekly !== null || snapshot.assignments !== null || snapshot.leaveAccess !== null || snapshot.leaveLatest !== null));
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
		return;
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
