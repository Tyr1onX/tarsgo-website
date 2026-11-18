import { apiRequest } from "./api-client.ts";

export type OperationsItemStatus = "active" | "blocked" | "done";
export type OperationsItemKind = "workstream" | "channel" | "video" | "article" | "merchandise";
export type OperationsStepStatus = "pending" | "active" | "blocked" | "done";
export type OperationsVideoStage = "" | "unconfirmed" | "planning" | "materials" | "editing" | "review" | "published" | "design" | "approval" | "sample" | "production" | "delivered";

export interface OperationsStep {
  id: number;
  itemId: number;
  key: string;
  title: string;
  position: number;
  assigneeId: number | null;
  assigneeName: string;
  status: OperationsStepStatus;
  blockReason: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface OperationsSnapshot {
  id: number;
  platform: "bilibili" | "douyin" | "wechat" | "wechat_video";
  observedOn: string;
  followers: number;
  newFollowers: number | null;
  unfollows: number | null;
  returningFans: number | null;
  source: string;
}

export interface OperationsPost {
  id: number;
  platform: string;
  externalId: string;
  title: string;
  url: string;
  publishedAt: string;
  viewCount: number;
  mediaType: string;
  likeCount: number;
  recommendCount: number;
  commentCount: number;
  shareCount: number;
  favoriteCount: number;
  profileVisits: number | null;
  followerGain: number | null;
  syncedAt: string;
}

export interface OperationsUpdate {
  id: number;
  itemId: number;
  stepId: number | null;
  authorId: number;
  authorName?: string;
  content: string;
  kind: "progress" | "completed" | "stage" | "confirmed" | "reverted" | "undo";
  fromStage: string;
  toStage: string;
  link: string;
  publishedOn: string | null;
  createdAt: string;
}

export interface OperationsPublication {
  id: number;
  itemId: number;
  platform: "douyin" | "bilibili" | "wechat" | "wechat_video";
  status: "pending" | "done";
  url: string;
  versionNote: string;
  updatedBy: number | null;
  completedAt: string | null;
  updatedAt: string;
}

export const operationsPlatformNames: Record<string,string> = {
  douyin: "抖音", bilibili: "B站", wechat: "公众号", wechat_video: "视频号",
};

export interface OperationsItem {
  id: number;
  title: string;
  seriesName: string;
  predecessorId: number | null;
  publications: OperationsPublication[];
  kind: OperationsItemKind;
  platforms: string;
  channelId: number | null;
  episodeNo: number;
  publicationUrl: string;
  steps: OperationsStep[];
  stage: OperationsVideoStage;
  owner: string;
  intervalDays: number;
  nextAction: string;
  nextCheckAt: string | null;
  status: OperationsItemStatus;
  createdAt: string;
  updatedAt: string;
  lastUpdate: OperationsUpdate | null;
  lastCompletedOn: string | null;
}

export interface OperationsBoard {
  items: OperationsItem[];
  snapshots: OperationsSnapshot[];
  canManage: boolean;
  viewerId: number;
}

export function getOperationsBoard() {
  return apiRequest<OperationsBoard>("/api/operations/progress");
}

export function getDouyinSyncStatus() {
  return apiRequest<{ enabled: boolean; connected: boolean }>("/api/operations/douyin/status");
}

export function importDouyinPosts(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<{ count: number }>("/api/operations/douyin/import", { method: "POST", body });
}

export function importDouyinFans(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<{ count: number }>("/api/operations/douyin/fans/import", { method: "POST", body });
}

export function importWeChatFollowers(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<{ count: number; first: string; last: string }>("/api/operations/wechat/import", { method: "POST", body });
}

export function saveOperationsStep(itemId: number, stepId: number, changes: { status: OperationsStepStatus; blockReason?: string; note?: string; evidenceUrl?: string }) {
  return apiRequest<{ id: number }>(`/api/operations/progress/${itemId}/steps/${stepId}`, {
    method: "PATCH", body: changes,
  });
}

export interface OperationsMember { id: number; name: string }
export interface OperationsStepAttachment {
  id: number; itemId: number; stepId: number; authorId: number;
  fileName: string; size: number; createdAt: string;
}
export interface OperationsStepActivity {
  updates: OperationsUpdate[];
  attachments: OperationsStepAttachment[];
}
export interface OperationsArchive {
  id: number; title: string; platform: string; channelId: number; episodeNo: number;
  publicationUrl: string; completedAt: string | null;
}
export interface OperationsWorks {
  posts: OperationsPost[];
  total: number;
  archives: OperationsArchive[];
  archiveTotal: number;
  page: number;
  pageSize: number;
}
export function createOperationsEpisode(channelId: number, title: string, seriesName = "") {
  return apiRequest<OperationsItem>(`/api/operations/channels/${channelId}/episodes`, { method: "POST", body: { title, seriesName } });
}

export function saveOperationsPublication(itemId: number, platform: string,
  changes: { status: "pending"|"done"; url: string; versionNote: string }) {
  return apiRequest<{ itemId: number; platform: string }>(`/api/operations/progress/${itemId}/publications/${platform}`,
    { method: "PATCH", body: changes });
}
export function getOperationsMembers() {
  return apiRequest<OperationsMember[]>("/api/operations/members");
}
export function setupOperationsEpisode(itemId: number, title: string, seriesName: string, platforms: string[],
  owners: Array<{ stepId: number; assigneeId: number }>) {
  return apiRequest<{ id: number }>(`/api/operations/progress/${itemId}/setup`,
    { method: "PATCH", body: { title, seriesName, platforms, owners } });
}
export function getOperationsStepActivity(itemId: number, stepId: number) {
  return apiRequest<OperationsStepActivity>(`/api/operations/progress/${itemId}/steps/${stepId}/activity`);
}
export function uploadOperationsStepFile(itemId: number, stepId: number, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<OperationsStepAttachment>(`/api/operations/progress/${itemId}/steps/${stepId}/attachments`, { method: "POST", body });
}
export function operationsStepFileURL(fileId: number) {
  return `/api/operations/attachments/${fileId}`;
}
export function getOperationsWorks(platform = "", page = 1) {
  const query = new URLSearchParams({ page: String(page) });
  if (platform) query.set("platform", platform);
  return apiRequest<OperationsWorks>(`/api/operations/works?${query.toString()}`);
}

export type OperationsAttention = "done" | "blocked" | "overdue" | "pending" | "active";

export function getOperationsAttention(item: OperationsItem, now = new Date()): OperationsAttention {
  if (item.status === "done") return "done";
  if (item.status === "blocked") return "blocked";
  if (item.steps?.length) return item.steps.every((step) => step.status === "pending") ? "pending" : "active";
  if (item.intervalDays > 0) {
    const expected = nextOperationsDate(item);
    return expected && expected < now ? "overdue" : item.lastCompletedOn ? "active" : "pending";
  }
  if (item.nextCheckAt && new Date(item.nextCheckAt) < now) return "overdue";
  return item.lastUpdate || item.steps?.some((step) => step.status !== "pending") || (item.kind === "video" && item.stage !== "unconfirmed") ? "active" : "pending";
}

export const operationsAttentionLabel: Record<OperationsAttention, string> = {
  done: "已结束", blocked: "遇到阻塞", overdue: "需要跟进", pending: "待启动", active: "推进中",
};

export function nextOperationsDate(item: OperationsItem): Date | null {
  if (item.intervalDays <= 0) return item.nextCheckAt ? new Date(item.nextCheckAt) : null;
  const since = item.lastCompletedOn ? new Date(`${item.lastCompletedOn}T00:00:00+08:00`) : new Date(item.createdAt);
  return new Date(since.getTime() + item.intervalDays * 24 * 60 * 60 * 1000);
}

export function formatOperationsDate(date: string | Date | null | undefined): string {
  if (!date) return "尚未记录";
  return new Date(date).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatOperationsDay(value: string | null | undefined) {
  if (!value) return "尚未核实";
  const parts = value.split("-");
  return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`;
}

export function daysSinceOperationsPublish(publishedOn: string | null, now = new Date()) {
  if (!publishedOn) return null;
  const todayBeijing = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return Math.max(0, Math.round((Date.parse(todayBeijing) - Date.parse(publishedOn)) / 86400000));
}

export function formatOperationsUpdateDate(update: OperationsUpdate) {
  return update.kind === "completed" && update.publishedOn
    ? formatOperationsDay(update.publishedOn)
    : formatOperationsDate(update.createdAt);
}

export function sortOperationsItems(items: OperationsItem[]) {
  const order: Record<OperationsAttention, number> = { blocked: 0, overdue: 1, pending: 2, active: 3, done: 4 };
  return [...items].sort((left, right) =>
    order[getOperationsAttention(left)] - order[getOperationsAttention(right)]
    || right.id - left.id);
}