import { apiRequest } from "./api-client.ts";

export type OperationsItemStatus = "active" | "blocked" | "done";
export type OperationsItemKind = "workstream" | "channel" | "video" | "merchandise";
export type OperationsVideoStage = "" | "unconfirmed" | "planning" | "materials" | "editing" | "review" | "published" | "design" | "approval" | "sample" | "production" | "delivered";

export const videoStageLabels = [
  { key: "planning", label: "选题文案" },
  { key: "materials", label: "素材拍摄" },
  { key: "editing", label: "剪辑制作" },
  { key: "review", label: "审核确认" },
  { key: "published", label: "发布" },
] as const;

export const merchandiseStageLabels = [
  { key: "planning", label: "需求确定" },
  { key: "design", label: "设计制作" },
  { key: "approval", label: "设计定稿" },
  { key: "sample", label: "打样确认" },
  { key: "production", label: "批量生产" },
  { key: "delivered", label: "完成发放" },
] as const;

export interface OperationsSnapshot {
  id: number;
  platform: "bilibili" | "douyin" | "wechat";
  observedOn: string;
  followers: number;
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
  syncedAt: string;
}

export interface OperationsUpdate {
  id: number;
  itemId: number;
  authorId: number;
  content: string;
  kind: "progress" | "completed" | "stage" | "confirmed";
  fromStage: string;
  toStage: string;
  link: string;
  publishedOn: string | null;
  createdAt: string;
}

export interface OperationsItem {
  id: number;
  title: string;
  kind: OperationsItemKind;
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
  lastStageChangedAt: string | null;
  lastConfirmedAt: string | null;
}

export interface OperationsBoard {
  items: OperationsItem[];
  updates: OperationsUpdate[];
  snapshots: OperationsSnapshot[];
  posts: OperationsPost[];
  canManage: boolean;
}

export type OperationsItemInput = Pick<OperationsItem, "title" | "kind" | "stage" | "owner" | "intervalDays" | "nextAction" | "nextCheckAt" | "status">;
export type OperationsUpdateInput = Pick<OperationsUpdate, "content" | "kind" | "link" | "publishedOn">;

export function recordOperationsStage(id: number, stage: string | null) {
  return apiRequest<{ id: number }>(`/api/operations/progress/${id}/stage`, {
    method: "POST",
    body: stage === null ? { confirm: true } : { stage },
  });
}

export function getOperationsBoard() {
  return apiRequest<OperationsBoard>("/api/operations/progress");
}

export function createOperationsItem(input: OperationsItemInput) {
  return apiRequest<OperationsItem>("/api/operations/progress", { method: "POST", body: input });
}

export function saveOperationsItem(id: number, input: OperationsItemInput) {
  return apiRequest<{ id: number }>(`/api/operations/progress/${id}`, { method: "PATCH", body: input });
}

export function recordOperationsUpdate(id: number, input: OperationsUpdateInput) {
  return apiRequest<OperationsUpdate>(`/api/operations/progress/${id}/updates`, { method: "POST", body: input });
}

export function getOperationsHistory(id: number) {
  return apiRequest<OperationsUpdate[]>(`/api/operations/progress/${id}/updates`);
}

export type OperationsAttention = "done" | "blocked" | "overdue" | "pending" | "active";

export function getOperationsAttention(item: OperationsItem, now = new Date()): OperationsAttention {
  if (item.status === "done") return "done";
  if (item.status === "blocked") return "blocked";
  if (item.intervalDays > 0) {
    const expected = nextOperationsDate(item);
    return expected && expected < now ? "overdue" : item.lastCompletedOn ? "active" : "pending";
  }
  if (item.nextCheckAt && new Date(item.nextCheckAt) < now) return "overdue";
  return item.lastUpdate || (item.kind === "video" && item.stage !== "unconfirmed") ? "active" : "pending";
}

export const operationsAttentionLabel: Record<OperationsAttention, string> = {
  done: "已结束", blocked: "遇到阻塞", overdue: "需要跟进", pending: "待补充", active: "推进中",
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
