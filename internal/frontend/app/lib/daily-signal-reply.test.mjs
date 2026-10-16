import assert from "node:assert/strict";
import test from "node:test";

import { getDailySignalReply } from "./daily-signal-reply.ts";

const date = "2026-10-16";
const nextDate = "2026-10-17";
const neutralReplies = [
  "谢谢你把一小段时光，寄到这里。",
  "信号收到。按自己的节奏走，也很好。",
  "收到啦。愿这条记录替你轻轻收好这一程。",
  "基地收到啦，值班台不催进度，只负责认真收信。",
];

test("the same account, authoritative date and current mood always yield the same reply", () => {
  const first = getDailySignalReply(1001, date, "正在调试");
  const revisit = getDailySignalReply(1001, date, "正在调试");

  assert.equal(revisit, first);
});

test("account identity participates in deterministic selection", () => {
  const replies = new Set(Array.from({ length: 32 }, (_, index) =>
    getDailySignalReply(1000 + index, date, null),
  ));

  assert.ok(replies.size > 1);
  assert.equal(getDailySignalReply(1007, date, null), getDailySignalReply(1007, date, null));
});

test("mood updates select the current mood and clearing it removes mood-specific copy", () => {
  const tiredReply = getDailySignalReply(41, date, "有点疲惫");
  const neutralReply = getDailySignalReply(41, date, null);

  assert.ok(["收到啦。可以给自己留一点余地。", "基地收到啦，慢一点也完全可以。"].includes(tiredReply));
  assert.ok(neutralReplies.includes(neutralReply));
  assert.notEqual(neutralReply, tiredReply);
  assert.doesNotMatch(neutralReply, /疲惫|余地/);
});

test("an invalid mood safely falls back to the neutral group", () => {
  const reply = getDailySignalReply(41, date, "不受支持的状态");

  assert.ok(neutralReplies.includes(reply));
  assert.doesNotMatch(reply, /疲惫|负载|调试/);
});

test("humor is occasional and never used for the tired mood", () => {
  const replies = Array.from({ length: 200 }, (_, index) =>
    getDailySignalReply(`fictional-user-${index}`, `2026-10-${String((index % 28) + 1).padStart(2, "0")}`, null),
  );
  const humorCount = replies.filter((reply) => /机器人|值班台/.test(reply)).length;

  assert.ok(humorCount > 0);
  assert.ok(humorCount < replies.length / 4);
  assert.ok(!/机器人|值班台|返工/.test(getDailySignalReply(41, date, "有点疲惫")));
});

test("the same mood receives a different stable sentence on the next Beijing day", () => {
  const moods = [null, "状态不错", "稳定运行", "有点疲惫", "高负载中", "正在调试"];
  for (const mood of moods) {
    const current = getDailySignalReply(41, date, mood);
    const next = getDailySignalReply(41, nextDate, mood);

    assert.notEqual(next, current, `expected ${mood ?? "neutral"} reply to rotate by day`);
    assert.equal(next, getDailySignalReply(41, nextDate, mood));
  }
});

test("history uses the supplied date and malformed input never exposes mood copy", () => {
  const firstHistoricalDate = getDailySignalReply(41, "2026-10-15", "正在调试");
  const revisit = getDailySignalReply(41, "2026-10-15", "正在调试");
  const invalidDate = getDailySignalReply(41, "not-a-date", "有点疲惫");
  const missingAccount = getDailySignalReply(null, date, "有点疲惫");

  assert.equal(firstHistoricalDate, revisit);
  assert.equal(invalidDate, "信号已收到。谢谢你愿意把这一程留在这里。");
  assert.equal(missingAccount, "信号已收到。谢谢你愿意把这一程留在这里。");
  assert.doesNotMatch(invalidDate, /疲惫|余地/);
});
