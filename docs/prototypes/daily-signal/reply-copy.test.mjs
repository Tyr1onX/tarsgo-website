import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_ACCOUNT_ID,
  MOCK_TODAY,
  REPLY_CATALOG_VERSION,
  REPLY_LIBRARY,
  chooseReply,
  getReplyById,
  normalizeDemoReceipt,
} from "./reply-copy.mjs";

test("the same account, Beijing date and mood produce the same sentence", () => {
  const first = chooseReply("正在调试", MOCK_TODAY, DEMO_ACCOUNT_ID);
  const revisit = chooseReply("正在调试", MOCK_TODAY, DEMO_ACCOUNT_ID);

  assert.equal(revisit.id, first.id);
  assert.equal(revisit.text, first.text);
});

test("copy selection is scoped by account and can differ between accounts", () => {
  const replies = new Set(Array.from({ length: 24 }, (_, index) =>
    chooseReply(null, MOCK_TODAY, `fictional-member-${index}`).id,
  ));

  assert.ok(replies.size > 1);
  assert.equal(chooseReply(null, MOCK_TODAY, "fictional-member-7").id,
    chooseReply(null, MOCK_TODAY, "fictional-member-7").id);
});

test("clearing a mood invalidates a private old-mood receipt and uses neutral copy", () => {
  const receipt = normalizeDemoReceipt({
    date: MOCK_TODAY,
    accountId: DEMO_ACCOUNT_ID,
    version: REPLY_CATALOG_VERSION,
    mood: null,
    replyId: "tired-soft",
  });
  const reply = getReplyById(receipt.replyId);

  assert.equal(receipt.mood, null);
  assert.equal(reply.tone === "有点疲惫", false);
  assert.equal(reply.text.includes("疲惫"), false);
  assert.equal(reply.text.includes("余地"), false);
});

test("a changed mood rejects copy from the previous mood", () => {
  const receipt = normalizeDemoReceipt({
    date: MOCK_TODAY,
    accountId: DEMO_ACCOUNT_ID,
    version: REPLY_CATALOG_VERSION,
    mood: "状态不错",
    replyId: "tired-soft",
  });

  assert.ok(["状态不错", "机器人轻梗"].includes(getReplyById(receipt.replyId).tone));
});

test("same-day prototype revisit preserves a matching current-version reply", () => {
  const original = chooseReply("正在调试", MOCK_TODAY, DEMO_ACCOUNT_ID);
  const receipt = normalizeDemoReceipt({
    date: MOCK_TODAY,
    accountId: DEMO_ACCOUNT_ID,
    version: REPLY_CATALOG_VERSION,
    mood: "正在调试",
    replyId: original.id,
  });

  assert.equal(receipt.replyId, original.id);
  assert.equal(getReplyById(receipt.replyId).text, original.text);
});

test("receipts from another account, date or copy version are not reused", () => {
  const base = {
    date: MOCK_TODAY,
    accountId: DEMO_ACCOUNT_ID,
    version: REPLY_CATALOG_VERSION,
    mood: null,
    replyId: "thanks-note",
  };

  assert.equal(normalizeDemoReceipt({ ...base, accountId: "fictional-member-else" }), null);
  assert.equal(normalizeDemoReceipt({ ...base, date: "2026-10-15" }), null);
  const upgraded = normalizeDemoReceipt({ ...base, version: "old-version" });
  assert.notEqual(upgraded.replyId, "tired-soft");
});

test("humor stays occasional and is absent from the tired mood response", () => {
  const replies = Array.from({ length: 200 }, (_, index) =>
    chooseReply(null, `2026-10-${String((index % 28) + 1).padStart(2, "0")}`, `fictional-member-${index}`),
  );
  const humorCount = replies.filter((reply) => reply.tone.includes("轻梗") || reply.tone.includes("工程轻梗")).length;

  assert.ok(humorCount > 0);
  assert.ok(humorCount < replies.length / 4);
  assert.equal(chooseReply("有点疲惫", MOCK_TODAY, DEMO_ACCOUNT_ID).tone, "有点疲惫");
  assert.ok(REPLY_LIBRARY.every((reply) => typeof reply.text === "string" && reply.text.length > 0));
});
