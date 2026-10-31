// Concise summaries of the supplied RoboMaster 2027 position descriptions.
const positionDuties: Record<string, string> = {
  captain: "负责战队组建与人员统筹，主导技术和战术方案制定、评审及风险决策，建设队伍文化，并作为战队与组委会的主要对接人。",
  "vice-captain-project": "与队长共同组成核心管理层，协助日常管理、分担决策，并按现有任命推进项目管理分工。",
  "vice-captain-training": "与队长共同组成核心管理层，协助日常管理、分担决策，并负责人员培养、校内赛和参观接待等现有分工。",
  "vice-captain-test-safety": "与队长共同组成核心管理层，协助日常管理、分担决策，并负责测试、安全卫生、战术和操作手等现有分工。",
  "project-management": "协助队长拆解任务并跟进进度，及时汇报分析、把控成本预算、协调各组协作，推动制度建设。",
  "operations-manager": "统筹宣传、文化、招新和交流活动，管理财务及流程，链接校内外资源争取支持，并做好后勤与差旅保障。",
  "reserve-captain": "逐步熟悉队伍管理流程，为接任队长积累经验；参与比赛现场关键流程和队伍管理，做好队伍传承。",
};

export function organizationPositionDuty(positionID: string, categoryID: string) {
  return positionDuties[positionID]
    ?? (categoryID === "technical"
      ? "管理本方向资源与人力，规划新队员培训和选拔，并从技术方向协调本组成员在各兵种项目中的分配。"
      : categoryID === "robot-classes"
        ? "负责所辖兵种或系统的底层架构与关键技术决策，统筹全车方案取舍和资源使用，并与各技术方向组长协同。"
        : "该职位的职责说明暂未整理。");
}
