import { apiRequest } from "~/lib/api-client";

export interface QuestionAttachment {
  id: number;
  fileName: string;
  contentType: string;
  size: number;
  url: string;
}

export interface TrainingQuestion {
  id: number;
  groupId: number;
  groupName: string;
  askerId: number;
  askerName: string;
  title: string;
  body: string;
  visibility: "public" | "private";
  isSolved: boolean;
  solvedAt?: string;
  isFaq: boolean;
  createdAt: string;
  lastReplyAt?: string;
  postCount: number;
  attachments: QuestionAttachment[];
}

export interface TrainingQuestionPost {
  id: number;
  authorId: number;
  authorName: string;
  kind: "answer" | "follow_up";
  body: string;
  createdAt: string;
  attachments: QuestionAttachment[];
}

export interface TrainingQuestionDetail {
  question: TrainingQuestion;
  posts: TrainingQuestionPost[];
}

export interface QuestionListFilter {
  groupId?: number;
  q?: string;
  status?: "open" | "solved" | "";
  faqOnly?: boolean;
  mineOnly?: boolean;
}

function queryString(filter: QuestionListFilter) {
  const params = new URLSearchParams();
  if (filter.groupId) params.set("groupId", String(filter.groupId));
  if (filter.q?.trim()) params.set("q", filter.q.trim());
  if (filter.status) params.set("status", filter.status);
  if (filter.faqOnly) params.set("faqOnly", "true");
  if (filter.mineOnly) params.set("mineOnly", "true");
  return params.toString();
}

function questionForm(groupId: number | null, fields: Record<string, string>, files: File[]) {
  const body = new FormData();
  if (groupId !== null) body.append("groupId", String(groupId));
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  for (const file of files) body.append("files", file, file.name);
  return body;
}

export const trainingQuestionClient = {
  listMember: (filter: QuestionListFilter) => apiRequest<TrainingQuestion[]>(`/api/questions?${queryString(filter)}`),
  getMember: (id: number) => apiRequest<TrainingQuestionDetail>(`/api/questions/${id}`),
  create: (groupId: number, input: { title: string; body: string; visibility: "public" | "private"; files: File[] }) =>
    apiRequest<TrainingQuestionDetail>("/api/questions", {
      method: "POST",
      body: questionForm(groupId, { title: input.title, body: input.body, visibility: input.visibility }, input.files),
    }),
  replyMember: (id: number, input: { kind: "answer" | "follow_up"; body: string; files: File[] }) =>
    apiRequest<TrainingQuestionDetail>(`/api/questions/${id}/posts`, {
      method: "POST",
      body: questionForm(null, { kind: input.kind, body: input.body }, input.files),
    }),
  solveMember: (id: number, isSolved: boolean) =>
    apiRequest<TrainingQuestionDetail>(`/api/questions/${id}/solved`, { method: "PATCH", body: { isSolved } }),
  listAdmin: (filter: QuestionListFilter) => apiRequest<TrainingQuestion[]>(`/api/admin/questions?${queryString(filter)}`),
  getAdmin: (id: number) => apiRequest<TrainingQuestionDetail>(`/api/admin/questions/${id}`),
  replyAdmin: (id: number, body: string, files: File[]) =>
    apiRequest<TrainingQuestionDetail>(`/api/admin/questions/${id}/posts`, {
      method: "POST",
      body: questionForm(null, { kind: "answer", body }, files),
    }),
  solveAdmin: (id: number, isSolved: boolean) =>
    apiRequest<TrainingQuestionDetail>(`/api/admin/questions/${id}/solved`, { method: "PATCH", body: { isSolved } }),
  setFAQ: (id: number, isFaq: boolean) =>
    apiRequest<TrainingQuestionDetail>(`/api/admin/questions/${id}/faq`, { method: "PATCH", body: { isFaq } }),
};

export function formatQuestionDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export function questionStatusLabel(question: Pick<TrainingQuestion, "isSolved">) {
  return question.isSolved ? "已解决" : "待解决";
}
