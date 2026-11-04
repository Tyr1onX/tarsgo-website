import { apiRequest } from "~/lib/api-client";

export interface AcademicInfo {
  isStudent?: boolean | null;
  realName: string;
  college: string;
  grade: string;
  studentId: string;
  campus: string;
  gender: number;
}
export interface SalonEvent {
  id: number;
  title: string;
  summary: string;
  posterUrl: string;
  startAt: string;
  endAt: string;
  location: string;
  deadline: string;
  registrationOpen: boolean;
  serverNow: string;
}
export interface ManagedSalonEvent extends Omit<
  SalonEvent,
  "registrationOpen" | "serverNow"
> {
  capacity: number;
  published: boolean;
  registrationClosed: boolean;
}
export interface SalonRecord extends AcademicInfo {
  eventId: number;
  email: string;
  status: "registered" | "waitlisted" | "cancelled";
  submittedAt: string;
  checkedInAt: string | null;
  title: string;
  startAt: string;
}
export interface SalonRoster {
  items: SalonRecord[];
  registered: number;
  waitlisted: number;
  checkedIn: number;
}
const root = "/api/ai-salon";
const admin = "/api/admin/ai-salon/events";
export const salonClient = {
  list: () => apiRequest<SalonEvent[]>(`${root}/events`),
  event: (id: string | number) =>
    apiRequest<SalonEvent>(`${root}/events/${id}`),
  mine: () => apiRequest<SalonRecord[]>(`${root}/registrations`),
  register: (id: number) =>
    apiRequest<SalonRecord>(`${root}/events/${id}/registration`, {
      method: "POST",
    }),
  cancel: (id: number) =>
    apiRequest<void>(`${root}/events/${id}/registration`, { method: "DELETE" }),
  checkIn: (id: number) =>
    apiRequest<void>(`${root}/events/${id}/check-in`, { method: "POST" }),
  adminList: () => apiRequest<ManagedSalonEvent[]>(admin),
  uploadPoster: (file: File) => {
    const body = new FormData();
    body.append("poster", file);
    return apiRequest<{ posterUrl: string }>("/api/admin/ai-salon/posters", {
      method: "POST",
      body,
    });
  },
  saveEvent: (event: Partial<ManagedSalonEvent>) =>
    apiRequest<ManagedSalonEvent>(event.id ? `${admin}/${event.id}` : admin, {
      method: event.id ? "PUT" : "POST",
      body: event,
    }),
  deleteEvent: (id: number) =>
    apiRequest<void>(`${admin}/${id}`, { method: "DELETE" }),
  roster: (id: number) => apiRequest<SalonRoster>(`${admin}/${id}/roster`),
};
export const salonStatus = {
  registered: "已报名",
  waitlisted: "候补中",
  cancelled: "已取消",
};
export function salonDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export function salonError(cause: unknown) {
  return cause instanceof Error ? cause.message : "操作失败，请重试";
}
