export type SignalDayStatus = "outside" | "future" | "sent" | "today" | "quiet";

export interface SignalCalendarDay {
  date: string;
  weekday: number;
  inYear: boolean;
}

export function getSignalYearWeeks(year: number): SignalCalendarDay[][] {
  const first = new Date(Date.UTC(year, 0, 1));
  const cursor = new Date(first);
  cursor.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const last = new Date(Date.UTC(year, 11, 31));
  const weeks: SignalCalendarDay[][] = [];

  while (cursor <= last || cursor.getUTCDay() !== 0) {
    const week: SignalCalendarDay[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = toDateKey(cursor);
      week.push({ date, weekday: cursor.getUTCDay(), inYear: cursor.getUTCFullYear() === year });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
    if (cursor > last && cursor.getUTCDay() === 0) break;
  }

  return weeks;
}

export function getSignalCellStatus(
  day: SignalCalendarDay,
  today: string,
  sentDates: ReadonlySet<string>,
): SignalDayStatus {
  if (!day.inYear) return "outside";
  if (day.date > today) return "future";
  if (sentDates.has(day.date)) return "sent";
  if (day.date === today) return "today";
  return "quiet";
}

export function addSignalDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return toDateKey(value);
}

export function getCurrentBeijingDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getMillisecondsUntilBeijingMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  const elapsedSeconds = values.hour * 3600 + values.minute * 60 + values.second;
  return Math.max(1000, (86400 - elapsedSeconds) * 1000 + 100);
}

export function formatSignalDate(date: string, options: Intl.DateTimeFormatOptions = {}): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "long",
    ...options,
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function getMonthMarkers(weeks: SignalCalendarDay[][], year: number): Array<{ label: string; week: number }> {
  const output: Array<{ label: string; week: number }> = [];
  for (let month = 0; month < 12; month += 1) {
    const firstOfMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const index = weeks.findIndex((week) => week.some((day) => day.date === firstOfMonth));
    if (index < 0) continue;
    output.push({
      label: new Intl.DateTimeFormat("zh-CN", { month: "short", timeZone: "UTC" })
        .format(new Date(Date.UTC(year, month, 1))
        ).replace("月", ""),
      week: index,
    });
  }

  return output;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}
