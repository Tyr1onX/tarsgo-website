import type { Assignment } from "./assignment-client.ts";
import type { LeaveAccessState, LeaveRequest } from "./leave-client.ts";
import type { WeeklyReportDashboard } from "./weekly-report-client.ts";

export type PersonalSnapshot = {
	weekly: WeeklyReportDashboard | null;
	assignments: Assignment[] | null;
	leaveAccess: LeaveAccessState | null;
	leaveRequests: LeaveRequest[] | null;
	errors: { weekly?: string; assignments?: string; leave?: string };
};

export const emptyPersonalSnapshot: PersonalSnapshot = {
	weekly: null,
	assignments: null,
	leaveAccess: null,
	leaveRequests: null,
	errors: {},
};

const MAX_CACHED_WORKBENCH_SCOPES = 12;
const snapshots = new Map<string, PersonalSnapshot>();

export function getPersonalWorkbenchSnapshot(key: string) {
	return snapshots.get(key);
}

export function hasPersonalWorkbenchData(snapshot: PersonalSnapshot | undefined): snapshot is PersonalSnapshot {
	return Boolean(snapshot && (snapshot.weekly !== null || snapshot.assignments !== null || snapshot.leaveAccess !== null || snapshot.leaveRequests !== null));
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
