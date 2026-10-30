export type TeachingWeekStatus = "before" | "current" | "after" | "unconfigured";

export interface TeachingWeekResolution {
  week: number | null;
  status: TeachingWeekStatus;
  firstWeekStart?: string;
  lastWeekEnd?: string;
  teachingWeekCount?: number;
}

function dateOrdinal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86_400_000);
}

function dateFromOrdinal(ordinal: number) {
  return new Date(ordinal * 86_400_000).toISOString().slice(0, 10);
}

export function getBeijingDate(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function resolveTeachingWeekForDate(firstWeekStartDate: string, date: string, teachingWeekCount: number): TeachingWeekResolution {
  const today = dateOrdinal(date);
  const firstWeekStart = dateOrdinal(firstWeekStartDate);
  if (today === null || firstWeekStart === null || !Number.isInteger(teachingWeekCount) || teachingWeekCount < 1) {
    return { week: null, status: "unconfigured" };
  }
  const lastWeekEnd = firstWeekStart + teachingWeekCount * 7 - 1;
  const base = {
    firstWeekStart: firstWeekStartDate,
    lastWeekEnd: dateFromOrdinal(lastWeekEnd),
    teachingWeekCount,
  };

  if (today < firstWeekStart) return { ...base, week: 1, status: "before" };
  const week = Math.floor((today - firstWeekStart) / 7) + 1;
  if (week > teachingWeekCount) {
    return { ...base, week: teachingWeekCount, status: "after" };
  }
  return { ...base, week, status: "current" };
}

export function resolveCurrentTeachingWeek(firstWeekStartDate: string, now: Date = new Date(), teachingWeekCount = 19) {
  return resolveTeachingWeekForDate(firstWeekStartDate, getBeijingDate(now), teachingWeekCount);
}
