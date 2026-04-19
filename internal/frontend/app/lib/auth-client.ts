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

export interface AuthUser {
  id: number;
  email: string;
  phone?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  role: AuthRole;
  portal?: AuthUserPortal | null;
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
  return data.user;
}

export function getCachedCurrentUser(): AuthUser | null {
  return currentUserCache;
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
      return data.user;
    })
    .catch((error) => {
      currentUserCache = null;
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
}

export function getOAuthLoginUrl(provider: string): string {
  return buildApiUrl(`/api/login/${encodeURIComponent(provider)}`);
}

export function getGitHubLoginUrl(): string {
  return getOAuthLoginUrl("github");
}
