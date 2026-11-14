export const lowAltitudeCourseTerms = [
  {
    semester: "第一学期",
    focus: "先认识结构，再理解飞行控制",
    courses: [
      {
        step: "01",
        title: "《无人机导论》",
        description: "认识无人机的主要结构、组成和常见用途。",
        outcome: "学习重点：了解无人机由什么组成、能做什么",
      },
      {
        step: "02",
        title: "《飞行控制及原理》",
        description: "了解飞行控制的基本原理，以及无人机如何保持稳定。",
        outcome: "学习重点：理解飞行控制的基础知识",
      },
    ],
  },
  {
    semester: "第二学期",
    focus: "学习操控，探索实际应用",
    courses: [
      {
        step: "03",
        title: "《无人机飞行操控实务》",
        description: "学习模拟器操控方法、基本流程和安全规范。",
        outcome: "学习重点：了解操控流程与安全要求",
      },
      {
        step: "04",
        title: "《无人机应用实践》",
        description: "认识无人机如何服务具体任务，并探索应用方向。",
        outcome: "学习重点：认识应用场景和实践方向",
      },
    ],
  },
] as const;

export const lowAltitudeLearningModes = [
  {
    title: "线上学习基础理论",
    description: "理论学习以线上为主，围绕无人机结构、飞行原理和控制方法展开。",
  },
  {
    title: "线下接触设备",
    description: "结合教学安排开展设备认识、基础组装、调试和检查等实践。",
  },
  {
    title: "模拟操控与安全",
    description: "学习模拟器操控和安全规范。户外飞行需具备适当的设备、场地及安全条件。",
  },
] as const;

export const lowAltitudeFaqs = [
  {
    question: "没有无人机或编程基础，可以学吗？",
    answer: "课程从无人机结构、飞行原理等基础内容开始，逐步进入操控与应用。具体招生条件和先修要求以学校正式通知为准。",
  },
  {
    question: "可以亲自飞无人机吗？",
    answer: "教学包含模拟器操控。户外飞行只有在设备、场地和安全条件满足时才安排，具体训练方式和个人参与情况以教学通知为准。",
  },
  {
    question: "有项目或竞赛机会吗？",
    answer: "课程会介绍无人机应用方向。具体项目、组队和竞赛安排取决于课程和实际资源，不保证项目名额或竞赛成果。",
  },
  {
    question: "怎么报名？学分、证书如何认定？",
    answer: "招生对象、名额、报名方式，以及学时、学分、考核和证书等事项均以学校正式通知为准。本页只介绍微专业，不提供报名或账号注册功能。",
  },
] as const;
