import { apiRequest } from "~/lib/api-client";
import type { RegistrationFormField } from "~/lib/registration-forms-client";

export interface RegistrationSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
}

export interface RegistrationListItem {
  id: number;
  formId: number;
  formTitle: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  group1?: RegistrationGroupRef | null;
  group1Status: number;
  group2?: RegistrationGroupRef | null;
  group2Status: number;
  status: number;
  canApprove: boolean;
  canReject: boolean;
  canUndo: boolean;
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
  group1?: RegistrationGroupRef | null;
  group1Status: number;
  group2?: RegistrationGroupRef | null;
  group2Status: number;
  status: number;
  interviews: RegistrationInterview[];
  finalGroup?: RegistrationGroupRef | null;
  finalStatus: number;
  finalizedAt?: string | null;
  finalizer?: RegistrationReviewerRef | null;
  canInterview1: boolean;
  canInterview2: boolean;
  reviewer1?: RegistrationReviewerRef | null;
  reviewedAt1?: string | null;
  reviewRemark1?: string | null;
  reviewer2?: RegistrationReviewerRef | null;
  reviewedAt2?: string | null;
  reviewRemark2?: string | null;
  canApprove: boolean;
  canReject: boolean;
  canUndo: boolean;
  submittedAt: string;
  updatedAt: string;
  fieldsSchema: RegistrationFormField[];
  formData: Record<string, unknown>;
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

export interface RegistrationInterview { groupId: number; group?: RegistrationGroupRef | null; status: number; remark?: string | null; interviewer?: RegistrationReviewerRef | null; interviewedAt?: string | null; }

export interface SubmitRegistrationResult {
  id: number;
  formId: number;
  status: number;
  submittedAt: string;
  updatedAt: string;
}

export interface ListRegistrationsInput {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number | "";
  formId?: number | "";
}

export interface ReviewRegistrationInput {
  decision: "approve" | "reject";
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

  if (input.page) {
    params.set("page", String(input.page));
  }
  if (input.pageSize) {
    params.set("pageSize", String(input.pageSize));
  }
  if (input.keyword?.trim()) {
    params.set("keyword", input.keyword.trim());
  }
  if (input.status !== "" && input.status !== undefined) {
    params.set("status", String(input.status));
  }
  if (input.formId !== "" && input.formId !== undefined) {
    params.set("formId", String(input.formId));
  }

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

export async function reviewAdminRegistration(
  registrationId: number,
  input: ReviewRegistrationInput,
): Promise<RegistrationDetail> {
  return apiRequest<RegistrationDetail>(`/api/admin/registrations/${registrationId}/review`, {
    method: "POST",
    body: input,
  });
}

export async function undoAdminRegistrationReview(
  registrationId: number,
): Promise<RegistrationDetail> {
  return apiRequest<RegistrationDetail>(`/api/admin/registrations/${registrationId}/review`, {
    method: "DELETE",
  });
}

export async function updateAdminRegistrationInterview(registrationId: number, groupId: number, input: {status: "pending" | "passed" | "failed"; remark?: string}): Promise<RegistrationDetail> {
  return apiRequest<RegistrationDetail>(`/api/admin/registrations/${registrationId}/interviews/${groupId}`, { method: "PATCH", body: input });
}

export async function deleteAdminRegistration(registrationId: number): Promise<void> {
  await apiRequest(`/api/admin/registrations/${registrationId}`, {
    method: "DELETE",
  });
}
