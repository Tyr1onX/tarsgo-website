import type { RecruitmentPageRegistrationSummary } from "./registration-forms-client";
import type { InterviewAttendanceResult } from "./registrations-client";

type ProgressStepState = "complete" | "current" | "upcoming" | "skipped";

export function getRecruitmentProgress(
  summary: RecruitmentPageRegistrationSummary,
  attendance: InterviewAttendanceResult | null,
  attendanceLoading: boolean,
) {
  const labels = ["报名完成", "初筛", "面试确认", "等待线下面试", "最终结果"];
  let currentStep = 1;
  let currentStage = "等待初筛";
  let nextAction = "请等待管理员审核报名资料。";
  let isTerminal = false;
  const skippedSteps = new Set<number>();

  if (summary.status === "withdrawn") {
    currentStage = "已撤回";
    nextAction = "本次报名已撤回，流程已结束。";
    isTerminal = true;
    for (let index = 2; index < labels.length; index += 1) skippedSteps.add(index);
  } else if (summary.status === "pending_interview") {
    currentStep = 2;
    currentStage = "确认面试安排";
    if (attendanceLoading) {
      nextAction = "正在获取可选的线下面试时段。";
    } else if (!attendance) {
      nextAction = "暂时无法读取面试安排，请稍后刷新页面。";
    } else if (attendance.attendance === "attending") {
      currentStep = 3;
      currentStage = "等待线下面试";
      nextAction = attendance.session
        ? `请于 ${attendance.session.date} ${attendance.session.startTime}–${attendance.session.endTime} 前往 ${attendance.session.location} 参加面试。`
        : "你已确认参加，请留意已确认的面试安排。";
    } else if (attendance.attendance === "not_attending") {
      currentStage = "已暂不参加";
      nextAction = "当前选择已记录；如需参加，可修改为参加并选择场次。";
    } else if (attendance.availableSessions.length > 0) {
      nextAction = "请选择是否参加，并在参加时确认一个面试时段。";
    } else {
      nextAction = "请等待管理员开放可选的面试时段。";
    }
  } else if (summary.status === "admitted") {
    currentStep = 4;
    currentStage = "已录取";
    nextAction = "招新流程已完成。";
    isTerminal = true;
  } else if (summary.status === "rejected") {
    currentStep = 4;
    currentStage = summary.rejectedStage === "screening" ? "初筛未通过" : "面试未通过";
    nextAction = "本次招新流程已结束。";
    isTerminal = true;
    if (summary.rejectedStage === "screening") {
      skippedSteps.add(2);
      skippedSteps.add(3);
    }
  }

  const steps = labels.map((label, index) => {
    const stepLabel = summary.status === "withdrawn" && index === 1 ? "已撤回" : label;
    let state: ProgressStepState;
    if (skippedSteps.has(index)) {
      state = "skipped";
    } else if (index === 0 || index < currentStep) {
      state = "complete";
    } else if (index === currentStep) {
      state = "current";
    } else {
      state = "upcoming";
    }
    return { label: stepLabel, state };
  });

  return { currentStage, nextAction, isTerminal, steps };
}
