import { apiRequest } from "~/lib/api-client";

export type RegistrationFormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "phone"
  | "email"
  | "user_group_select"
  | "file"
  | "image";

export interface RegistrationFormFieldOption {
  label: string;
  value: string;
}

export interface RegistrationFormField {
  key: string;
  label: string;
  type: RegistrationFormFieldType;
  required: boolean;
  placeholder?: string;
  description?: string;
  default_value?: unknown;
  validation?: Record<string, unknown>;
  options?: RegistrationFormFieldOption[];
  file_config?: Record<string, unknown>;
  cascade_config?: Record<string, unknown>;
}

export interface RegistrationFormSummary {
  total: number;
  draft: number;
  published: number;
  closed: number;
}

export interface RegistrationFormListItem {
  id: number;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  fieldCount: number;
  requiredCount: number;
  maxRegistrations?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationFormDetail extends RegistrationFormListItem {
  fieldsSchema: RegistrationFormField[];
}

export interface RegistrationFormsListResponse {
  items: RegistrationFormListItem[];
  summary: RegistrationFormSummary;
}

export interface ListRegistrationFormsInput {
  keyword?: string;
  status?: number | "";
}

export interface UpsertRegistrationFormInput {
  title: string;
  description?: string;
  coverImageUrl?: string;
  fieldsSchema: RegistrationFormField[];
  maxRegistrations?: number | null;
  startTime?: string;
  endTime?: string;
  status: number;
}

export interface ActiveRecruitmentFormResult {
  id: number;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  fieldsSchema: RegistrationFormField[];
  maxRegistrations?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  status: number;
}

export async function listAdminRegistrationForms(
  input: ListRegistrationFormsInput = {},
): Promise<RegistrationFormsListResponse> {
  const params = new URLSearchParams();

  if (input.keyword?.trim()) {
    params.set("keyword", input.keyword.trim());
  }
  if (input.status !== "" && input.status !== undefined) {
    params.set("status", String(input.status));
  }

  const query = params.toString();
  return apiRequest<RegistrationFormsListResponse>(
    `/api/admin/registration-forms${query ? `?${query}` : ""}`,
  );
}

export async function getAdminRegistrationForm(
  formId: number,
): Promise<RegistrationFormDetail> {
  return apiRequest<RegistrationFormDetail>(`/api/admin/registration-forms/${formId}`);
}

export async function createAdminRegistrationForm(
  input: UpsertRegistrationFormInput,
): Promise<RegistrationFormDetail> {
  return apiRequest<RegistrationFormDetail>("/api/admin/registration-forms", {
    method: "POST",
    body: input,
  });
}

export async function updateAdminRegistrationForm(
  formId: number,
  input: UpsertRegistrationFormInput,
): Promise<RegistrationFormDetail> {
  return apiRequest<RegistrationFormDetail>(`/api/admin/registration-forms/${formId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function getActiveRecruitmentForm(): Promise<ActiveRecruitmentFormResult> {
  return apiRequest<ActiveRecruitmentFormResult>("/api/recruitment/form");
}
