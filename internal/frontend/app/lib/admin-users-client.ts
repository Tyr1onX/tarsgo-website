import { apiRequest } from "~/lib/api-client";

export interface AdminUserRole {
  id: number;
  name: string;
  displayName: string;
}

export interface AdminUserRoleOption extends AdminUserRole {
  editableByCurrentActor: boolean;
}

export interface AdminUserAuthMethods {
  hasPassword: boolean;
  githubBound: boolean;
}

export interface AdminUserListItem {
  id: number;
  name: string;
  email: string;
  role: AdminUserRole;
  status: number;
  authMethods: AdminUserAuthMethods;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AdminUserDetail {
  id: number;
  name: string;
  email: string;
  status: number;
  role: AdminUserRole;
  authMethods: AdminUserAuthMethods;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserSummary {
  total: number;
  enabled: number;
  disabled: number;
  admins: number;
}

export interface AdminUserPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  summary: AdminUserSummary;
  pagination: AdminUserPagination;
}

export interface ListAdminUsersInput {
  page?: number;
  pageSize?: number;
  keyword?: string;
  role?: string;
  status?: number | "";
}

export interface AdminUserUpsertInput {
  roleId: number;
  name: string;
  email: string;
}

export interface CreateAdminUserInput extends AdminUserUpsertInput {
  password: string;
}

export async function listAdminUsers(input: ListAdminUsersInput): Promise<AdminUserListResponse> {
  const params = new URLSearchParams();

  if (input.page) {
    params.set("page", String(input.page));
  }
  if (input.pageSize) {
    params.set("pageSize", String(input.pageSize));
  }
  if (input.keyword?.trim()) {
    params.set("keyword", input.keyword.trim());
  }
  if (input.role?.trim()) {
    params.set("role", input.role.trim());
  }
  if (input.status !== "" && input.status !== undefined) {
    params.set("status", String(input.status));
  }

  const query = params.toString();
  return apiRequest<AdminUserListResponse>(`/api/admin/users${query ? `?${query}` : ""}`);
}

export async function getAdminUser(userId: number): Promise<AdminUserDetail> {
  return apiRequest<AdminUserDetail>(`/api/admin/users/${userId}`);
}

export async function listAdminRoles(): Promise<AdminUserRoleOption[]> {
  const data = await apiRequest<{ items: AdminUserRoleOption[] }>("/api/admin/roles");
  return data.items;
}

export async function createAdminUser(input: CreateAdminUserInput): Promise<AdminUserDetail> {
  return apiRequest<AdminUserDetail>("/api/admin/users", {
    method: "POST",
    body: input,
  });
}

export async function updateAdminUser(userId: number, input: AdminUserUpsertInput & { status: number }): Promise<AdminUserDetail> {
  return apiRequest<AdminUserDetail>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function resetAdminUserPassword(userId: number, password: string): Promise<void> {
  await apiRequest(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: { password },
  });
}
