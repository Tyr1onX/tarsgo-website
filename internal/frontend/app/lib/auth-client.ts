import { ApiError, apiRequest, registerApiAuthLifecycle } from "./api-client.ts";
import { AuthSessionCache } from "./auth-session-cache.ts";
import { requestCommunityExperienceRefresh } from "./community-experience-sync.ts";
import { clearPersonalWorkbenchSnapshots } from "./personal-workbench-cache.ts";
import {
  invalidateUserGroupConfirmationStateCache,
  markUserGroupConfirmationStateStale,
} from "./user-group-client.ts";

export { ApiError } from "./api-client.ts";

export interface AuthRole {
  id: number;
  name: string;
  displayName: string;
}

export interface AuthUser {
  workbenchAccess?: boolean;
  teamIdentityStatus?: string;
  id: number;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  realName?: string | null;
  organizationPositions?: Array<{
    id: string;
    title: string;
    categoryId: string;
    categoryTitle: string;
  }>;
  role: AuthRole;
}

export function getAuthUserName(user: Pick<AuthUser, "realName">): string {
  return user.realName?.trim() || "姓名待核实";
}

export function getAuthUserRoleLabel(user: Pick<AuthUser, "role">): string {
  if (user.role.name === "super_admin") {
    return "超级管理员";
  }
  if (user.role.name === "admin") {
    return "管理员";
  }
  return "成员";
}

export interface BootstrapStatus {
  setupRequired: boolean;
}

export interface AccountSessionAccount {
  id: number;
  user: AuthUser;
  expiresAt: string;
  current: boolean;
  status: "available" | "expired" | "revoked" | "disabled";
}

const ACCOUNT_SESSION_CHANNEL = "tarsgo:account-session-change";
let accountSessionTabId: string | null = null;

const authSessionCache = new AuthSessionCache<AuthUser>();
let currentUserRequest: Promise<AuthUser> | null = null;
let currentUserRequestGeneration = 0;
const bootstrapStatusCacheTtlMs = 5_000;
let bootstrapStatusCache: { value: BootstrapStatus; expiresAt: number } | null = null;
let bootstrapStatusRequest: Promise<BootstrapStatus> | null = null;
let bootstrapStatusGeneration = 0;
const authStateListeners = new Set<(user: AuthUser | null) => void>();
const accountSessionListeners = new Set<() => void>();
const permissionChangeListeners = new Set<(userId: number | null) => void>();
let accountSessionChannel: BroadcastChannel | null = null;

function invalidateCurrentUserRequest() {
  currentUserRequestGeneration += 1;
  currentUserRequest = null;
}

function notifyAuthStateChange(user: AuthUser | null) {
  for (const listener of authStateListeners) {
    listener(user);
  }
}

function clearCurrentAccountPrivateData() {
  const currentUser = authSessionCache.getUser();
  if (currentUser) clearPersonalWorkbenchSnapshots(currentUser.id);
}

type AccountSessionMessage =
  | { type: "identity-changed"; source: string }
  | { type: "profile-updated"; source: string; user: AuthUser }
  | { type: "permissions-changed"; source: string; userId: number | null };
type AccountSessionMessageInput = AccountSessionMessage extends infer Message
  ? Message extends { source: string } ? Omit<Message, "source"> : never
  : never;

function ensureAccountSessionChannel() {
  if (typeof BroadcastChannel === "undefined" || accountSessionChannel) return;
  accountSessionChannel = new BroadcastChannel(ACCOUNT_SESSION_CHANNEL);
  accountSessionChannel.addEventListener("message", (event: MessageEvent<AccountSessionMessage>) => {
    const message = event.data;
    if (!message || message.source === getAccountSessionTabId()) return;

    if (message.type === "identity-changed") {
      clearCurrentAccountPrivateData();
      authSessionCache.clear();
      invalidateCurrentUserRequest();
      invalidateUserGroupConfirmationStateCache();
      for (const listener of accountSessionListeners) listener();
      return;
    }

    if (message.type === "profile-updated") {
      if (authSessionCache.getUser()?.id !== message.user.id) return;
      authSessionCache.setAuthenticated(message.user);
      invalidateCurrentUserRequest();
      notifyAuthStateChange(message.user);
      return;
    }

    markUserGroupConfirmationStateStale(message.userId);
    clearPersonalWorkbenchSnapshots(message.userId ?? undefined);
    for (const listener of permissionChangeListeners) listener(message.userId);
  });
}

function broadcastAccountSessionMessage(message: AccountSessionMessageInput) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(ACCOUNT_SESSION_CHANNEL);
  channel.postMessage({ ...message, source: getAccountSessionTabId() });
  channel.close();
}

export function announceAccountSessionChange() {
  broadcastAccountSessionMessage({ type: "identity-changed" });
}

export function subscribeAccountSessionChange(onChange: () => void): () => void {
  accountSessionListeners.add(onChange);
  ensureAccountSessionChannel();
  return () => {
    accountSessionListeners.delete(onChange);
    closeAccountSessionChannelWhenUnused();
  };
}

export function subscribePermissionChange(onChange: (userId: number | null) => void): () => void {
  permissionChangeListeners.add(onChange);
  ensureAccountSessionChannel();
  return () => {
    permissionChangeListeners.delete(onChange);
    closeAccountSessionChannelWhenUnused();
  };
}

function closeAccountSessionChannelWhenUnused() {
  if (accountSessionListeners.size || permissionChangeListeners.size || !accountSessionChannel) return;
  accountSessionChannel.close();
  accountSessionChannel = null;
}

export function announcePermissionChange(userId: number | null, options: { notifyLocal?: boolean; markStale?: boolean } = {}) {
  if (options.markStale !== false) markUserGroupConfirmationStateStale(userId);
  clearPersonalWorkbenchSnapshots(userId ?? undefined);
  if (options.notifyLocal !== false) {
    for (const listener of permissionChangeListeners) listener(userId);
  }
  broadcastAccountSessionMessage({ type: "permissions-changed", userId });
}

function announceProfileUpdate(user: AuthUser) {
  broadcastAccountSessionMessage({ type: "profile-updated", user });
}

function getAccountSessionTabId() {
  if (!accountSessionTabId) {
    accountSessionTabId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return accountSessionTabId;
}

function notifyNewLogin(user: AuthUser) {
  const previousUser = authSessionCache.getUser();
  if (previousUser && (
    previousUser.id !== user.id
    || previousUser.role.id !== user.role.id
    || previousUser.role.name !== user.role.name
  )) clearPersonalWorkbenchSnapshots(previousUser.id);
  authSessionCache.setAuthenticated(user);
  invalidateCurrentUserRequest();
  invalidateUserGroupConfirmationStateCache();
  notifyAuthStateChange(user);
  announceAccountSessionChange();
}

function expireSessionAfterUnauthorized(version: number) {
  if (version < 0 || authSessionCache.version !== version) return;
  const wasAuthenticated = authSessionCache.getUser() !== null;
  clearCurrentAccountPrivateData();
  if (!authSessionCache.acceptAnonymousRequest(version)) return;
  invalidateCurrentUserRequest();
  invalidateUserGroupConfirmationStateCache();
  notifyAuthStateChange(null);
  if (wasAuthenticated) announceAccountSessionChange();
}

registerApiAuthLifecycle({
  getSessionVersion: () => authSessionCache.version,
  onUnauthorized: expireSessionAfterUnauthorized,
});

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  if (bootstrapStatusCache && bootstrapStatusCache.expiresAt > Date.now()) {
    return bootstrapStatusCache.value;
  }
  if (bootstrapStatusRequest) return bootstrapStatusRequest;

  const requestGeneration = bootstrapStatusGeneration;
  const request = apiRequest<BootstrapStatus>("/api/bootstrap/status")
    .then((value) => {
      if (requestGeneration === bootstrapStatusGeneration) {
        bootstrapStatusCache = { value, expiresAt: Date.now() + bootstrapStatusCacheTtlMs };
      }
      return value;
    })
    .finally(() => {
      if (bootstrapStatusRequest === request) bootstrapStatusRequest = null;
    });
  bootstrapStatusRequest = request;
  return request;
}

function invalidateBootstrapStatus() {
  bootstrapStatusGeneration += 1;
  bootstrapStatusCache = null;
  bootstrapStatusRequest = null;
}

export async function sendRegisterCode(email: string): Promise<void> {
  await apiRequest("/api/register/email/send-code", {
    method: "POST",
    body: { email },
  });
}

export async function registerWithEmail(input: {
  email: string;
  password: string;
  realName: string;
  isStudent: boolean | null;
  studentId: string;
  college: string;
  grade: string;
  code: string;
}): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>("/api/register/email", {
    method: "POST",
    body: input,
  });
  notifyNewLogin(data.user);
  return data.user;
}

export async function registerInitialSuperAdmin(input: {
  email: string;
  realName: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>("/api/bootstrap/super-admin", {
    method: "POST",
    body: input,
  });
  invalidateBootstrapStatus();
  notifyNewLogin(data.user);
  return data.user;
}

export async function loginWithPassword(input: {
  email: string;
  password: string;
}): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>("/api/login/email/password", {
    method: "POST",
    body: input,
  });
  notifyNewLogin(data.user);
  return data.user;
}

export async function sendLoginCode(email: string): Promise<void> {
  await apiRequest("/api/login/email/send-code", {
    method: "POST",
    body: { email },
  });
}

export async function sendPasswordResetCode(email: string): Promise<void> {
  await apiRequest("/api/password-reset/send-code", { method: "POST", body: { email } });
}

export async function resetPasswordWithEmail(input: {
  email: string;
  code: string;
  password: string;
  confirmPassword: string;
}): Promise<void> {
  await apiRequest("/api/password-reset", { method: "POST", body: input });
}

export async function loginWithCode(input: {
  email: string;
  code: string;
}): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>("/api/login/email/code", {
    method: "POST",
    body: input,
  });
  notifyNewLogin(data.user);
  return data.user;
}

export async function initializeAccountSessions(): Promise<AccountSessionAccount[]> {
  const data = await apiRequest<{ accounts: AccountSessionAccount[]; identityChanged: boolean }>("/api/account-sessions/initialize", {
    method: "POST",
    body: {},
    accountAction: true,
    cache: "no-store",
  });
  return data.accounts;
}

export async function getAccountSessions(): Promise<AccountSessionAccount[]> {
  const data = await apiRequest<{ accounts: AccountSessionAccount[] }>("/api/account-sessions", { cache: "no-store" });
  return data.accounts;
}

export async function switchAccountSession(accountId: number): Promise<{ user: AuthUser; accounts: AccountSessionAccount[] }> {
  const result = await apiRequest<{ user: AuthUser; accounts: AccountSessionAccount[] }>("/api/account-sessions/switch", {
    method: "POST",
    body: { accountId },
    accountAction: true,
  });
  clearCurrentAccountPrivateData();
  authSessionCache.setAuthenticated(result.user);
  invalidateCurrentUserRequest();
  invalidateUserGroupConfirmationStateCache();
  notifyAuthStateChange(result.user);
  announceAccountSessionChange();
  return result;
}

export async function removeAccountSession(accountId: number): Promise<{
  accounts: AccountSessionAccount[];
  currentRemoved: boolean;
  vaultRemoved: boolean;
}> {
  const result = await apiRequest<{
    accounts: AccountSessionAccount[];
    currentRemoved: boolean;
    vaultRemoved: boolean;
  }>(`/api/account-sessions/${accountId}`, {
    method: "DELETE",
    accountAction: true,
  });
  if (result.currentRemoved) {
    clearCurrentAccountPrivateData();
    authSessionCache.setAnonymous();
    invalidateCurrentUserRequest();
    invalidateUserGroupConfirmationStateCache();
    notifyAuthStateChange(null);
    announceAccountSessionChange();
  }
  return result;
}

export async function logoutAllAccounts(): Promise<void> {
  await apiRequest("/api/account-sessions/logout-all", {
    method: "POST",
    body: {},
    accountAction: true,
  });
  clearCurrentAccountPrivateData();
  authSessionCache.setAnonymous();
  invalidateCurrentUserRequest();
  invalidateUserGroupConfirmationStateCache();
  notifyAuthStateChange(null);
  announceAccountSessionChange();
}

export async function updateProfile(input: { realName: string; phone?: string; avatar: File | null; academic?: import("./account-profile").AcademicInput }): Promise<AuthUser> {
  const body = new FormData();
  body.set("realName", input.realName);
  if (input.phone !== undefined) body.set("phone", input.phone);
  if (input.academic) {
    body.set("isStudent", String(input.academic.isStudent));
    body.set("studentId", input.academic.studentId);
    body.set("college", input.academic.college);
    body.set("grade", input.academic.grade);
  }
  if (input.avatar) body.set("avatar", input.avatar);
  const data = await apiRequest<{ user: AuthUser }>("/api/me", { method: "PUT", body });
  authSessionCache.setAuthenticated(data.user);
  invalidateCurrentUserRequest();
  notifyAuthStateChange(data.user);
  announceProfileUpdate(data.user);
  if (input.avatar) requestCommunityExperienceRefresh();
  return data.user;
}

export function getCachedCurrentUser(): AuthUser | null {
  return authSessionCache.getUser();
}

export function needsCurrentUserRevalidation(): boolean {
  return authSessionCache.needsRevalidation();
}

export function hasKnownAnonymousSession(): boolean {
  return authSessionCache.hasFreshAnonymousResult();
}

export function subscribeAuthStateChange(
  listener: (user: AuthUser | null) => void,
): () => void {
  authStateListeners.add(listener);
  return () => {
    authStateListeners.delete(listener);
  };
}

export async function getCurrentUser(options: { force?: boolean } = {}): Promise<AuthUser> {
  if (!options.force) {
    const cachedUser = authSessionCache.getUser();
    if (cachedUser) return cachedUser;
    if (authSessionCache.hasFreshAnonymousResult()) {
      throw new ApiError("未登录", 401);
    }
  }

  if (currentUserRequest) {
    return currentUserRequest;
  }

  const requestGeneration = ++currentUserRequestGeneration;
  const requestVersion = authSessionCache.version;
  const request = apiRequest<{ user: AuthUser }>("/api/me")
    .then((data) => {
      const previousUser = authSessionCache.getUser();
      if (requestGeneration === currentUserRequestGeneration && authSessionCache.acceptAuthenticatedRequest(requestVersion, data.user)) {
        if (previousUser && (
          previousUser.id !== data.user.id
          || previousUser.role.id !== data.user.role.id
          || previousUser.role.name !== data.user.role.name
        )) clearPersonalWorkbenchSnapshots(previousUser.id);
        notifyAuthStateChange(data.user);
      }
      return data.user;
    })
    .catch((error) => {
      const isCurrentUnauthorizedRequest = requestGeneration === currentUserRequestGeneration
        && error instanceof ApiError
        && (error.status === 401 || error.status === 403);
      if (isCurrentUnauthorizedRequest && authSessionCache.version === requestVersion) clearCurrentAccountPrivateData();
      const stateChanged = isCurrentUnauthorizedRequest && authSessionCache.acceptAnonymousRequest(requestVersion);
      if (stateChanged) {
        invalidateCurrentUserRequest();
        invalidateUserGroupConfirmationStateCache();
        notifyAuthStateChange(null);
        announceAccountSessionChange();
      }
      throw error;
    })
    .finally(() => {
      if (currentUserRequest === request) currentUserRequest = null;
    });
  currentUserRequest = request;

  return request;
}

export async function getOptionalCurrentUser(
  options: { force?: boolean } = {},
): Promise<AuthUser | null> {
  try {
    return await getCurrentUser(options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await apiRequest("/api/logout", { method: "POST", body: {}, accountAction: true });
  clearCurrentAccountPrivateData();
  authSessionCache.setAnonymous();
  invalidateCurrentUserRequest();
  invalidateUserGroupConfirmationStateCache();
  notifyAuthStateChange(null);
  announceAccountSessionChange();
}
