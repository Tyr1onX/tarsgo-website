import { apiRequest } from "~/lib/api-client";
import type { AdminUserGroupListItem } from "~/lib/admin-user-groups-client";

export type AnnouncementStatus = "draft" | "published" | "archived";
export type PortalAudienceType = "all" | "groups";
export type AnnouncementCategory = "competition" | "training" | "team" | "system";

export interface PortalAnnouncement {
  id: number;
  title: string;
  summary: string;
  content: string;
  category: AnnouncementCategory;
  status: AnnouncementStatus;
  isPinned: boolean;
  publishAt: string | null;
  expireAt: string | null;
  audienceType: PortalAudienceType;
  targetGroupIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface PortalEvent {
  id: number;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  status: "draft" | "published" | "cancelled";
  audienceType: PortalAudienceType;
  targetGroupIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface EventInput {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  status: "draft" | "published" | "cancelled";
  audienceType: PortalAudienceType;
  targetGroupIds: number[];
}

export interface EventList {
  items: PortalEvent[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PortalLink {
  id: number;
  name: string;
  url: string;
  iconKey: string;
  sortOrder: number;
  openInNewWindow: boolean;
  isEnabled: boolean;
  audienceType: PortalAudienceType;
  targetGroupIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface LinkInput {
  name: string;
  url: string;
  iconKey: "book" | "folder" | "home" | "external" | "link";
  sortOrder: number;
  isEnabled: boolean;
  openInNewWindow: boolean;
  audienceType: PortalAudienceType;
  targetGroupIds: number[];
}

export interface PortalHomeData {
  announcements: PortalAnnouncement[];
  events: PortalEvent[];
  links: PortalLink[];
  generatedAt: string;
}

export interface AnnouncementInput {
  title: string;
  summary: string;
  content: string;
  category: AnnouncementCategory;
  status: AnnouncementStatus;
  isPinned: boolean;
  publishAt: string | null;
  expireAt: string | null;
  audienceType: PortalAudienceType;
  targetGroupIds: number[];
}

export interface AnnouncementList {
  items: PortalAnnouncement[];
  page: number;
  pageSize: number;
  total: number;
}

export function getPortalHome(): Promise<PortalHomeData> {
  return apiRequest<PortalHomeData>("/api/portal/home");
}

export function listAdminAnnouncements(status = ""): Promise<AnnouncementList> {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if (status) params.set("status", status);
  return apiRequest<AnnouncementList>(`/api/admin/announcements?${params.toString()}`);
}

export async function listManagedPortalGroups(): Promise<AdminUserGroupListItem[]> {
  return (await apiRequest<{ items: AdminUserGroupListItem[] }>("/api/admin/portal-groups")).items;
}

export function createAdminAnnouncement(input: AnnouncementInput): Promise<PortalAnnouncement> {
  return apiRequest<PortalAnnouncement>("/api/admin/announcements", { method: "POST", body: input });
}

export function updateAdminAnnouncement(id: number, input: AnnouncementInput): Promise<PortalAnnouncement> {
  return apiRequest<PortalAnnouncement>(`/api/admin/announcements/${id}`, { method: "PATCH", body: input });
}

export async function deleteAdminAnnouncement(id: number): Promise<void> {
  await apiRequest(`/api/admin/announcements/${id}`, { method: "DELETE" });
}

export function listAdminEvents(status = ""): Promise<EventList> {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  if (status) params.set("status", status);
  return apiRequest<EventList>(`/api/admin/portal-events?${params.toString()}`);
}

export function createAdminEvent(input: EventInput): Promise<PortalEvent> {
  return apiRequest<PortalEvent>("/api/admin/portal-events", { method: "POST", body: input });
}

export function updateAdminEvent(id: number, input: EventInput): Promise<PortalEvent> {
  return apiRequest<PortalEvent>(`/api/admin/portal-events/${id}`, { method: "PATCH", body: input });
}

export async function deleteAdminEvent(id: number): Promise<void> {
  await apiRequest(`/api/admin/portal-events/${id}`, { method: "DELETE" });
}

export async function listAdminLinks(): Promise<PortalLink[]> {
  return (await apiRequest<{ items: PortalLink[] }>("/api/admin/portal-links")).items;
}
export function createAdminLink(input: LinkInput): Promise<PortalLink> {
  return apiRequest<PortalLink>("/api/admin/portal-links", { method: "POST", body: input });
}
export function updateAdminLink(id: number, input: LinkInput): Promise<PortalLink> {
  return apiRequest<PortalLink>(`/api/admin/portal-links/${id}`, { method: "PATCH", body: input });
}
export async function deleteAdminLink(id: number): Promise<void> {
  await apiRequest(`/api/admin/portal-links/${id}`, { method: "DELETE" });
}
