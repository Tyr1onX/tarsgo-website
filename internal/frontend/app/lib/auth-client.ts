import { ApiError, apiRequest } from "~/lib/api-client";
import { AuthSessionCache } from "~/lib/auth-session-cache";

export { ApiError } from "~/lib/api-client";

export interface AuthRole {
  id: number;
  name: string;
  displayName: string;
}

export interface AuthUser {
  id: number;
  email: string;
  phone?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  role: AuthRole;
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

function invalidateCurrentUserRequest() {
  currentUserRequestGeneration += 1;
  currentUserRequest = null;
}

function notifyAuthStateChange(user: AuthUser | null) {
  for (const listener of authStateListeners) {
    listener(user);
  }
}

export function announceAccountSessionChange() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(ACCOUNT_SESSION_CHANNEL);
  channel.postMessage({ type: "identity-changed", source: getAccountSessionTabId() });
  channel.close();
}

export function subscribeAccountSessionChange(onChange: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(ACCOUNT_SESSION_CHANNEL);
  const handleMessage = (event: MessageEvent<{ type?: string; source?: string }>) => {
    if (event.data?.type !== "identity-changed" || event.data.source === getAccountSessionTabId()) return;
    authSessionCache.clear();
    invalidateCurrentUserRequest();
    notifyAuthStateChange(null);
    onChange();
  };
  channel.addEventListener("message", handleMessage);
  return () => {
    channel.removeEventListener("message", handleMessage);
    channel.close();
  };
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
  authSessionCache.setAuthenticated(user);
  invalidateCurrentUserRequest();
  notifyAuthStateChange(user);
  announceAccountSessionChange();
}

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
  phone: string;
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
  if (data.identityChanged) announceAccountSessionChange();
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
  authSessionCache.setAuthenticated(result.user);
  invalidateCurrentUserRequest();
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
    authSessionCache.setAnonymous();
    invalidateCurrentUserRequest();
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
  authSessionCache.setAnonymous();
  invalidateCurrentUserRequest();
  notifyAuthStateChange(null);
  announceAccountSessionChange();
}

export function getCachedCurrentUser(): AuthUser | null {
  return authSessionCache.getUser();
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
      if (requestGeneration === currentUserRequestGeneration && authSessionCache.acceptAuthenticatedRequest(requestVersion, data.user)) {
        notifyAuthStateChange(data.user);
      }
      return data.user;
    })
    .catch((error) => {
      const stateChanged = requestGeneration !== currentUserRequestGeneration
        ? false
        : error instanceof ApiError && error.status === 401
          ? authSessionCache.acceptAnonymousRequest(requestVersion)
          : authSessionCache.acceptFailedRequest(requestVersion);
      if (stateChanged) notifyAuthStateChange(null);
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
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  await apiRequest("/api/logout", { method: "POST", body: {}, accountAction: true });
  authSessionCache.setAnonymous();
  invalidateCurrentUserRequest();
  notifyAuthStateChange(null);
  announceAccountSessionChange();
}
