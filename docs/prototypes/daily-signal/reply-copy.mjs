export const MOCK_TODAY = "2026-10-16";

export const FALLBACK_REPLY = Object.freeze({
  id: "fallback-thanks",
  tone: "感谢",
  text: "信号已收到。谢谢你愿意把今天留在这里。",
});

export const REPLY_LIBRARY = Object.freeze([
  { id: "thanks-note", tone: "感谢", text: "谢谢你把今天的一小段，寄到这里。" },
  { id: "thanks-rhythm", tone: "日常", text: "信号收到。今天按自己的节奏走，也很好。" },
  { id: "thanks-kept", tone: "感谢", text: "收到啦。愿这条记录替你轻轻收好今天。" },
  { id: "good-bright", tone: "状态不错", text: "收到这份好状态啦。愿它陪你走过今天。" },
  { id: "steady-thanks", tone: "稳定运行", text: "稳定运行，基地已为今天留档。谢谢你来。" },
  { id: "tired-soft", tone: "有点疲惫", text: "收到啦。今天可以给自己留一点余地。" },
  { id: "load-buffer", tone: "高负载中", text: "信号收到。任务队列很长，也请给自己留一点缓冲。" },
  { id: "debug-progress", tone: "正在调试", text: "调试中的每一步，也值得被记下来。愿下一次编译顺利。" },
  { id: "robot-arrival", tone: "机器人轻梗", text: "信号已到站，机器人今天不用返工。" },
  { id: "ops-queue", tone: "运营轻梗", text: "基地收到啦，值班台今天不催进度，只负责认真收信。" },
  { id: "compiler-joke", tone: "工程轻梗", text: "信号已收；这一帧无需返工。" },
]);

const REPLY_IDS_BY_MOOD = Object.freeze({
  none: ["thanks-note", "thanks-rhythm", "thanks-kept", "ops-queue"],
  "状态不错": ["good-bright", "robot-arrival"],
  "稳定运行": ["steady-thanks", "ops-queue"],
  "有点疲惫": ["tired-soft"],
  "高负载中": ["load-buffer", "ops-queue"],
  "正在调试": ["debug-progress", "compiler-joke"],
});

export function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getReplyById(id) {
  return REPLY_LIBRARY.find((reply) => reply.id === id) ?? FALLBACK_REPLY;
}

export function chooseReply(mood, date = MOCK_TODAY) {
  const group = Object.hasOwn(REPLY_IDS_BY_MOOD, mood ?? "none") ? mood ?? "none" : "none";
  const options = REPLY_IDS_BY_MOOD[group];
  return getReplyById(options[stableHash(`${date}:${group}`) % options.length]);
}

function isMood(value) {
  return typeof value === "string" && Object.hasOwn(REPLY_IDS_BY_MOOD, value);
}

function isReplyAllowedForMood(replyId, mood) {
  return (REPLY_IDS_BY_MOOD[mood ?? "none"] ?? REPLY_IDS_BY_MOOD.none).includes(replyId);
}

/**
 * Reject an outdated mood-specific reply after a mood update or deletion.
 * The returned id always belongs to the currently saved mood.
 */
export function normalizeDemoReceipt(receipt, expectedDate = MOCK_TODAY) {
  if (!receipt || receipt.date !== expectedDate) return null;
  const mood = isMood(receipt.mood) ? receipt.mood : null;
  const savedReply = REPLY_LIBRARY.find((reply) => reply.id === receipt.replyId);
  const reply = savedReply && isReplyAllowedForMood(savedReply.id, mood)
    ? savedReply
    : chooseReply(mood, expectedDate);
  return { date: expectedDate, mood, replyId: reply.id };
}
