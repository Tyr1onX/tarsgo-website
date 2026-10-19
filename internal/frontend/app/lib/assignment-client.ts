import { apiRequest } from "~/lib/api-client";

export interface AssignmentFile {
  id: number;
  fileName: string;
  contentType: string;
  size: number;
  downloadUrl: string;
}

export interface AssignmentReview {
  id: number;
  reviewerId: number;
  score: number;
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
  status?: "pending" | "overdue" | "submitted" | "passed" | "needs_redo";
  isLate?: boolean;
  targetCount: number;
  submittedCount: number;
  reviewedCount: number;
  passedCount: number;
  latestSubmission?: AssignmentSubmission;
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
  update: (id: number, input: AssignmentInput) => apiRequest<Assignment>(`/api/admin/assignments/${id}`, { method: "PATCH", body: input }),
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

export function assignmentDecisionLabel(decision?: string) {
  if (decision === "passed") return "已通过";
  if (decision === "needs_redo") return "需重做";
  return "待批改";
}
