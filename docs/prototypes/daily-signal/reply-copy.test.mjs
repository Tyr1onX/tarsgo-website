import assert from "node:assert/strict";
import test from "node:test";

import {
  MOCK_TODAY,
  REPLY_LIBRARY,
  chooseReply,
  getReplyById,
  normalizeDemoReceipt,
} from "./reply-copy.mjs";

test("deleting today's mood replaces a mood-specific receipt with neutral copy", () => {
  const receipt = normalizeDemoReceipt({
    date: MOCK_TODAY,
    mood: null,
    replyId: "tired-soft",
  });
  const reply = getReplyById(receipt.replyId);

  assert.equal(receipt.mood, null);
  assert.equal(reply.tone === "有点疲惫", false);
  assert.equal(reply.text.includes("疲惫"), false);
  assert.equal(reply.text.includes("余地"), false);
});

test("changing today's mood rejects copy from the previous mood", () => {
  const receipt = normalizeDemoReceipt({
    date: MOCK_TODAY,
    mood: "状态不错",
    replyId: "tired-soft",
  });
  const reply = getReplyById(receipt.replyId);

  assert.equal(reply.tone === "有点疲惫", false);
  assert.ok(["状态不错", "机器人轻梗"].includes(reply.tone));
});

test("same-day revisit preserves a reply that matches the saved mood", () => {
  const original = chooseReply("正在调试");
  const receipt = normalizeDemoReceipt({
    date: MOCK_TODAY,
    mood: "正在调试",
    replyId: original.id,
  });

  assert.equal(receipt.replyId, original.id);
  assert.equal(getReplyById(receipt.replyId).text, original.text);
});

test("invalid dates are discarded and invalid moods become neutral", () => {
  assert.equal(normalizeDemoReceipt({ date: "2026-10-15", mood: null, replyId: "thanks-note" }), null);

  const receipt = normalizeDemoReceipt({
    date: MOCK_TODAY,
    mood: "未定义状态",
    replyId: "tired-soft",
  });

  assert.equal(receipt.mood, null);
  assert.ok(["thanks-note", "thanks-rhythm", "thanks-kept", "ops-queue"].includes(receipt.replyId));
  assert.equal(REPLY_LIBRARY.some((reply) => reply.id === receipt.replyId && reply.tone === "有点疲惫"), false);
});
