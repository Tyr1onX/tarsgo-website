export const lowAltitudeCourseTerms = [
  {
    semester: "第一学期",
    focus: "认识无人机，理解飞行控制基础",
    description:
      "以基础认知和原理学习为主，理论学习以线上为主，并结合教学安排接触设备、了解基础装调。",
    courses: [
      {
        step: "01",
        title: "《无人机导论》",
        description:
          "认识无人机的基本结构、组成和常见用途，建立对无人机系统的基础认识。",
        outcome: "了解无人机由什么组成、能做什么",
      },
      {
        step: "02",
        title: "《飞行控制及原理》",
        description:
          "了解无人机飞行控制的基本原理，以及控制方法如何帮助飞行器保持稳定。",
        outcome: "理解飞行控制的基础知识",
      },
    ],
  },
  {
    semester: "第二学期",
    focus: "学习操控方法，了解实际应用",
    description:
      "以操控和应用为主；模拟与飞行训练时间结合学生课表、设备、场地和安全条件协调。",
    courses: [
      {
        step: "03",
        title: "《无人机飞行操控实务》",
        description:
          "学习基础操控方法和安全规范，教学内容包括模拟器操控训练；具体训练安排以学校通知为准。",
        outcome: "了解操控流程与安全要求",
      },
      {
        step: "04",
        title: "《无人机应用实践》",
        description:
          "了解无人机如何服务具体任务，并结合课程安排与实际资源探索应用实践。",
        outcome: "认识应用场景，探索实践方向",
      },
    ],
  },
] as const;

type LowAltitudeCourse = {
  step: string;
  title: string;
  description: string;
  outcome: string;
};

export const lowAltitudeCourses = lowAltitudeCourseTerms.reduce<LowAltitudeCourse[]>(
  (courses, term) => courses.concat(term.courses),
  [],
);

export const lowAltitudePractices = [
  {
    title: "无人机组装与调试",
    description:
      "了解基础组件，并按照教学安排参与组装、调试和设备检查。具体设备与参与方式以学校通知为准。",
  },
  {
    title: "模拟器操控与安全规范",
    description:
      "通过模拟器熟悉操控流程，认识飞行前检查和安全要求。",
  },
  {
    title: "符合条件的飞行训练",
    description:
      "具备合适设备、场地和安全条件时，安排相应的户外飞行训练；具体时间与形式以学校通知为准。",
  },
  {
    title: "应用实践与项目探索",
    description:
      "围绕无人机应用认识任务场景，并结合课程安排和实际资源探索实践项目；不承诺固定项目或竞赛成果。",
  },
] as const;

export const lowAltitudeFaqs = [
  {
    question: "没有无人机或编程基础，可以学习吗？",
    answer:
      "课程从无人机基本结构、飞行原理和安全规范开始，按基础知识到操控应用逐步学习。具体先修要求以学校正式通知为准。",
  },
  {
    question: "一年里四门课程怎么安排？",
    answer:
      "第一学期是《无人机导论》和《飞行控制及原理》；第二学期是《无人机飞行操控实务》和《无人机应用实践》。具体课次以学校教学安排为准。",
  },
  {
    question: "课程和实践时间怎么安排？",
    answer:
      "理论学习以线上为主。组装、模拟操控和其他实践会结合学生课表、可用时间及教学资源协调，不承诺固定在某个假期或月份。",
  },
  {
    question: "会安排真实飞行吗？",
    answer:
      "教学内容包括模拟器操控；只有具备合适设备、场地和安全条件时，才安排户外飞行训练。具体时间、分组和训练形式以学校通知为准，不承诺个人飞行次数或独立飞行。",
  },
  {
    question: "会参加项目或竞赛吗？",
    answer:
      "课程可以帮助同学了解应用项目和竞赛方向。是否开展具体项目、如何组队以及能否参赛，要看课程安排和实际条件，不保证项目名额、立项或获奖。",
  },
  {
    question: "这个页面会办理报名或收集个人资料吗？",
    answer:
      "不会。本页面仅介绍微专业，不提供报名、登录、注册或招生管理功能，也不收集个人资料。",
  },
] as const;
