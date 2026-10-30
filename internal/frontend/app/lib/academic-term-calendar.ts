type AcademicTerm = {
  firstWeekStart: string;
  teachingWeekCount: number;
};

const FALL_2026: AcademicTerm = {
  firstWeekStart: "2026-09-07",
  teachingWeekCount: 19,
};

// Source: Jilin University 2026–2027 academic calendar, published by the Undergraduate School.
// The calendar labels the week starting Sep 7 as week 1 and begins winter break on Jan 18.
const ACADEMIC_TERMS: Readonly<Record<string, AcademicTerm>> = {
  "2026-2027学年第1学期": FALL_2026,
  "2026-2027学年第一学期": FALL_2026,
};

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

export function resolveTeachingWeekForDate(semester: string, date: string): TeachingWeekResolution {
  const term = ACADEMIC_TERMS[semester.trim()];
  const today = dateOrdinal(date);
  if (!term || today === null) return { week: null, status: "unconfigured" };

  const firstWeekStart = dateOrdinal(term.firstWeekStart);
  if (firstWeekStart === null) return { week: null, status: "unconfigured" };
  const lastWeekEnd = firstWeekStart + term.teachingWeekCount * 7 - 1;
  const base = {
    firstWeekStart: term.firstWeekStart,
    lastWeekEnd: dateFromOrdinal(lastWeekEnd),
    teachingWeekCount: term.teachingWeekCount,
  };

  if (today < firstWeekStart) return { ...base, week: 1, status: "before" };
  const week = Math.floor((today - firstWeekStart) / 7) + 1;
  if (week > term.teachingWeekCount) {
    return { ...base, week: term.teachingWeekCount, status: "after" };
  }
  return { ...base, week, status: "current" };
}

export function resolveCurrentTeachingWeek(semester: string, now: Date = new Date()) {
  return resolveTeachingWeekForDate(semester, getBeijingDate(now));
}
