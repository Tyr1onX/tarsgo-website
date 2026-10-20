import assert from "node:assert/strict";
import test from "node:test";

import { buildExpeditionChallenges, getAcceptedExpeditionMilestones, getExpeditionEvolution, getPrimaryFacilityId, getPublicFacilityFAQs } from "./expedition-data.ts";

test("基地按成员当前组别定位对应设施", () => {
  assert.equal(getPrimaryFacilityId(["运营组"]), "operations");
  assert.equal(getPrimaryFacilityId(["视觉组", "运营组"]), "vision");
  assert.equal(getPrimaryFacilityId([]), "hangar");
});

test("挑战列表只来自待处理作业、可挑战技能和本人未解决问题", () => {
  const tasks = buildExpeditionChallenges({
    assignments: [
      { id: 1, title: "需重做", groupName: "机械组", status: "needs_redo" },
      { id: 2, title: "逾期", groupName: "机械组", status: "overdue" },
      { id: 3, title: "待提交", groupName: "机械组", status: "pending" },
      { id: 4, title: "已通过", groupName: "机械组", status: "passed" },
      { id: 5, title: "已提交", groupName: "机械组", status: "submitted" },
    ],
    skillGroups: [{ id: 40, name: "机械组", nodes: [
      { id: 10, name: "可挑战技能", state: "available" },
      { id: 11, name: "已实践技能", state: "practiced" },
      { id: 12, name: "已掌握技能", state: "mastered" },
      { id: 13, name: "未解锁技能", state: "locked" },
    ] }],
    questions: [
      { id: 20, groupId: 40, groupName: "机械组", title: "我的问题", isSolved: false },
      { id: 21, groupId: 40, groupName: "机械组", title: "已解决的问题", isSolved: true },
    ],
    profile: null,
    groupNames: ["机械组"],
  });

  assert.deepEqual(tasks.map(({ title }) => title), ["需重做", "逾期", "待提交", "已实践技能", "可挑战技能", "我的问题"]);
  assert.equal(new Set(tasks.map(({ key }) => key)).size, tasks.length);
  assert.equal(tasks.find(({ title }) => title === "我的问题")?.href, "/dashboard/questions?groupId=40&questionId=20");
});

test("运营组只看到本人已有周报入口，不生成技术训练事项", () => {
  const tasks = buildExpeditionChallenges({
    assignments: [],
    skillGroups: [],
    questions: [],
    profile: {
      nextAction: { title: "查看本周工作周报", href: "/dashboard/weekly-reports" },
    },
    groupNames: ["运营组"],
  });

  assert.deepEqual(tasks.map(({ kind, href }) => ({ kind, href })), [
    { kind: "weekly-report", href: "/dashboard/weekly-reports" },
  ]);
});

test("基地知识动态只展示本人所属组的已解决公开 FAQ", () => {
  const questions = [
    { id: 1, groupName: "视觉组", visibility: "public", isSolved: true, isFaq: true, createdAt: "2026-01-01T00:00:00Z" },
    { id: 2, groupName: "视觉组", visibility: "private", isSolved: true, isFaq: true, createdAt: "2026-01-02T00:00:00Z" },
    { id: 3, groupName: "视觉组", visibility: "public", isSolved: false, isFaq: true, createdAt: "2026-01-03T00:00:00Z" },
    { id: 4, groupName: "机械组", visibility: "public", isSolved: true, isFaq: true, createdAt: "2026-01-04T00:00:00Z" },
  ];

  assert.deepEqual(getPublicFacilityFAQs(questions, "视觉组").map(({ id }) => id), [1]);
  assert.deepEqual(getPublicFacilityFAQs(questions, "运营组"), []);
  assert.deepEqual(getPublicFacilityFAQs(questions, null), []);
});

test("基地设施演化与赛季编年史只读取可见项目中的已验收阶段", () => {
  const projects = [
    {
      id: 1,
      title: "跨组整机联调",
      acceptedGroupNames: ["电控组", "机械组"],
      hasAcceptedJoint: false,
      milestones: [
        { id: 1, name: "底盘验收", groupName: "机械组", state: "accepted", acceptedAt: "2026-10-02T00:00:00Z" },
        { id: 2, name: "控制验收", groupName: "电控组", state: "accepted", acceptedAt: "2026-10-03T00:00:00Z" },
        { id: 3, name: "整机聯調", state: "submitted" },
      ],
    },
    {
      id: 2,
      title: "撤销中的验收",
      acceptedGroupNames: [],
      hasAcceptedJoint: false,
      milestones: [{ id: 4, name: "视觉验收", groupName: "视觉组", state: "submitted", acceptedAt: "2026-10-04T00:00:00Z" }],
    },
    {
      id: 3,
      title: "联合验收完成",
      acceptedGroupNames: ["机械组"],
      hasAcceptedJoint: true,
      milestones: [{ id: 5, name: "联合验收", state: "accepted", acceptedAt: "2026-10-05T00:00:00Z" }],
    },
  ];

  assert.deepEqual(getExpeditionEvolution(projects), { acceptedGroupNames: ["电控组", "机械组"], hasAcceptedJoint: true });
  assert.deepEqual(getAcceptedExpeditionMilestones(projects).map(({ project, milestone }) => `${project.id}:${milestone.id}`), ["3:5", "1:2", "1:1"]);
});
