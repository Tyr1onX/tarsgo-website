import assert from "node:assert/strict";
import test from "node:test";

import { getUpcomingInterviewSessions } from "./admin-workbench.ts";

test("workbench shows enabled sessions from today through the next 14 days in local schedule order", () => {
  const sessions = [
    { id: 1, date: "2026-10-05", label: "上午", startTime: "09:00", endTime: "10:00", enabled: true },
    { id: 2, date: "2026-10-05", label: "下午", startTime: "14:00", endTime: "16:00", enabled: true },
    { id: 3, date: "2026-10-04", label: "昨天", startTime: "09:00", endTime: "11:00", enabled: true },
    { id: 4, date: "2026-10-06", label: "停用", startTime: "09:00", endTime: "11:00", enabled: false },
    { id: 5, date: "2026-10-20", label: "超出近期", startTime: "09:00", endTime: "11:00", enabled: true },
  ];
  const visible = getUpcomingInterviewSessions(sessions, new Date("2026-10-05T04:00:00Z"));
  assert.deepEqual(visible.map(({ id }) => id), [2]);
});
