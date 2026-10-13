import { apiRequest } from "~/lib/api-client";
import type { RegistrationFormField } from "~/lib/registration-forms-client";

export type RecruitmentStatus =
  | "pending_screening"
  | "pending_interview"
  | "admitted"
  | "rejected"
  | "withdrawn";

export type RecruitmentRejectedStage = "screening" | "interview";
export type InterviewAttendance = "pending" | "attending" | "not_attending";

export interface InterviewSession {
  id: number;
  date: string;
  label: string;
  startTime: string;
  endTime: string;
  location: string;
  enabled: boolean;
  confirmedCount: number;
}

export interface InterviewAttendanceResult {
  attendance: InterviewAttendance;
  session?: InterviewSession | null;
  availableSessions: InterviewSession[];
  canModify: boolean;
}

export interface UpsertInterviewSessionInput {
  date: string;
  label: string;
  startTime: string;
  endTime: string;
  location: string;
  enabled: boolean;
}

export interface RegistrationSummary {
  total: number;
  pendingScreening: number;
  pendingInterview: number;
  admitted: number;
  rejected: number;
  withdrawn: number;
}

export interface AdminWorkbenchSummaryResponse {
  currentFormAvailable: boolean;
  summary: RegistrationSummary;
}

export interface RegistrationGroupRef {
  id: number;
  name: string;
}

export interface RegistrationReviewerRef {
  id: number;
  name: string;
  email: string;
}

export interface RegistrationListItem {
  id: number;
  formId: number;
  formTitle: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  preferredGroup?: RegistrationGroupRef | null;
  status: RecruitmentStatus;
  rejectedStage?: RecruitmentRejectedStage | null;
  interviewAttendance: InterviewAttendance;
  interviewSession?: InterviewSession | null;
  canScreen: boolean;
  canInterview: boolean;
  submittedAt: string;
  updatedAt: string;
}

export interface RegistrationPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RegistrationListResponse {
  currentFormAvailable: boolean;
  archivedView: boolean;
  summary: RegistrationSummary;
  items: RegistrationListItem[];
  pagination: RegistrationPagination;
}

export interface RegistrationFileMeta {
  file_name: string;
  file_url: string;
  file_size: number;
}

export interface RegistrationDetail {
  notificationWarning?: string;
  interviewResultHistory: InterviewResultHistoryItem[];
  id: number;
  formId: number;
  formTitle: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  preferredGroup?: RegistrationGroupRef | null;
  status: RecruitmentStatus;
  rejectedStage?: RecruitmentRejectedStage | null;
  screener?: RegistrationReviewerRef | null;
  screenedAt?: string | null;
  screeningRemark?: string | null;
  interviewer?: RegistrationReviewerRef | null;
  interviewedAt?: string | null;
  interviewRemark?: string | null;
  interviewAttendance: InterviewAttendance;
  interviewSession?: InterviewSession | null;
  canScreen: boolean;
  canUndoScreening: boolean;
  canInterview: boolean;
  submittedAt: string;
  updatedAt: string;
  fieldsSchema: RegistrationFormField[];
  formData: Record<string, unknown>;
}

export interface InterviewNotificationState {
  status: string;
  recipient?: string;
  providerMessageId?: string | null;
  attemptCount: number;
  lastAttemptAt?: string | null;
  lastError?: string | null;
}

export interface InterviewResultHistoryItem {
  revision: number;
  previousStatus?: RecruitmentStatus | null;
  resultStatus: RecruitmentStatus;
  reason?: string | null;
  actor?: RegistrationReviewerRef | null;
  createdAt: string;
  notification?: InterviewNotificationState | null;
}

export interface InterviewNotificationPreview {
  revision: number;
  status: string;
  recipient: string;
  subject: string;
  body: string;
  qrCodeStatus: "not_required" | "ready" | "missing" | "unreadable";
  canSend: boolean;
  requiresConfirmation: boolean;
  warning?: string;
}

export interface InterviewNotificationAttempt {
  status: string;
  providerMessageId?: string | null;
  attemptCount: number;
  lastAttemptAt?: string | null;
  message: string;
}

export interface SubmitRegistrationResult {
  id: number;
  formId: number;
  status: RecruitmentStatus;
  submittedAt: string;
  updatedAt: string;
}

export interface ListRegistrationsInput {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: RecruitmentStatus | "";
  formId?: number | "";
  preferredGroupId?: number | "";
  interviewAttendance?: InterviewAttendance | "";
  interviewDate?: string;
  interviewSessionLabel?: string;
  interviewResult?: "processed" | "";
}

export interface ScreeningDecisionInput {
  decision: "approve" | "reject";
  remark?: string;
}

export interface InterviewDecisionInput {
  decision: "admit" | "reject";
  remark?: string;
}

export interface InterviewResultCorrectionInput extends InterviewDecisionInput {
  correctionReason: string;
}

export async function submitRecruitmentRegistration(
  formData: FormData,
): Promise<SubmitRegistrationResult> {
  return apiRequest<SubmitRegistrationResult>("/api/recruitment/registrations", {
    method: "POST",
    body: formData,
  });
}

export async function updateRecruitmentRegistration(
  registrationId: number,
  formData: FormData,
): Promise<SubmitRegistrationResult> {
  return apiRequest<SubmitRegistrationResult>(`/api/recruitment/registrations/${registrationId}`, {
    method: "PATCH",
    body: formData,
  });
}

export async function cancelRecruitmentRegistration(registrationId: number): Promise<void> {
  await apiRequest(`/api/recruitment/registrations/${registrationId}`, {
    method: "DELETE",
  });
}

export async function listAdminRegistrations(
  input: ListRegistrationsInput = {},
): Promise<RegistrationListResponse> {
  const params = new URLSearchParams();

  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.keyword?.trim()) params.set("keyword", input.keyword.trim());
  if (input.status !== "" && input.status !== undefined) params.set("status", input.status);
  if (input.formId !== "" && input.formId !== undefined) params.set("formId", String(input.formId));
  if (input.preferredGroupId !== "" && input.preferredGroupId !== undefined) params.set("preferredGroupId", String(input.preferredGroupId));
  if (input.interviewAttendance) params.set("interviewAttendance", input.interviewAttendance);
  if (input.interviewDate?.trim()) params.set("interviewDate", input.interviewDate.trim());
  if (input.interviewSessionLabel?.trim()) params.set("interviewSessionLabel", input.interviewSessionLabel.trim());
  if (input.interviewResult) params.set("interviewResult", input.interviewResult);

  const query = params.toString();
  return apiRequest<RegistrationListResponse>(
    `/api/admin/registrations${query ? `?${query}` : ""}`,
  );
}

export async function getAdminRegistration(
  registrationId: number,
): Promise<RegistrationDetail> {
  return apiRequest<RegistrationDetail>(`/api/admin/registrations/${registrationId}`);
}

export async function screenAdminRegistration(
  registrationId: number,
  input: ScreeningDecisionInput,
): Promise<RegistrationDetail> {
  return apiRequest<RegistrationDetail>(`/api/admin/registrations/${registrationId}/screening`, {
    method: "POST",
    body: input,
  });
}

export async function undoAdminRegistrationScreening(
  registrationId: number,
): Promise<RegistrationDetail> {
  return apiRequest<RegistrationDetail>(`/api/admin/registrations/${registrationId}/screening`, {
    method: "DELETE",
  });
}

export async function recordAdminRegistrationInterview(
  registrationId: number,
  input: InterviewDecisionInput,
): Promise<RegistrationDetail> {
  return apiRequest<RegistrationDetail>(`/api/admin/registrations/${registrationId}/interview`, {
    method: "POST",
    body: input,
  });
}

export async function correctAdminRegistrationInterview(
  registrationId: number,
  input: InterviewResultCorrectionInput,
): Promise<RegistrationDetail> {
  return apiRequest<RegistrationDetail>(`/api/admin/registrations/${registrationId}/interview`, {
    method: "PUT",
    body: input,
  });
}

export async function getAdminInterviewNotificationPreview(
  registrationId: number,
): Promise<InterviewNotificationPreview> {
  return apiRequest<InterviewNotificationPreview>(`/api/admin/registrations/${registrationId}/interview-notification`);
}

export async function sendAdminInterviewResultNotification(
  registrationId: number,
  confirmUncertain: boolean,
): Promise<InterviewNotificationAttempt> {
  return apiRequest<InterviewNotificationAttempt>(`/api/admin/registrations/${registrationId}/interview-notification/send`, {
    method: "POST",
    body: { confirmUncertain },
  });
}

export async function listAdminInterviewSessions(): Promise<InterviewSession[]> {
  const data = await apiRequest<{ items: InterviewSession[] }>("/api/admin/interview-sessions");
  return data.items;
}

export async function getAdminWorkbenchSummary(): Promise<AdminWorkbenchSummaryResponse> {
  return apiRequest<AdminWorkbenchSummaryResponse>("/api/admin/workbench/summary");
}

export async function createAdminInterviewSession(input: UpsertInterviewSessionInput): Promise<InterviewSession> {
  return apiRequest<InterviewSession>("/api/admin/interview-sessions", { method: "POST", body: input });
}

export async function updateAdminInterviewSession(sessionId: number, input: UpsertInterviewSessionInput): Promise<InterviewSession> {
  return apiRequest<InterviewSession>(`/api/admin/interview-sessions/${sessionId}`, { method: "PATCH", body: input });
}

export async function getRecruitmentInterviewAttendance(registrationId: number): Promise<InterviewAttendanceResult> {
  return apiRequest<InterviewAttendanceResult>(`/api/recruitment/registrations/${registrationId}/interview-attendance`);
}

export async function updateRecruitmentInterviewAttendance(
  registrationId: number,
  input: { attendance: Exclude<InterviewAttendance, "pending">; interviewSessionId?: number | null },
): Promise<InterviewAttendanceResult> {
  return apiRequest<InterviewAttendanceResult>(`/api/recruitment/registrations/${registrationId}/interview-attendance`, {
    method: "PUT",
    body: input,
  });
}
