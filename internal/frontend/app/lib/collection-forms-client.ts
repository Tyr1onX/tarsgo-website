import { apiRequest, buildApiUrl } from "~/lib/api-client";

export type CollectionOption = { label: string; description?: string; value: string; capacity?: number; remaining?: number };
export type CollectionField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "radio" | "select" | "checkbox";
  required: boolean;
  options?: CollectionOption[];
};
export type CollectionForm = {
  id: number;
  title: string;
  description: string;
  fields: CollectionField[];
  status: "draft" | "published" | "closed";
  loginRequired: boolean;
  capacity: number;
  opensAt: string | null;
  closesAt: string | null;
  createdAt?: string;
  count?: number;
};
export type CollectionInput = Omit<CollectionForm, "id" | "createdAt" | "count">;
export type CollectionUsage = Record<string, Record<string, number>>;
export type CollectionSubmission = {
  id: number;
  formId: number;
  userId?: number;
  answers: Record<string, string | number | string[]>;
  createdAt: string;
};

export const collectionClient = {
  list: () => apiRequest<{ items: CollectionForm[] }>("/api/admin/collection-forms"),
  get: (id: number) => apiRequest<{ form: CollectionForm; count: number; usage: CollectionUsage }>(`/api/admin/collection-forms/${id}`),
  create: (body: CollectionInput) => apiRequest<CollectionForm>("/api/admin/collection-forms", { method: "POST", body }),
  update: (id: number, body: CollectionInput) =>
    apiRequest<{ id: number }>(`/api/admin/collection-forms/${id}`, { method: "PUT", body }),
  delete: (id: number) => apiRequest(`/api/admin/collection-forms/${id}`, { method: "DELETE" }),
  submissions: (id: number) => apiRequest<{ items: CollectionSubmission[] }>(`/api/admin/collection-forms/${id}/submissions`),
  deleteSubmission: (id: number, submissionId: number) =>
    apiRequest(`/api/admin/collection-forms/${id}/submissions/${submissionId}`, { method: "DELETE" }),
  exportUrl: (id: number) => buildApiUrl(`/api/admin/collection-forms/${id}/export`),
  publicForm: (id: number) => apiRequest<{ form: CollectionForm; remaining: number; count: number }>(`/api/collection-forms/${id}`),
  submit: (id: number, answers: Record<string, unknown>) =>
    apiRequest<{ submitted: boolean }>(`/api/collection-forms/${id}/submissions`, { method: "POST", body: { answers } }),
};
