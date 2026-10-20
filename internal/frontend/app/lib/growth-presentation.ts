export function formatGrowthDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function growthEventLabel(kind: string) {
  switch (kind) {
    case "membership": return "身份节点";
    case "assignment_first_submission": return "训练提交";
    case "assignment_resubmission": return "再次挑战";
    case "assignment_review_needs_redo": return "复盘反馈";
    case "assignment_review_passed": return "挑战通过";
    case "question_asked": return "技术探索";
    case "discussion_participation": return "讨论参与";
    case "question_solved": return "问题解决";
    case "faq_contribution": return "知识沉淀";
    case "weekly_report": return "运营记录";
    default: return "成长记录";
  }
}

export function growthEventTone(kind: string) {
  if (kind === "assignment_review_passed" || kind === "question_solved" || kind === "faq_contribution") return "bright";
  if (kind === "assignment_review_needs_redo") return "warm";
  if (kind === "membership") return "origin";
  return "steady";
}
