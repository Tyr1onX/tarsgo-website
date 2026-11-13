import { apiRequest } from "./api-client.ts";

export type OperationsItemStatus = "active" | "blocked" | "done";

export interface OperationsUpdate {
  id: number;
  itemId: number;
  authorId: number;
  content: string;
  kind: "progress" | "completed";
  link: string;
  createdAt: string;
}

export interface OperationsItem {
  id: number;
  title: string;
  owner: string;
  intervalDays: number;
  nextAction: string;
  nextCheckAt: string | null;
  status: OperationsItemStatus;
  createdAt: string;
  updatedAt: string;
  lastUpdate: OperationsUpdate | null;
  lastCompletedAt: string | null;
}

export interface OperationsBoard {
  items: OperationsItem[];
  updates: OperationsUpdate[];
  canManage: boolean;
}

export type OperationsItemInput = Pick<OperationsItem, "title" | "owner" | "intervalDays" | "nextAction" | "nextCheckAt" | "status">;
export type OperationsUpdateInput = Pick<OperationsUpdate, "content" | "kind" | "link">;

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
    return expected && expected < now ? "overdue" : item.lastCompletedAt ? "active" : "pending";
  }
  if (item.nextCheckAt && new Date(item.nextCheckAt) < now) return "overdue";
  return item.lastUpdate ? "active" : "pending";
}

export const operationsAttentionLabel: Record<OperationsAttention, string> = {
  done: "已结束", blocked: "遇到阻塞", overdue: "需要跟进", pending: "待启动", active: "推进中",
};

export function nextOperationsDate(item: OperationsItem): Date | null {
  if (item.intervalDays <= 0) return item.nextCheckAt ? new Date(item.nextCheckAt) : null;
  const since = new Date(item.lastCompletedAt ?? item.createdAt);
  return new Date(since.getTime() + item.intervalDays * 24 * 60 * 60 * 1000);
}

export function formatOperationsDate(date: string | Date | null | undefined): string {
  if (!date) return "尚未记录";
  return new Date(date).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function sortOperationsItems(items: OperationsItem[]) {
  const order: Record<OperationsAttention, number> = { blocked: 0, overdue: 1, pending: 2, active: 3, done: 4 };
  return [...items].sort((left, right) =>
    order[getOperationsAttention(left)] - order[getOperationsAttention(right)]
    || right.id - left.id);
}
