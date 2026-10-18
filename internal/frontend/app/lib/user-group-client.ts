import { apiRequest } from "./api-client.ts";

export interface UserGroupConfirmationState {
	state: "assigned" | "unassigned" | "pending";
	groups: Array<{ groupId: number; name: string; role: number }>;
	canSelfConfirm: boolean;
}

const pendingConfirmationRequests = new Map<number | null, Promise<UserGroupConfirmationState>>();
const confirmationCache = new Map<number, { state: UserGroupConfirmationState; expiresAt: number }>();
const CONFIRMATION_CACHE_TTL_MS = 10_000;
let confirmationCacheGeneration = 0;

export function getUserGroupConfirmationState(accountId?: number): Promise<UserGroupConfirmationState> {
	const key = accountId ?? null;
	if (accountId !== undefined) {
		const cached = confirmationCache.get(accountId);
		if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.state);
		if (cached) confirmationCache.delete(accountId);
	}
	const pending = pendingConfirmationRequests.get(key);
	if (pending) return pending;

	const requestGeneration = confirmationCacheGeneration;
	const request = apiRequest<UserGroupConfirmationState>("/api/user-group/confirmation")
		.then((state) => {
			if (accountId !== undefined && requestGeneration === confirmationCacheGeneration) {
				confirmationCache.set(accountId, { state, expiresAt: Date.now() + CONFIRMATION_CACHE_TTL_MS });
			}
			return state;
		})
		.finally(() => {
			if (pendingConfirmationRequests.get(key) === request) pendingConfirmationRequests.delete(key);
		});
	pendingConfirmationRequests.set(key, request);
	return request;
}

export function invalidateUserGroupConfirmationStateCache() {
	confirmationCacheGeneration += 1;
	confirmationCache.clear();
	pendingConfirmationRequests.clear();
}

export function confirmUserGroup(groupId: number): Promise<UserGroupConfirmationState> {
	invalidateUserGroupConfirmationStateCache();
	return apiRequest<UserGroupConfirmationState>("/api/user-group/confirmation", {
		method: "POST",
		body: { groupId },
	});
}
