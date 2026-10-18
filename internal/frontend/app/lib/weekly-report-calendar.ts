const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Invalid week start date");
  }
  return parsed;
}

export function isoWeekFromStart(weekStart: string): string {
  const monday = parseDateOnly(weekStart);
  if (monday.getUTCDay() !== 1) throw new RangeError("Week start must be a Monday");

  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const weekYear = thursday.getUTCFullYear();
  const januaryFourth = new Date(Date.UTC(weekYear, 0, 4));
  const firstMondayOffset = (januaryFourth.getUTCDay() + 6) % 7;
  const firstMonday = januaryFourth.getTime() - firstMondayOffset * DAY_MS;
  const weekNumber = Math.floor((monday.getTime() - firstMonday) / (7 * DAY_MS)) + 1;
  return `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
}

export function weekStartFromISOWeek(value: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Invalid ISO week");
  const year = Number(match[1]);
  const weekNumber = Number(match[2]);
  if (weekNumber < 1 || weekNumber > 53) throw new RangeError("Invalid ISO week");

  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const firstMondayOffset = (januaryFourth.getUTCDay() + 6) % 7;
  const firstMonday = januaryFourth.getTime() - firstMondayOffset * DAY_MS;
  const monday = new Date(firstMonday + (weekNumber - 1) * 7 * DAY_MS);
  const weekStart = monday.toISOString().slice(0, 10);
  if (isoWeekFromStart(weekStart) !== value) throw new RangeError("Invalid ISO week");
  return weekStart;
}

export function formatWeekLabel(weekStart: string): string {
  const monday = parseDateOnly(weekStart);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const week = isoWeekFromStart(weekStart);
  const [year, weekNumber] = week.split("-W");
  const formatDate = (date: Date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  return `${year}年第${Number(weekNumber)}周 · ${formatDate(monday)}–${formatDate(sunday)}`;
}
