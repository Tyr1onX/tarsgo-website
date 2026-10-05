import { apiRequest } from "~/lib/api-client";
import type { RegistrationFormField } from "~/lib/registration-forms-client";

export type RecruitmentStatus =
  | "pending_screening"
  | "pending_interview"
  | "admitted"
  | "rejected"
  | "withdrawn";

export type RecruitmentRejectedStage = "screening" | "interview";

export interface RegistrationSummary {
  total: number;
  pendingScreening: number;
  pendingInterview: number;
  admitted: number;
  rejected: number;
  withdrawn: number;
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
  canScreen: boolean;
  canUndoScreening: boolean;
  canInterview: boolean;
  submittedAt: string;
  updatedAt: string;
  fieldsSchema: RegistrationFormField[];
  formData: Record<string, unknown>;
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
}

export interface ScreeningDecisionInput {
  decision: "approve" | "reject";
  remark?: string;
}

export interface InterviewDecisionInput {
  decision: "admit" | "reject";
  remark?: string;
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

export async function deleteAdminRegistration(registrationId: number): Promise<void> {
  await apiRequest(`/api/admin/registrations/${registrationId}`, {
    method: "DELETE",
  });
}
