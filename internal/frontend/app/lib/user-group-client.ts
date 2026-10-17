import { apiRequest } from "~/lib/api-client";

export interface UserGroupConfirmationState {
	state: "assigned" | "unassigned" | "pending";
	groups: Array<{ groupId: number; name: string; role: number }>;
	canSelfConfirm: boolean;
}

const pendingConfirmationRequests = new Map<number | null, Promise<UserGroupConfirmationState>>();

export function getUserGroupConfirmationState(accountId?: number): Promise<UserGroupConfirmationState> {
	const key = accountId ?? null;
	const pending = pendingConfirmationRequests.get(key);
	if (pending) return pending;

	const request = apiRequest<UserGroupConfirmationState>("/api/user-group/confirmation")
		.finally(() => {
			if (pendingConfirmationRequests.get(key) === request) pendingConfirmationRequests.delete(key);
		});
	pendingConfirmationRequests.set(key, request);
	return request;
}

export function confirmUserGroup(groupId: number): Promise<UserGroupConfirmationState> {
	return apiRequest<UserGroupConfirmationState>("/api/user-group/confirmation", {
		method: "POST",
		body: { groupId },
	});
}
