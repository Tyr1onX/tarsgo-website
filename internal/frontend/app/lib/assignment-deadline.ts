const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export const assignmentDeadlineShortcuts = [
  { id: "today", label: "今天 23:59", days: 0 },
  { id: "tomorrow", label: "明天 23:59", days: 1 },
  { id: "three-days", label: "3 天后 23:59", days: 3 },
  { id: "seven-days", label: "7 天后 23:59", days: 7 },
] as const;

export type AssignmentDeadlineShortcut = typeof assignmentDeadlineShortcuts[number]["id"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatShanghaiParts(timestamp: number) {
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function shanghaiDateTimeLocal(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? formatShanghaiParts(timestamp) : "";
}

export function assignmentDeadlineForShortcut(now: Date, days: number) {
  const shanghaiToday = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const deadline = Date.UTC(
    shanghaiToday.getUTCFullYear(),
    shanghaiToday.getUTCMonth(),
    shanghaiToday.getUTCDate() + days,
    23,
    59,
  );
  return formatShanghaiParts(deadline - SHANGHAI_OFFSET_MS);
}

export function shanghaiDateTimeLocalToTimestamp(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const parsed = new Date(wallClock);
  if (
    parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day
    || parsed.getUTCHours() !== hour || parsed.getUTCMinutes() !== minute
  ) return null;
  return wallClock - SHANGHAI_OFFSET_MS;
}

export function assignmentDeadlineIsFuture(value: string, now: Date) {
  const timestamp = shanghaiDateTimeLocalToTimestamp(value);
  return timestamp !== null && timestamp > now.getTime();
}

export function assignmentDeadlineToISOString(value: string) {
  const timestamp = shanghaiDateTimeLocalToTimestamp(value);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

