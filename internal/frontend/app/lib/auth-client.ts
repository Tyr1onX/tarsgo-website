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

const authSessionCache = new AuthSessionCache<AuthUser>();
let currentUserRequest: Promise<AuthUser> | null = null;
const bootstrapStatusCacheTtlMs = 5_000;
let bootstrapStatusCache: { value: BootstrapStatus; expiresAt: number } | null = null;
let bootstrapStatusRequest: Promise<BootstrapStatus> | null = null;
let bootstrapStatusGeneration = 0;
const authStateListeners = new Set<(user: AuthUser | null) => void>();

function notifyAuthStateChange(user: AuthUser | null) {
  for (const listener of authStateListeners) {
    listener(user);
  }
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
  authSessionCache.setAuthenticated(data.user);
  currentUserRequest = null;
  notifyAuthStateChange(data.user);
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
  authSessionCache.setAuthenticated(data.user);
  currentUserRequest = null;
  notifyAuthStateChange(data.user);
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
  authSessionCache.setAuthenticated(data.user);
  currentUserRequest = null;
  notifyAuthStateChange(data.user);
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
  authSessionCache.setAuthenticated(data.user);
  currentUserRequest = null;
  notifyAuthStateChange(data.user);
  return data.user;
}

export function getCachedCurrentUser(): AuthUser | null {
  return authSessionCache.getUser();
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

  const requestVersion = authSessionCache.version;
  const request = apiRequest<{ user: AuthUser }>("/api/me")
    .then((data) => {
      if (authSessionCache.acceptAuthenticatedRequest(requestVersion, data.user)) {
        notifyAuthStateChange(data.user);
      }
      return data.user;
    })
    .catch((error) => {
      const stateChanged = error instanceof ApiError && error.status === 401
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
  await apiRequest("/api/logout", { method: "POST" });
  authSessionCache.setAnonymous();
  currentUserRequest = null;
  notifyAuthStateChange(null);
}
