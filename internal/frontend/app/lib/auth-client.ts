import { ApiError, apiRequest, buildApiUrl } from "~/lib/api-client";

export { ApiError } from "~/lib/api-client";

export interface AuthRole {
  id: number;
  name: string;
  displayName: string;
}

export interface AuthUserPortal {
  showRecruitmentEntry: boolean;
}

export interface AuthCapabilities {
  canManagePortal: boolean;
  canReviewRegistrations: boolean;
  canManageGroupMembers: boolean;
  canManageGroupAdmins: boolean;
  canManageUserGroups: boolean;
  canManageSystemConfig: boolean;
  canViewGroupMembers: boolean;
  canEditGroupMemberProfiles: boolean;
  canEditManagedAdminProfiles: boolean;
  canManageAllPersonnel: boolean;
  canManageAllPortal: boolean;
  canManageAdminStatus: boolean;
  canManageRoles: boolean;
}

export interface AuthUser {
  id: number;
  email: string;
  phone?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  role: AuthRole;
  adminScope: "none" | "global" | "group" | string;
  managementGroupId?: number | null;
  groupRole?: "member" | "group_admin" | "leader" | string;
  permissions: string[];
  capabilities: AuthCapabilities;
  portal?: AuthUserPortal | null;
}

export function getAuthUserRoleLabel(user: Pick<AuthUser, "role" | "adminScope" | "groupRole">): string {
  if (user.role.name === "super_admin") {
    return "超级管理员";
  }
  if (user.role.name === "user") {
    return "组员";
  }
  if (user.adminScope === "global") {
    return "全局管理员";
  }
  if (user.adminScope === "group" && user.groupRole === "leader") {
    return "组长";
  }
  if (user.adminScope === "group" && user.groupRole === "group_admin") {
    return "组内管理";
  }
  return user.role.displayName;
}

export interface BootstrapStatus {
  setupRequired: boolean;
}

export interface OAuthLoginProvider {
  provider: string;
  displayName: string;
}

let currentUserCache: AuthUser | null = null;
let currentUserRequest: Promise<AuthUser> | null = null;
const authStateListeners = new Set<(user: AuthUser | null) => void>();

function notifyAuthStateChange(user: AuthUser | null) {
  for (const listener of authStateListeners) {
    listener(user);
  }
}

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  return apiRequest<BootstrapStatus>("/api/bootstrap/status");
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
  currentUserCache = data.user;
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
  currentUserCache = data.user;
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
  currentUserCache = data.user;
  notifyAuthStateChange(data.user);
  return data.user;
}

export async function sendLoginCode(email: string): Promise<void> {
  await apiRequest("/api/login/email/send-code", {
    method: "POST",
    body: { email },
  });
}

export async function getOAuthLoginProviders(): Promise<OAuthLoginProvider[]> {
  const data = await apiRequest<{ items: OAuthLoginProvider[] }>("/api/login/providers");
  return data.items;
}

export async function loginWithCode(input: {
  email: string;
  code: string;
}): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>("/api/login/email/code", {
    method: "POST",
    body: input,
  });
  currentUserCache = data.user;
  notifyAuthStateChange(data.user);
  return data.user;
}

export function getCachedCurrentUser(): AuthUser | null {
  return currentUserCache;
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
  if (!options.force && currentUserCache) {
    return currentUserCache;
  }

  if (currentUserRequest) {
    return currentUserRequest;
  }

  currentUserRequest = apiRequest<{ user: AuthUser }>("/api/me")
    .then((data) => {
      currentUserCache = data.user;
      notifyAuthStateChange(data.user);
      return data.user;
    })
    .catch((error) => {
      currentUserCache = null;
      notifyAuthStateChange(null);
      throw error;
    })
    .finally(() => {
      currentUserRequest = null;
    });

  return currentUserRequest;
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
  currentUserCache = null;
  currentUserRequest = null;
  notifyAuthStateChange(null);
}

export function getOAuthLoginUrl(provider: string): string {
  return buildApiUrl(`/api/login/${encodeURIComponent(provider)}`);
}

export function getGitHubLoginUrl(): string {
  return getOAuthLoginUrl("github");
}
