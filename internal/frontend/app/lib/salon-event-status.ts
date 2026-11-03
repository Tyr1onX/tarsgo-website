import type { SalonEvent } from "./ai-salon-client";

// Public data intentionally contains no capacity or roster; never infer that an event is full.
export function salonEventStatus(event: SalonEvent, now: number) {
  if (now >= Date.parse(event.endAt)) return "活动已结束";
  if (now >= Date.parse(event.startAt)) return "活动进行中";
  if (now >= Date.parse(event.deadline)) return "报名已截止";
  return event.registrationOpen ? "报名开放中" : "报名已关闭";
}
