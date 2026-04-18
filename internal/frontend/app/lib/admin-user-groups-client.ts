import { apiRequest } from "~/lib/api-client";
import type { AdminUserRole } from "~/lib/admin-users-client";

export interface AdminUserGroupSummary {
  total: number;
  active: number;
  disabled: number;
  defaultCount: number;
  totalMembers: number;
}

export interface AdminUserGroupListItem {
  id: number;
  name: string;
  description?: string | null;
  tags?: string[];
  isDefault: boolean;
  show: number;
  status: number;
  memberCount: number;
  leaders?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserGroupMemberUser {
  id: number;
  name: string;
  email: string;
  status: number;
  role: AdminUserRole;
}

export interface AdminUserGroupMember {
  id: number;
  userId: number;
  role: number;
  joinedAt: string;
  user: AdminUserGroupMemberUser;
}

export interface AdminUserGroupDetail extends AdminUserGroupListItem {
  members: AdminUserGroupMember[];
}

export interface AdminUserGroupCandidateGroup {
  id: number;
  name: string;
}

export interface AdminUserGroupCandidate {
  id: number;
  name: string;
  email: string;
  status: number;
  role: AdminUserRole;
  groups?: AdminUserGroupCandidateGroup[];
}

export interface AdminUserGroupListResponse {
  items: AdminUserGroupListItem[];
  summary: AdminUserGroupSummary;
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

export interface UpsertAdminUserGroupMemberInput {
  role: number;
}

export interface AddAdminUserGroupMemberInput extends UpsertAdminUserGroupMemberInput {
  userId: number;
}

export async function listAdminUserGroups(input: ListAdminUserGroupsInput): Promise<AdminUserGroupListResponse> {
  const params = new URLSearchParams();

  if (input.status !== "" && input.status !== undefined) {
    params.set("status", String(input.status));
  }

  const query = params.toString();
  return apiRequest<AdminUserGroupListResponse>(`/api/admin/user-groups${query ? `?${query}` : ""}`);
}

export async function getAdminUserGroup(groupId: number): Promise<AdminUserGroupDetail> {
  return apiRequest<AdminUserGroupDetail>(`/api/admin/user-groups/${groupId}`);
}

export async function createAdminUserGroup(input: UpsertAdminUserGroupInput): Promise<AdminUserGroupDetail> {
  return apiRequest<AdminUserGroupDetail>("/api/admin/user-groups", {
    method: "POST",
    body: input,
  });
}

export async function updateAdminUserGroup(groupId: number, input: UpsertAdminUserGroupInput): Promise<AdminUserGroupDetail> {
  return apiRequest<AdminUserGroupDetail>(`/api/admin/user-groups/${groupId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteAdminUserGroup(groupId: number): Promise<void> {
  await apiRequest(`/api/admin/user-groups/${groupId}`, {
    method: "DELETE",
  });
}

export async function listAdminUserGroupMemberCandidates(groupId: number): Promise<AdminUserGroupCandidate[]> {
  const params = new URLSearchParams({ groupId: String(groupId) });
  const data = await apiRequest<{ items: AdminUserGroupCandidate[] }>(
    `/api/admin/user-groups/member-candidates?${params.toString()}`,
  );
  return data.items;
}

export async function addAdminUserGroupMember(groupId: number, input: AddAdminUserGroupMemberInput): Promise<AdminUserGroupMember> {
  return apiRequest<AdminUserGroupMember>(`/api/admin/user-groups/${groupId}/members`, {
    method: "POST",
    body: input,
  });
}

export async function updateAdminUserGroupMember(groupId: number, memberId: number, input: UpsertAdminUserGroupMemberInput): Promise<AdminUserGroupMember> {
  return apiRequest<AdminUserGroupMember>(`/api/admin/user-groups/${groupId}/members/${memberId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteAdminUserGroupMember(groupId: number, memberId: number): Promise<void> {
  await apiRequest(`/api/admin/user-groups/${groupId}/members/${memberId}`, {
    method: "DELETE",
  });
}
