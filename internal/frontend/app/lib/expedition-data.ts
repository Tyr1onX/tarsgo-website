import type { Assignment } from "~/lib/assignment-client";
import type { GrowthProfile } from "~/lib/growth-client";
import type { SkillGroupProgress } from "~/lib/skills-client";
import type { TrainingQuestion } from "~/lib/training-question-client";
import type { ExpeditionProject, ExpeditionProjectMilestone } from "~/lib/expedition-project-client";

export const EXPEDITION_GROUPS = ["机械组", "电控组", "视觉组", "AI组", "运营组"] as const;

export type ExpeditionFacilityId = "hangar" | "mechanical" | "controls" | "vision" | "ai" | "operations";
export type ExpeditionChallengeKind = "assignment" | "skill" | "question" | "weekly-report";
export type ExpeditionEvolutionTarget = NonNullable<ExpeditionProjectMilestone["evolutionTarget"]>;

const EVOLUTION_TARGETS: readonly ExpeditionEvolutionTarget[] = ["chassis", "control", "perception", "decision", "operations", "joint"];

export interface ExpeditionChallenge {
  key: string;
  kind: ExpeditionChallengeKind;
  title: string;
  detail: string;
  href: string;
  groupName?: string;
  status?: string;
  dueAt?: string;
  priority: number;
}

export function getExpeditionEvolution(project: ExpeditionProject | null | undefined) {
  const acceptedTargets = [...new Set((project?.milestones ?? [])
    .filter((milestone) => milestone.state === "accepted" && Boolean(milestone.acceptedAt))
    .map((milestone) => milestone.evolutionTarget)
    .filter((target): target is ExpeditionEvolutionTarget => Boolean(target && EVOLUTION_TARGETS.includes(target))))];
  return {
    acceptedTargets,
    hasAcceptedJoint: acceptedTargets.includes("joint"),
  };
}

export function getAcceptedExpeditionMilestones(projects: readonly ExpeditionProject[]) {
  return projects.flatMap((project) => project.milestones
    .filter((milestone) => milestone.state === "accepted" && Boolean(milestone.acceptedAt))
    .map((milestone) => ({ project, milestone })))
    .sort((left, right) => new Date(right.milestone.acceptedAt!).getTime() - new Date(left.milestone.acceptedAt!).getTime());
}

const FACILITY_BY_GROUP: Record<(typeof EXPEDITION_GROUPS)[number], ExpeditionFacilityId> = {
  "机械组": "mechanical",
  "电控组": "controls",
  "视觉组": "vision",
  "AI组": "ai",
  "运营组": "operations",
};

export function getPrimaryFacilityId(groupNames: readonly string[] | null | undefined): ExpeditionFacilityId {
  for (const groupName of groupNames ?? []) {
    if (groupName in FACILITY_BY_GROUP) return FACILITY_BY_GROUP[groupName as keyof typeof FACILITY_BY_GROUP];
  }
  return "hangar";
}

export function getPublicFacilityFAQs(questions: readonly TrainingQuestion[] | null | undefined, groupName: string | null): TrainingQuestion[] {
  if (!groupName) return [];
  return (questions ?? [])
    .filter((question) => question.groupName === groupName && question.visibility === "public" && question.isSolved && question.isFaq)
    .sort((left, right) => new Date(right.lastReplyAt ?? right.createdAt).getTime() - new Date(left.lastReplyAt ?? left.createdAt).getTime())
    .slice(0, 3);
}

function isDashboardHref(href: string) {
  return href.startsWith("/dashboard/") && !href.startsWith("//");
}

export function buildExpeditionChallenges(input: {
  assignments: readonly Assignment[];
  skillGroups: readonly SkillGroupProgress[];
  questions: readonly TrainingQuestion[];
  profile: GrowthProfile | null;
  groupNames: readonly string[];
}): ExpeditionChallenge[] {
  const tasks: ExpeditionChallenge[] = [];

  for (const assignment of input.assignments) {
    if (assignment.status !== "pending" && assignment.status !== "overdue" && assignment.status !== "needs_redo") continue;
    const priority = assignment.status === "needs_redo" ? 0 : assignment.status === "overdue" ? 1 : 2;
    tasks.push({
      key: `assignment:${assignment.id}`,
      kind: "assignment",
      title: assignment.title,
      detail: assignment.groupName,
      groupName: assignment.groupName,
      href: `/dashboard/assignments?assignmentId=${assignment.id}`,
      status: assignment.status,
      dueAt: assignment.dueAt,
      priority,
    });
  }

  for (const group of input.skillGroups) {
    for (const node of group.nodes) {
      if (node.state !== "available" && node.state !== "practiced") continue;
      tasks.push({
        key: `skill:${group.id}:${node.id}`,
        kind: "skill",
        title: node.name,
        detail: group.name,
        groupName: group.name,
        href: `/dashboard/skills?groupId=${group.id}&nodeId=${node.id}`,
        status: node.state,
        priority: node.state === "practiced" ? 3 : 4,
      });
    }
  }

  for (const question of input.questions) {
    if (question.isSolved) continue;
    tasks.push({
      key: `question:${question.id}`,
      kind: "question",
      title: question.title,
      detail: `${question.groupName} · 等待跟进`,
      groupName: question.groupName,
      href: `/dashboard/questions?groupId=${question.groupId}&questionId=${question.id}`,
      status: "open",
      priority: 5,
    });
  }

  const nextAction = input.profile?.nextAction;
  if (input.groupNames.includes("运营组") && nextAction?.href === "/dashboard/weekly-reports" && isDashboardHref(nextAction.href)) {
    tasks.push({
      key: "weekly-report:current",
      kind: "weekly-report",
      title: nextAction.title,
      detail: nextAction.detail || "运营组",
      groupName: "运营组",
      href: nextAction.href,
      status: nextAction.status,
      priority: 2,
    });
  }

  return tasks
    .filter((task) => isDashboardHref(task.href))
    .sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title, "zh-CN"));
}
