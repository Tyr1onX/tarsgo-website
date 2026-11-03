import assert from "node:assert/strict";
import test from "node:test";
import { salonEventStatus } from "./salon-event-status.ts";

const event = { registrationOpen: true, deadline: "2026-11-10T01:00:00Z", startAt: "2026-11-10T02:00:00Z", endAt: "2026-11-10T04:00:00Z" };
test("salon public status respects server time and deadline boundaries", () => {
  const status = (time, override = {}) => salonEventStatus({ ...event, ...override }, Date.parse(time));
  assert.equal(status("2026-11-10T00:00:00Z"), "报名开放中");
  assert.equal(status("2026-11-10T00:00:00Z", { registrationOpen: false }), "报名已关闭");
  assert.equal(status(event.deadline), "报名已截止");
  assert.equal(status(event.startAt, { registrationOpen: false }), "活动进行中");
  assert.equal(status(event.endAt), "活动已结束");
});
