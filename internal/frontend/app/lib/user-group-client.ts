import { apiRequest } from "./api-client.ts";

export interface UserGroupConfirmationState {
	state: "assigned" | "unassigned" | "pending";
	groups: Array<{ groupId: number; name: string; role: number }>;
	canSelfConfirm: boolean;
}

export const USER_GROUP_REVALIDATE_AFTER_MS = 10_000;

type CachedConfirmation = { state: UserGroupConfirmationState; stale: boolean; verifiedAt: number };

const pendingConfirmationRequests = new Map<number | null, Promise<UserGroupConfirmationState>>();
const confirmationCache = new Map<number, CachedConfirmation>();
let allAccountsGeneration = 0;
const accountGenerations = new Map<number | null, number>();

function generationFor(key: number | null) {
	return `${allAccountsGeneration}:${accountGenerations.get(key) ?? 0}`;
}

function invalidateAccountGeneration(key: number | null) {
	accountGenerations.set(key, (accountGenerations.get(key) ?? 0) + 1);
}

function readConfirmationState(accountId: number | undefined, force: boolean): Promise<UserGroupConfirmationState> {
	const key = accountId ?? null;
	const cached = accountId === undefined ? undefined : confirmationCache.get(accountId);
	if (!force && cached && !cached.stale) return Promise.resolve(cached.state);

	const pending = pendingConfirmationRequests.get(key);
	if (pending) return pending;

	const requestGeneration = generationFor(key);
	const request = apiRequest<UserGroupConfirmationState>("/api/user-group/confirmation")
		.then((state) => {
			if (accountId !== undefined && requestGeneration === generationFor(key)) {
				confirmationCache.set(accountId, { state, stale: false, verifiedAt: Date.now() });
			}
			return state;
		})
		.finally(() => {
			if (pendingConfirmationRequests.get(key) === request) pendingConfirmationRequests.delete(key);
		});
	pendingConfirmationRequests.set(key, request);
	return request;
}

export function getUserGroupConfirmationState(accountId?: number): Promise<UserGroupConfirmationState> {
	return readConfirmationState(accountId, false);
}

/** Refreshes a known account in the background while retaining its last good value on failure. */
export function refreshUserGroupConfirmationState(accountId: number): Promise<UserGroupConfirmationState> {
	return readConfirmationState(accountId, true);
}

export function getCachedUserGroupConfirmationState(accountId: number): UserGroupConfirmationState | null {
	return confirmationCache.get(accountId)?.state ?? null;
}

export function needsUserGroupConfirmationRefresh(accountId: number, now = Date.now()): boolean {
	const cached = confirmationCache.get(accountId);
	return !cached || cached.stale || now - cached.verifiedAt >= USER_GROUP_REVALIDATE_AFTER_MS;
}

export function markUserGroupConfirmationStateStale(accountId: number | null) {
	if (accountId === null) {
		allAccountsGeneration += 1;
		accountGenerations.clear();
		pendingConfirmationRequests.clear();
		for (const [id, cached] of confirmationCache) confirmationCache.set(id, { ...cached, stale: true });
		return;
	}
	invalidateAccountGeneration(accountId);
	pendingConfirmationRequests.delete(accountId);
	const cached = confirmationCache.get(accountId);
	if (cached) confirmationCache.set(accountId, { ...cached, stale: true });
}

export function invalidateUserGroupConfirmationStateCache(accountId?: number) {
	if (accountId === undefined) {
		allAccountsGeneration += 1;
		accountGenerations.clear();
		confirmationCache.clear();
		pendingConfirmationRequests.clear();
		return;
	}
	invalidateAccountGeneration(accountId);
	confirmationCache.delete(accountId);
	pendingConfirmationRequests.delete(accountId);
}

export async function confirmUserGroup(groupId: number, accountId?: number): Promise<UserGroupConfirmationState> {
	let requestGeneration: string | null = null;
	if (accountId !== undefined) {
		invalidateAccountGeneration(accountId);
		pendingConfirmationRequests.delete(accountId);
		requestGeneration = generationFor(accountId);
	}
	const state = await apiRequest<UserGroupConfirmationState>("/api/user-group/confirmation", {
		method: "POST",
		body: { groupId },
	});
	if (accountId !== undefined && requestGeneration === generationFor(accountId)) {
		confirmationCache.set(accountId, { state, stale: false, verifiedAt: Date.now() });
	}
	return state;
}
