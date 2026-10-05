import type { InterviewSession } from "~/lib/registrations-client";

function getShanghaiClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

export function getUpcomingInterviewSessions(sessions: InterviewSession[], now = new Date()) {
  const clock = getShanghaiClock(now);
  const todayUTC = Date.parse(`${clock.date}T00:00:00Z`);
  return sessions
    .filter((session) => {
      if (!session.enabled || session.date < clock.date) return false;
      const dayDistance = (Date.parse(`${session.date}T00:00:00Z`) - todayUTC) / 86_400_000;
      if (dayDistance > 14) return false;
      return session.date !== clock.date || session.endTime >= clock.time;
    })
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
}
