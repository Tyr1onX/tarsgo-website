import type { RecruitmentPageRegistrationSummary } from "./registration-forms-client";
import type { InterviewAttendanceResult } from "./registrations-client";

export type RecruitmentProgressStepState =
  | "complete"
  | "current"
  | "upcoming"
  | "skipped"
  | "rejected"
  | "withdrawn"
  | "admitted"
  | "result";

type RecruitmentProgressStep = {
  label: string;
  state: RecruitmentProgressStepState;
  status: string;
};

const labels = ["报名完成", "初筛", "面试确认", "等待线下面试", "最终结果"];

export function getRecruitmentProgress(
  summary: RecruitmentPageRegistrationSummary,
  attendance: InterviewAttendanceResult | null,
  attendanceLoading: boolean,
) {
  let currentStage = "等待初筛";
  let nextAction = "请等待管理员审核报名资料。";
  let isTerminal = false;
  let activeStepIndex = 1;
  let states: RecruitmentProgressStepState[] = [
    "complete",
    "current",
    "upcoming",
    "upcoming",
    "upcoming",
  ];
  let statuses = ["已完成", "等待初筛", "待开始", "待开始", "待开始"];

  if (summary.status === "withdrawn") {
    currentStage = "已撤回";
    nextAction = "本次报名已撤回，流程已结束。";
    isTerminal = true;
    states = ["complete", "withdrawn", "skipped", "skipped", "skipped"];
    statuses = ["已完成", "已撤回", "未进入", "未进入", "未进入"];
  } else if (summary.status === "pending_interview") {
    currentStage = "确认面试安排";
    activeStepIndex = 2;
    states = ["complete", "complete", "current", "upcoming", "upcoming"];
    statuses = ["已完成", "已通过", "待确认", "待开始", "待开始"];

    if (attendanceLoading) {
      nextAction = "正在获取可选的线下面试时段。";
    } else if (!attendance) {
      nextAction = "暂时无法读取面试安排，请稍后刷新页面。";
    } else if (attendance.attendance === "attending") {
      activeStepIndex = 3;
      currentStage = "等待线下面试";
      states[2] = "complete";
      states[3] = "current";
      statuses[2] = "已确认";
      statuses[3] = "等待面试";
      nextAction = attendance.session
        ? `请于 ${attendance.session.date} ${attendance.session.startTime}–${attendance.session.endTime} 前往 ${attendance.session.location} 参加面试。`
        : "你已确认参加，请留意已确认的面试安排。";
    } else if (attendance.attendance === "not_attending") {
      currentStage = "暂不参加面试";
      statuses[2] = "暂不参加面试";
      nextAction = "当前选择已记录；如需参加，可修改为参加并选择场次。";
    } else if (attendance.availableSessions.length > 0) {
      nextAction = "请选择是否参加，并在参加时确认一个面试时段。";
    } else {
      nextAction = "请等待管理员开放可选的面试时段。";
    }
  } else if (summary.status === "admitted") {
    currentStage = "已录取";
    nextAction = "招新流程已完成。";
    isTerminal = true;
    activeStepIndex = 4;
    states = ["complete", "complete", "complete", "complete", "admitted"];
    statuses = ["已完成", "已通过", "已确认", "已完成", "已录取"];
  } else if (summary.status === "rejected") {
    const rejectedDuringScreening = summary.rejectedStage === "screening";
    currentStage = rejectedDuringScreening ? "初筛未通过" : "面试未通过";
    nextAction = "本次招新流程已结束。";
    isTerminal = true;
    activeStepIndex = rejectedDuringScreening ? 1 : 3;
    states = rejectedDuringScreening
      ? ["complete", "rejected", "skipped", "skipped", "result"]
      : ["complete", "complete", "complete", "rejected", "result"];
    statuses = rejectedDuringScreening
      ? ["已完成", "初筛未通过", "未进入", "未进入", "初筛未通过"]
      : ["已完成", "已通过", "已确认", "面试未通过", "面试未通过"];
  }

  const steps: RecruitmentProgressStep[] = labels.map((label, index) => ({
    label,
    state: states[index],
    status: statuses[index],
  }));

  return { currentStage, nextAction, isTerminal, activeStepIndex, steps };
}
