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
	groupState: "assigned" | "unassigned" | "pending";
	groupName?: string;
	groups: AdminUserGroupMembership[];
	cleanupPending: boolean;
}

export interface AdminUserGroupMembership {
	groupId: number;
	name: string;
	status: number;
	role: number;
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
  realName?: string | null;
  phone?: string | null;
  currentRecruitmentGroupId?: number | null;
	groupState: "assigned" | "unassigned" | "pending";
	groups: AdminUserGroupMembership[];
	cleanupPending: boolean;
  recruitmentHistory: Array<{
    id: number;
    formId: number;
    formTitle: string;
    formStatus: number;
    recruitmentStatus: string;
    preferredGroupId?: number | null;
    preferredGroup: string;
    submittedAt: string;
  }>;
}

export interface AdminUserSummary {
  total: number;
  enabled: number;
  disabled: number;
  admins: number;
	grouped: number;
	unassigned: number;
	pending: number;
	cleanupPending: number;
	groupDistribution: Array<{ groupId: number; name: string; userCount: number }>;
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
	groupState?: "" | "assigned" | "unassigned" | "pending" | "cleanup";
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
  if (input.groupState) {
    params.set("groupState", input.groupState);
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

export async function updateAdminUserRecruitmentGroup(userId: number, groupId: number): Promise<AdminUserDetail> {
  return apiRequest<AdminUserDetail>(`/api/admin/users/${userId}/recruitment-group`, {
    method: "PATCH",
    body: { groupId },
  });
}

export async function updateAdminUserGroup(userId: number, groupId: number | null): Promise<AdminUserDetail> {
	return apiRequest<AdminUserDetail>(`/api/admin/users/${userId}/group`, {
		method: "PATCH",
		body: { groupId },
	});
}

export async function updateAdminUserGroupRole(userId: number, groupId: number, role: number): Promise<AdminUserDetail> {
	return apiRequest<AdminUserDetail>(`/api/admin/users/${userId}/group-role`, {
		method: "PATCH",
		body: { groupId, role },
	});
}

export async function resetAdminUserPassword(userId: number, password: string): Promise<void> {
  await apiRequest(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: { password },
  });
}
