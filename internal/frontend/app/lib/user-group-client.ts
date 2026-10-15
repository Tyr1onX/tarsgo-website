import { apiRequest } from "~/lib/api-client";

export interface UserGroupConfirmationState {
	state: "assigned" | "unassigned" | "pending";
	groups: Array<{ groupId: number; name: string; role: number }>;
	canSelfConfirm: boolean;
}

export function getUserGroupConfirmationState(): Promise<UserGroupConfirmationState> {
	return apiRequest<UserGroupConfirmationState>("/api/user-group/confirmation");
}

export function confirmUserGroup(groupId: number): Promise<UserGroupConfirmationState> {
	return apiRequest<UserGroupConfirmationState>("/api/user-group/confirmation", {
		method: "POST",
		body: { groupId },
	});
}
