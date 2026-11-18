import { apiRequest } from "./api-client.ts";

export type OperationsItemStatus = "active" | "blocked" | "done";
export type OperationsItemKind = "workstream" | "channel" | "video" | "merchandise";
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

export interface OperationsMember {
  id: number;
  name: string;
}

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
  kind: "progress" | "completed" | "stage" | "confirmed" | "reverted" | "undo";
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
  platforms: string;
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
  updates: OperationsUpdate[];
  snapshots: OperationsSnapshot[];
  posts: OperationsPost[];
  canManage: boolean;
  viewerId: number;
  members: OperationsMember[];
}

export type OperationsItemInput = Pick<OperationsItem, "title" | "kind" | "platforms" | "intervalDays" | "nextAction" | "nextCheckAt" | "status"> & { copyFromItemId?: number };
export type OperationsUpdateInput = Pick<OperationsUpdate, "content" | "kind" | "link" | "publishedOn">;

export function addOperationsStep(itemId: number, title: string) {
  return apiRequest<OperationsStep>(`/api/operations/progress/${itemId}/steps`, { method: "POST", body: { title } });
}

export function saveOperationsStep(itemId: number, stepId: number, changes: Partial<Pick<OperationsStep, "title" | "assigneeId" | "status" | "blockReason">>) {
  return apiRequest<{ id: number }>(`/api/operations/progress/${itemId}/steps/${stepId}`, {
    method: "PATCH", body: changes,
  });
}

export function deleteOperationsStep(itemId: number, stepId: number) {
  return apiRequest<{ id: number }>(`/api/operations/progress/${itemId}/steps/${stepId}`, { method: "DELETE" });
}

export function getOperationsBoard() {
  return apiRequest<OperationsBoard>("/api/operations/progress");
}

export function importDouyinPosts(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiRequest<{ count: number }>("/api/operations/douyin/import", { method: "POST", body });
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
  return item.lastUpdate || item.steps?.some((step) => step.status !== "pending") || (item.kind === "video" && item.stage !== "unconfirmed") ? "active" : "pending";
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