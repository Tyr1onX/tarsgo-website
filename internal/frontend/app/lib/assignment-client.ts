import { ApiError, apiRequest, buildApiUrl, type ApiEnvelope } from "~/lib/api-client";

export interface AssignmentFile {
  id: number;
  fileName: string;
  contentType: string;
  size: number;
  downloadUrl: string;
}

export interface AssignmentMaterialFile {
  id: number;
  fileName: string;
  contentType: string;
  size: number;
  downloadUrl: string;
  createdAt: string;
}

export interface AssignmentReview {
  id: number;
  reviewerId: number;
  score?: number;
  decision: "passed" | "needs_redo";
  comment: string;
  createdAt: string;
}

export interface AssignmentSubmission {
  id: number;
  attempt: number;
  submittedAt: string;
  isLate: boolean;
  status: "submitted" | "graded";
  decision?: "passed" | "needs_redo";
  files: AssignmentFile[];
  reviews: AssignmentReview[];
}

export interface Assignment {
  id: number;
  groupId: number;
  groupName: string;
  creatorId: number;
  title: string;
  description: string;
  dueAt: string;
  attachmentRequirements: string;
  isGroupWide: boolean;
  createdAt: string;
  publicationStatus?: "published" | "withdrawn";
  canDelete?: boolean;
  status?: "pending" | "overdue" | "submitted" | "passed" | "needs_redo";
  isLate?: boolean;
  targetCount: number;
  submittedCount: number;
  reviewedCount: number;
  passedCount: number;
  latestSubmission?: AssignmentSubmission;
  materialFiles?: AssignmentMaterialFile[];
}

export interface MyAssignmentDetail {
  assignment: Assignment;
  submissions: AssignmentSubmission[];
}

export interface AssignmentMember {
  userId: number;
  name: string;
  status: string;
  isLate: boolean;
  latestSubmission?: AssignmentSubmission;
  submissions: AssignmentSubmission[];
}

export interface AdminAssignmentDetail {
  assignment: Assignment;
  members: AssignmentMember[];
}

export interface AssignmentPublishResult {
  assignment: Assignment;
  materialFiles: AssignmentMaterialFile[];
}

export interface AssignmentMemberOption {
  userId: number;
  name: string;
}

export interface AssignmentInput {
  groupId: number;
  title: string;
  description: string;
  dueAt: string;
  attachmentRequirements: string;
  isGroupWide: boolean;
  targetUserIds: number[];
}

export const assignmentClient = {
  listMine: () => apiRequest<Assignment[]>("/api/assignments"),
  getMine: (id: number) => apiRequest<MyAssignmentDetail>(`/api/assignments/${id}`),
  submit: (id: number, files: File[]) => {
    const body = new FormData();
    for (const file of files) body.append("files", file, file.name);
    return apiRequest<MyAssignmentDetail>(`/api/assignments/${id}/submissions`, { method: "POST", body });
  },
  listAdmin: (groupId?: number) => apiRequest<Assignment[]>(`/api/admin/assignments${groupId ? `?groupId=${groupId}` : ""}`),
  listGroupMembers: (groupId: number) => apiRequest<AssignmentMemberOption[]>(`/api/admin/assignment-members?groupId=${groupId}`),
  create: (input: AssignmentInput) => apiRequest<Assignment>("/api/admin/assignments", { method: "POST", body: input }),
  publishWithMaterials: (input: AssignmentInput, files: File[], requestId: string, onProgress: (progress: number) => void, onUploadStarted: () => void) => {
    const body = new FormData();
    body.append("assignment", JSON.stringify(input));
    for (const file of files) body.append("files", file, file.name);
    const request = new XMLHttpRequest();
    const promise = new Promise<AssignmentPublishResult>((resolve, reject) => {
      request.open("POST", buildApiUrl("/api/admin/assignments/publish"));
      request.withCredentials = true;
      request.setRequestHeader("Accept", "application/json");
      request.setRequestHeader("Idempotency-Key", requestId);
      request.upload.onloadstart = onUploadStarted;
      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      };
      request.onerror = () => reject(new ApiError("网络中断，发布状态待确认；可以使用相同请求安全重试。", 0));
      request.onabort = () => reject(new ApiError("上传已中断，发布状态待确认；可以使用相同请求安全重试。", 0));
      request.onload = () => {
        let payload: ApiEnvelope<AssignmentPublishResult> | null = null;
        try { payload = JSON.parse(request.responseText) as ApiEnvelope<AssignmentPublishResult>; } catch { payload = null; }
        if (request.status < 200 || request.status >= 300 || !payload || payload.code >= 400) {
          reject(new ApiError(payload?.message ?? "作业及教学资料发布失败，请重试。", payload?.code ?? request.status));
          return;
        }
        onProgress(100);
        resolve(payload.data);
      };
      request.send(body);
    });
    return { promise, cancel: () => request?.abort() };
  },
  update: (id: number, input: AssignmentInput) => apiRequest<Assignment>(`/api/admin/assignments/${id}`, { method: "PATCH", body: input }),
  setPublicationStatus: (id: number, status: "published" | "withdrawn") =>
    apiRequest<Assignment>(`/api/admin/assignments/${id}/status`, { method: "PATCH", body: { status } }),
  delete: (id: number) => apiRequest<{ id: number }>(`/api/admin/assignments/${id}`, { method: "DELETE" }),
  uploadMaterialFiles: (id: number, files: File[], onProgress: (progress: number) => void) => {
    const body = new FormData();
    for (const file of files) body.append("files", file, file.name);
    return new Promise<AssignmentMaterialFile[]>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", buildApiUrl(`/api/admin/assignments/${id}/materials`));
      request.withCredentials = true;
      request.setRequestHeader("Accept", "application/json");
      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      };
      request.onerror = () => reject(new ApiError("教学资料上传失败，请检查网络后重试。", 0));
      request.onabort = () => reject(new ApiError("教学资料上传已取消。", 0));
      request.onload = () => {
        let payload: ApiEnvelope<AssignmentMaterialFile[]> | null = null;
        try { payload = JSON.parse(request.responseText) as ApiEnvelope<AssignmentMaterialFile[]>; } catch { payload = null; }
        if (request.status < 200 || request.status >= 300 || !payload || payload.code >= 400) {
          reject(new ApiError(payload?.message ?? "教学资料上传失败，请稍后重试。", payload?.code ?? request.status));
          return;
        }
        onProgress(100);
        resolve(payload.data);
      };
      request.send(body);
    });
  },
  removeMaterialFile: (assignmentId: number, fileId: number) =>
    apiRequest<AssignmentMaterialFile[]>(`/api/admin/assignments/${assignmentId}/materials/${fileId}`, { method: "DELETE" }),
  getAdmin: (id: number) => apiRequest<AdminAssignmentDetail>(`/api/admin/assignments/${id}`),
  review: (submissionId: number, input: { score: number; decision: "passed" | "needs_redo"; comment: string }) =>
    apiRequest<AdminAssignmentDetail>(`/api/admin/assignments/submissions/${submissionId}/reviews`, { method: "POST", body: input }),
};

export function formatAssignmentDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function assignmentStatusLabel(status?: string) {
  switch (status) {
    case "overdue": return "已逾期";
    case "submitted": return "已提交";
    case "graded": return "已批改";
    case "passed": return "已通过";
    case "needs_redo": return "需重做";
    default: return "待提交";
  }
}

export function assignmentPublicationStatusLabel(status?: string) {
  return status === "withdrawn" ? "已撤回" : "已发布";
}

export function assignmentDecisionLabel(decision?: string) {
  if (decision === "passed") return "已通过";
  if (decision === "needs_redo") return "需重做";
  return "待批改";
}
