export type SalonSchedule = {
  startAt: string;
  endAt: string;
  deadline: string;
};
export type TimePart = "start" | "end" | "range";
const minute = 60_000;
const day = 1440 * minute;

// Wall-clock strings are always Beijing time, never the browser's local zone.
// Retain seconds/milliseconds when editing an existing event.
export function toBeijing(value: string) {
  return new Date(Date.parse(value) + 8 * 60 * minute)
    .toISOString()
    .slice(0, -1);
}
export function fromBeijing(value: string) {
  return new Date(`${value}+08:00`).toISOString();
}
export function beijingToday(now = new Date()) {
  return toBeijing(now.toISOString()).slice(0, 10);
}
export function addDays(date: string, count: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + count * day)
    .toISOString()
    .slice(0, 10);
}
export function shiftMonth(month: string, count: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 7);
}
export function monthDays(month: string) {
  const first = `${month}-01`;
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const count =
    new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`).getTime() -
    Date.parse(`${first}T00:00:00Z`);
  return Array.from({ length: offset + count / day }, (_, i) =>
    i < offset ? null : addDays(first, i - offset),
  );
}
export function defaultSalonSchedule(now = new Date()): SalonSchedule {
  // Once today's default start has passed, offer tomorrow's complete 90 minutes.
  const today = beijingToday(now);
  const date =
    fromBeijing(`${today}T14:00`) > now.toISOString()
      ? today
      : addDays(today, 1);
  return {
    startAt: `${date}T14:00`,
    endAt: `${date}T15:30`,
    deadline: `${date}T00:00`,
  };
}
export function selectScheduleDate(
  value: SalonSchedule,
  target: "event" | "deadline",
  date: string,
): SalonSchedule {
  if (target === "deadline") return { ...value, deadline: `${date}T00:00` };
  const delta =
    Date.parse(`${date}T00:00:00Z`) -
    Date.parse(`${value.startAt.slice(0, 10)}T00:00:00Z`);
  const startAt = date + value.startAt.slice(10);
  // Keep legacy cross-midnight durations until the user explicitly changes the time.
  const endAt = new Date(Date.parse(`${value.endAt}Z`) + delta)
    .toISOString()
    .slice(0, -1);
  return {
    startAt,
    endAt,
    deadline:
      Date.parse(fromBeijing(value.deadline)) > Date.parse(fromBeijing(startAt))
        ? `${date}T00:00`
        : value.deadline,
  };
}
export function timelineRange(value: SalonSchedule): [number, number] | null {
  const midnight = Date.parse(`${value.startAt.slice(0, 10)}T00:00:00Z`);
  const start = (Date.parse(`${value.startAt}Z`) - midnight) / minute;
  const end = (Date.parse(`${value.endAt}Z`) - midnight) / minute;
  return start >= 0 && end <= 1440 && end - start >= 30 ? [start, end] : null;
}
export function moveTimeline(
  start: number,
  end: number,
  part: TimePart,
  amount: number,
): [number, number] {
  const snap = (v: number) => Math.round(v / 30) * 30;
  if (part === "start")
    return [
      Math.max(0, Math.min(Math.floor((end - 30) / 30) * 30, snap(amount))),
      end,
    ];
  if (part === "end")
    return [
      start,
      Math.min(1440, Math.max(Math.ceil((start + 30) / 30) * 30, snap(amount))),
    ];
  const delta = Math.max(-start, Math.min(1440 - end, snap(amount)));
  return [start + delta, end + delta];
}
export function withTimeline(
  value: SalonSchedule,
  [start, end]: [number, number],
): SalonSchedule {
  const midnight = Date.parse(`${value.startAt.slice(0, 10)}T00:00:00Z`);
  const at = (n: number) =>
    new Date(midnight + n * minute).toISOString().slice(0, -1);
  const startAt = at(start);
  return {
    startAt,
    endAt: at(end),
    deadline:
      Date.parse(fromBeijing(value.deadline)) > Date.parse(fromBeijing(startAt))
        ? `${startAt.slice(0, 10)}T00:00`
        : value.deadline,
  };
}
export function clockTime(minutes: number) {
  const seconds = Math.round(minutes * 60);
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}${seconds % 60 ? `:${String(seconds % 60).padStart(2, "0")}` : ""}`;
}
export function scheduleError(value: SalonSchedule) {
  const [start, end, deadline] = [
    value.startAt,
    value.endAt,
    value.deadline,
  ].map((v) => Date.parse(`${v}+08:00`));
  if (![start, end, deadline].every(Number.isFinite))
    return "请选择有效的活动日期和时间";
  if (end <= start) return "结束时间须晚于开始时间";
  if (deadline > start) return "报名截止时间不能晚于开始时间";
  return "";
}
