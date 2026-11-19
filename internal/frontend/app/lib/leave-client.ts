import { apiRequest } from "~/lib/api-client";

export interface LeaveProfile {
  name: string;
  studentId: string;
  collegeCode: string;
  participantType: "formal" | "reserve" | "other";
  identityLocked: boolean;
}
export type LeaveAccessStatus = "not_requested" | "granted" | "pending" | "approved" | "rejected" | "used" | "revoked";
export interface LeaveAccessState { status: LeaveAccessStatus; startAt?: string; endAt?: string; requestedAt?: string; reviewedAt?: string }
export interface LeaveAccessRequest { id: number; userId: number; userName: string; email: string; status: LeaveAccessStatus; startAt?: string; endAt?: string; requestedAt: string }

export interface CollegeOption { code: string; name: string }
export interface DailyWindow { id: number; title: string; startAt: string; endAt: string; openUntil: string; teamOpen: boolean; publicEnabled: boolean; status: string; acceptingParticipants: boolean; participantCount?: number; publicPath?: string }
export interface DailyEntry { id: number; windowId?: number; userId?: number; startAt?: string; endAt?: string; name: string; studentId: string; collegeCode: string; participantType: string; submittedAt: string; isUnread?: boolean; documentRequests?: Array<{ id: number; requestStage: string; requestType: string; fileVersion: string; offline: boolean; requestedAt: string }> }
export interface CampEvent { id: number; title: string; type: "winter" | "summer"; startDate: string; endDate: string; collectionDeadline: string; status: string; acceptingParticipants: boolean; joined?: boolean; participantType?: string; submittedAt?: string; participantCount?: number; publicPath?: string }
export interface ReadyDownload { downloadUrl: string; filename: string }

export const leaveClient = {
  leaveAccess: () => apiRequest<LeaveAccessState>("/api/leave/access"),
  requestLeaveAccess: (body: { startAt: string; endAt: string }) => apiRequest<LeaveAccessState>("/api/leave/request", { method: "POST", body }),
  pendingLeaveAccessRequests: () => apiRequest<LeaveAccessRequest[]>("/api/admin/leave/requests"),
  reviewLeaveAccessRequest: (id: number, status: "approved" | "rejected") => apiRequest<LeaveAccessState>(`/api/admin/leave/requests/${id}`, { method: "PATCH", body: { status } }),
  leavePermissions: () => apiRequest<LeaveAccessRequest[]>("/api/admin/leave/permissions"),
  setLeavePermission: (userId: number, mode: "permanent" | "temporary" | "revoke") => apiRequest<LeaveAccessState>(`/api/admin/leave/permissions/${userId}`, { method: "PUT", body: { mode } }),
  adminMemberProfile: (userId: number) => apiRequest<LeaveProfile | null>(`/api/admin/leave/users/${userId}/profile`),
  adminGenerateDaily: (userId: number, body: { startAt: string; endAt: string }, offline: boolean) => downloadLeaveFile(
    `/api/admin/leave/users/${userId}/document${offline ? "?offline=true" : ""}`,
    "请假条.docx",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  ),
  colleges: () => apiRequest<CollegeOption[]>("/api/leave/colleges"),
  profile: () => apiRequest<LeaveProfile | null>("/api/leave/profile"),

  prepareDailySelf: (body: { startAt: string; endAt: string }, offline: boolean) => apiRequest<ReadyDownload>(`/api/daily-leave/self-service/document${offline ? "?offline=true" : ""}`, { method: "POST", body }),
  dailyRecordsPage: (admin: boolean, cursor = "") => apiRequest<{ items: DailyEntry[]; nextCursor?: string }>(`/api/${admin ? "admin/" : ""}daily-leave/records?${new URLSearchParams({ paged: "true", selfService: "true", ...(cursor ? { cursor } : {}) })}`),
  publicDailyWindow: (token: string) => apiRequest<DailyWindow>(`/api/daily-leave/public/${token}`),
  preparePublicDaily: (token: string, body: { name: string; studentId: string; collegeCode: string }, offline: boolean) => apiRequest<ReadyDownload>(`/api/daily-leave/public/${token}/document${offline ? "?offline=true" : ""}`, { method: "POST", body }),
  publicCampEvent: (token: string) => apiRequest<CampEvent>(`/api/camp-leave/public/${token}`),
  publicJoinCamp: (token: string, body: { name: string; studentId: string; collegeCode: string }) => apiRequest<void>(`/api/camp-leave/public/${token}/participants`, { method: "POST", body }),
};

export async function downloadLeaveFile(path: string, fallbackName: string, options: RequestInit = {}): Promise<void> {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...options });
  if (!response.ok) {
    let message = "下载失败，请稍后重试";
    try { const payload = await response.json() as { message?: string }; message = payload.message || message; } catch { /* Keep the fallback. */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
