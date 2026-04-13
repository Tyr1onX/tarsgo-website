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
  status: number;
  submittedAt: string;
  updatedAt: string;
}

export interface RegistrationListResponse {
  summary: RegistrationSummary;
  items: RegistrationListItem[];
}

export interface RegistrationFileMeta {
  file_name: string;
  file_url: string;
  file_size: number;
}

export interface RegistrationDetail {
  id: number;
  formId: number;
  formTitle: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  status: number;
  submittedAt: string;
  updatedAt: string;
  fieldsSchema: RegistrationFormField[];
  formData: Record<string, unknown>;
}

export interface SubmitRegistrationResult {
  id: number;
  formId: number;
  status: number;
  submittedAt: string;
}

export interface ListRegistrationsInput {
  keyword?: string;
  status?: number | "";
  formId?: number | "";
}

export async function submitRecruitmentRegistration(
  formData: FormData,
): Promise<SubmitRegistrationResult> {
  return apiRequest<SubmitRegistrationResult>("/api/recruitment/registrations", {
    method: "POST",
    body: formData,
  });
}

export async function listAdminRegistrations(
  input: ListRegistrationsInput = {},
): Promise<RegistrationListResponse> {
  const params = new URLSearchParams();

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
