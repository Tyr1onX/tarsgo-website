import { apiRequest } from "~/lib/api-client";

export interface LeaveProfile {
  name: string;
  studentId: string;
  collegeCode: string;
  participantType: "formal" | "reserve" | "other";
  identityLocked: boolean;
}
export type LeaveAccessStatus = "not_requested" | "pending" | "approved" | "rejected";
export interface LeaveAccessState { status: LeaveAccessStatus; requestedAt?: string; reviewedAt?: string }
export interface LeaveAccessRequest { id: number; userId: number; userName: string; email: string; status: "pending"; requestedAt: string }

export interface CollegeOption { code: string; name: string }
export interface LeaveRequest { id: number; userId: number; startAt: string; endAt: string; name: string; studentId: string; status: string; createdAt: string; isUnread?: boolean }
export interface LeaveGroup { index: number; startAt: string; endAt: string; timeText: string; count: number; members: Array<{ userId: number; name: string; studentId: string }>; result: { available: boolean; filename?: string; expiresAt?: string } }
export interface SchoolRun { id: number; collectedAt: string; reason: string; status: string; requestCount: number; memberCount: number; groups: LeaveGroup[]; documentReady: boolean }
export interface DailyWindow { id: number; title: string; startAt: string; endAt: string; openUntil: string; teamOpen: boolean; publicEnabled: boolean; status: string; acceptingParticipants: boolean; participantCount?: number; publicPath?: string }
export interface DailyEntry { id: number; windowId?: number; userId?: number; startAt?: string; endAt?: string; name: string; studentId: string; collegeCode: string; participantType: string; submittedAt: string; isUnread?: boolean; documentRequests?: Array<{ id: number; requestStage: string; requestType: string; fileVersion: string; offline: boolean; requestedAt: string }> }
export interface CampEvent { id: number; title: string; type: "winter" | "summer"; startDate: string; endDate: string; collectionDeadline: string; status: string; acceptingParticipants: boolean; joined?: boolean; participantType?: string; submittedAt?: string; participantCount?: number; publicPath?: string }
export interface CampDetail { event: CampEvent; groups: Array<{ college: string; collegeName: string; count: number; participants: Array<{ id: number; name: string; studentId: string; participantType: string; submittedAt: string }> }> }
export interface ReadyDownload { downloadUrl: string; filename: string }
export interface SchoolLeaveSummary { pendingCount: number; awaitingReturnCount: number; todoCount: number; unreadCount: number; contactPhoneReady: boolean; dailyCutoff: string }

export const leaveClient = {
  schoolSummary: () => apiRequest<SchoolLeaveSummary>("/api/admin/school-leave/summary"),
  leaveAccess: () => apiRequest<LeaveAccessState>("/api/leave/access"),
  requestLeaveAccess: () => apiRequest<LeaveAccessState>("/api/leave/access/request", { method: "POST" }),
  pendingLeaveAccessRequests: () => apiRequest<LeaveAccessRequest[]>("/api/admin/leave/access-requests"),
  reviewLeaveAccessRequest: (id: number, status: "approved" | "rejected") => apiRequest<LeaveAccessState>(`/api/admin/leave/access-requests/${id}`, { method: "PATCH", body: { status } }),
  colleges: () => apiRequest<CollegeOption[]>("/api/leave/colleges"),
  profile: () => apiRequest<LeaveProfile | null>("/api/leave/profile"),
  saveProfile: (profile: Omit<LeaveProfile, "identityLocked">) => apiRequest<LeaveProfile>("/api/leave/profile", { method: "PUT", body: profile }),
  schoolRequests: () => apiRequest<LeaveRequest[]>("/api/school-leave/requests"),
  createSchoolRequest: (body: { startAt: string; endAt: string }) => apiRequest<LeaveRequest>("/api/school-leave/requests", { method: "POST", body }),
  updateSchoolRequest: (id: number, body: { startAt: string; endAt: string }) => apiRequest<LeaveRequest>(`/api/school-leave/requests/${id}`, { method: "PATCH", body }),
  withdrawSchoolRequest: (id: number) => apiRequest<LeaveRequest>(`/api/school-leave/requests/${id}/withdraw`, { method: "POST" }),
  adminSchoolRequests: () => apiRequest<LeaveRequest[]>("/api/admin/school-leave/requests"),
  markAdminRecordRead: (recordType: string, recordId: number) => apiRequest<void>("/api/admin/school-leave/admin-records/read", { method: "POST", body: { recordType, recordId } }),
  schoolRuns: () => apiRequest<SchoolRun[]>("/api/admin/school-leave/runs"),
  collectSchool: () => apiRequest<SchoolRun | null>("/api/admin/school-leave/runs/collect", { method: "POST" }),
  cancelSchoolRun: (id: number) => apiRequest<SchoolRun>(`/api/admin/school-leave/runs/${id}/cancel`, { method: "POST" }),
  deleteSchoolRun: (id: number) => apiRequest<void>(`/api/admin/school-leave/runs/${id}`, { method: "DELETE" }),
  updateSchoolReason: (id: number, reason: string) => apiRequest<SchoolRun>(`/api/admin/school-leave/runs/${id}/reason`, { method: "PATCH", body: { reason } }),
  dailyWindows: () => apiRequest<DailyWindow[]>("/api/daily-leave/windows"),
  adminDailyWindows: () => apiRequest<DailyWindow[]>("/api/admin/daily-leave/windows"),
  createDailyWindow: (body: { title: string; startAt: string; endAt: string; openUntil: string }) => apiRequest<DailyWindow>("/api/admin/daily-leave/windows", { method: "POST", body }),
  enableDailyPublicLink: (id: number) => apiRequest<DailyWindow>(`/api/admin/daily-leave/windows/${id}/public-link`, { method: "POST" }),
  closeDailyWindow: (id: number) => apiRequest<DailyWindow>(`/api/admin/daily-leave/windows/${id}/close`, { method: "POST" }),
  prepareDailySelf: (body: { startAt: string; endAt: string }, offline: boolean) => apiRequest<ReadyDownload>(`/api/daily-leave/self-service/document${offline ? "?offline=true" : ""}`, { method: "POST", body }),
  prepareDailyWindow: (id: number, offline: boolean) => apiRequest<ReadyDownload>(`/api/daily-leave/windows/${id}/document${offline ? "?offline=true" : ""}`, { method: "POST" }),
  publicDailyWindow: (token: string) => apiRequest<DailyWindow>(`/api/daily-leave/public/${token}`),
  preparePublicDaily: (token: string, body: { name: string; studentId: string; collegeCode: string }, offline: boolean) => apiRequest<ReadyDownload>(`/api/daily-leave/public/${token}/document${offline ? "?offline=true" : ""}`, { method: "POST", body }),
  dailyRecords: () => apiRequest<DailyEntry[]>("/api/admin/daily-leave/records"),
  myDailyRecords: () => apiRequest<DailyEntry[]>("/api/daily-leave/records"),
  campEvents: () => apiRequest<CampEvent[]>("/api/camp-leave/events"),
  adminCampEvents: () => apiRequest<CampEvent[]>("/api/admin/camp-leave/events"),
  createCampEvent: (body: { title: string; type: "winter" | "summer"; startDate: string; endDate: string; collectionDeadline: string }) => apiRequest<CampEvent>("/api/admin/camp-leave/events", { method: "POST", body }),
  campDetail: (id: number) => apiRequest<CampDetail>(`/api/admin/camp-leave/events/${id}`),
  joinCamp: (id: number) => apiRequest<CampEvent>(`/api/camp-leave/events/${id}/join`, { method: "POST" }),
  leaveCamp: (id: number) => apiRequest<void>(`/api/camp-leave/events/${id}/leave`, { method: "POST" }),
  closeCamp: (id: number) => apiRequest<CampEvent>(`/api/admin/camp-leave/events/${id}/close`, { method: "POST" }),
  removeCampParticipant: (eventId: number, participantId: number) => apiRequest<void>(`/api/admin/camp-leave/events/${eventId}/participants/${participantId}`, { method: "DELETE" }),
  publicCampEvent: (token: string) => apiRequest<CampEvent>(`/api/camp-leave/public/${token}`),
  publicJoinCamp: (token: string, body: { name: string; studentId: string; collegeCode: string }) => apiRequest<void>(`/api/camp-leave/public/${token}/participants`, { method: "POST", body }),
};

export async function downloadLeaveFile(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(path, { credentials: "include", cache: "no-store" });
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
