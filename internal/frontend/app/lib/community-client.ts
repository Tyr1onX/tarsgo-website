import { apiRequest } from "~/lib/api-client";

export const COMMUNITY_CATEGORIES = [
  { id: "technology", label: "技术交流" },
  { id: "project", label: "项目记录" },
  { id: "experience", label: "经验分享" },
  { id: "team", label: "战队日常" },
] as const;

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number]["id"];
export type CommunitySort = "latest" | "hot";

export interface CommunityAttachment {
  id: number;
  fileName: string;
  contentType: string;
  size: number;
  url: string;
}

export interface CommunityPost {
  id: number;
  groupId: number;
  groupName?: string;
  category: CommunityCategory;
  title: string;
  body: string;
  authorId: number;
  authorName: string;
  authorAvatar?: string;
  visibility: "public" | "private";
  isSolved?: boolean;
  isFaq?: boolean;
  isPinned: boolean;
  isHidden: boolean;
  isLegacy: boolean;
  createdAt: string;
  editedAt?: string;
  lastReplyAt?: string;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  canEdit: boolean;
  canModerate: boolean;
  attachments: CommunityAttachment[];
}

export interface CommunityComment {
  id: number;
  parentPostId?: number;
  authorId: number;
  authorName: string;
  authorAvatar?: string;
  body: string;
  createdAt: string;
  editedAt?: string;
  isDeleted: boolean;
  canEdit: boolean;
  attachments: CommunityAttachment[];
}

export interface CommunityDetail {
  post: CommunityPost;
  comments: CommunityComment[];
}

export interface CommunityPage {
  items: CommunityPost[];
  page: number;
  hasMore: boolean;
}

export interface CommunityFilter {
  sort?: CommunitySort;
  category?: CommunityCategory | "";
  q?: string;
  saved?: boolean;
  page?: number;
  pageSize?: number;
  groupId?: number;
  mineOnly?: boolean;
  faqOnly?: boolean;
  status?: "open" | "solved" | "";
}

export interface CommunityReactionState {
  active: boolean;
  likeCount: number;
}

function queryString(filter: CommunityFilter) {
  const params = new URLSearchParams();
  if (filter.sort) params.set("sort", filter.sort);
  if (filter.category) params.set("category", filter.category);
  if (filter.q?.trim()) params.set("q", filter.q.trim());
  if (filter.saved) params.set("saved", "true");
  if (filter.page) params.set("page", String(filter.page));
  if (filter.pageSize) params.set("pageSize", String(filter.pageSize));
  if (filter.groupId) params.set("groupId", String(filter.groupId));
  if (filter.mineOnly) params.set("mineOnly", "true");
  if (filter.faqOnly) params.set("faqOnly", "true");
  if (filter.status) params.set("status", filter.status);
  return params.toString();
}

function postForm(fields: Record<string, string>, files: File[] = []) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  for (const file of files) body.append("files", file, file.name);
  return body;
}

export const communityClient = {
  list: (filter: CommunityFilter) => apiRequest<CommunityPage>(`/api/community/posts?${queryString(filter)}`),
  hot: (limit = 5) => apiRequest<CommunityPost[]>(`/api/community/hot?limit=${limit}`),
  get: (id: number) => apiRequest<CommunityDetail>(`/api/community/posts/${id}`),
  create: (input: { category: CommunityCategory; title: string; body: string; files: File[] }) =>
    apiRequest<CommunityDetail>("/api/community/posts", {
      method: "POST",
      body: postForm({ category: input.category, title: input.title, body: input.body }, input.files),
    }),
  update: (id: number, input: { category: CommunityCategory; title: string; body: string }) =>
    apiRequest<CommunityDetail>(`/api/community/posts/${id}`, { method: "PATCH", body: input }),
  remove: (id: number) => apiRequest<{ id: number }>(`/api/community/posts/${id}`, { method: "DELETE" }),
  addComment: (id: number, input: { body: string; parentPostId?: number; files?: File[] }) =>
    apiRequest<CommunityDetail>(`/api/community/posts/${id}/comments`, {
      method: "POST",
      body: postForm({ body: input.body, ...(input.parentPostId ? { parentPostId: String(input.parentPostId) } : {}) }, input.files),
    }),
  updateComment: (id: number, body: string) =>
    apiRequest<CommunityDetail>(`/api/community/comments/${id}`, { method: "PATCH", body: { body } }),
  removeComment: (id: number) => apiRequest<CommunityDetail>(`/api/community/comments/${id}`, { method: "DELETE" }),
  like: (id: number, active: boolean) =>
    apiRequest<CommunityReactionState>(`/api/community/posts/${id}/like`, { method: active ? "PUT" : "DELETE" }),
  bookmark: (id: number, active: boolean) =>
    apiRequest<CommunityReactionState>(`/api/community/posts/${id}/bookmark`, { method: active ? "PUT" : "DELETE" }),
  moderate: (id: number, input: { pinned?: boolean; hidden?: boolean }) =>
    apiRequest<CommunityDetail>(`/api/community/posts/${id}/moderation`, { method: "PATCH", body: input }),
};

export function communityCategoryLabel(category: string) {
  return COMMUNITY_CATEGORIES.find((item) => item.id === category)?.label ?? "技术交流";
}

export function formatCommunityDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function communityPostHref(id: number) {
  return `/dashboard/community/${id}`;
}

export const communityImageAccept = "image/jpeg,image/png,image/gif,image/webp";
export const communityImageHint = "最多 5 张 · 单张≤10 MB · 总计≤20 MB";

const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

export function validateCommunityImages(files: File[]) {
  if (files.length > 5) return "图片最多上传 5 张。";
  if (files.some((file) => file.size <= 0 || file.size > 10 * 1024 * 1024)) return "单张图片不能为空且不能超过 10 MB。";
  if (files.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) return "图片总大小不能超过 20 MB。";
  if (files.some((file) => !imageExtensions.has(file.name.split(".").pop()?.toLowerCase() ?? ""))) return "仅支持 JPG、PNG、GIF 或 WebP 图片。";
  return null;
}
