import type { Assignment } from "./assignment-client.ts";

type GroupOption = { groupId: number; name: string };
type PendingGroup = { groupId: number; reviewCount: number };

export function buildAssignmentOverview(groups: readonly GroupOption[], assignments: readonly Assignment[], pending: readonly PendingGroup[], selectedGroupId = 0) {
  const groupRows = groups.map((group) => ({
    groupId: group.groupId,
    name: group.name,
    assignments: 0,
    targets: 0,
    submitted: 0,
    passed: 0,
    pendingReviews: pending.find((item) => item.groupId === group.groupId)?.reviewCount ?? 0,
  }));
  const byID = new Map(groupRows.map((row) => [row.groupId, row]));
  for (const assignment of assignments) {
    if (assignment.publicationStatus === "withdrawn") continue;
    const row = byID.get(assignment.groupId);
    if (!row) continue;
    row.assignments += 1;
    row.targets += assignment.targetCount;
    row.submitted += assignment.submittedCount;
    row.passed += assignment.passedCount;
  }
  const visibleGroups = selectedGroupId ? groupRows.filter((row) => row.groupId === selectedGroupId) : groupRows;
  const totals = visibleGroups.reduce((sum, row) => ({
    assignments: sum.assignments + row.assignments,
    targets: sum.targets + row.targets,
    submitted: sum.submitted + row.submitted,
    passed: sum.passed + row.passed,
    pendingReviews: sum.pendingReviews + row.pendingReviews,
  }), { assignments: 0, targets: 0, submitted: 0, passed: 0, pendingReviews: 0 });
  return { groups: visibleGroups, totals };
}
