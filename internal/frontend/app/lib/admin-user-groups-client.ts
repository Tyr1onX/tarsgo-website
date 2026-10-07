import { apiRequest } from "~/lib/api-client";

export interface AdminUserGroupSummary {
  total: number;
  active: number;
  disabled: number;
  defaultCount: number;
}

export interface AdminUserGroupListItem {
  id: number;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  tags?: string[];
  isDefault: boolean;
  show: number;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserGroupListResponse {
	items: AdminUserGroupListItem[];
	summary: AdminUserGroupSummary;
}

export interface AdminUserGroupOption {
	id: number;
	name: string;
	status: number;
}

export interface ListAdminUserGroupsInput {
  status?: number | "";
}

export interface UpsertAdminUserGroupInput {
  name: string;
  description?: string;
  tags: string[];
  isDefault: boolean;
  show: number;
  status: number;
}

export type UpsertAdminUserGroupBody = UpsertAdminUserGroupInput | FormData;

export async function listAdminUserGroups(input: ListAdminUserGroupsInput): Promise<AdminUserGroupListResponse> {
  const params = new URLSearchParams();

  if (input.status !== "" && input.status !== undefined) {
    params.set("status", String(input.status));
  }

  const query = params.toString();
  return apiRequest<AdminUserGroupListResponse>(`/api/admin/user-groups${query ? `?${query}` : ""}`);
}

export async function listAdminUserGroupOptions(): Promise<AdminUserGroupOption[]> {
	const data = await apiRequest<{ items: AdminUserGroupOption[] }>("/api/admin/user-groups/options");
	return data.items;
}

export async function createAdminUserGroup(input: UpsertAdminUserGroupBody): Promise<AdminUserGroupListItem> {
  return apiRequest<AdminUserGroupListItem>("/api/admin/user-groups", {
    method: "POST",
    body: input,
  });
}

export async function updateAdminUserGroup(groupId: number, input: UpsertAdminUserGroupBody): Promise<AdminUserGroupListItem> {
  return apiRequest<AdminUserGroupListItem>(`/api/admin/user-groups/${groupId}`, {
    method: "PATCH",
    body: input,
  });
}
