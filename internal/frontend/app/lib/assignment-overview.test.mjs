import assert from "node:assert/strict";
import test from "node:test";

import { buildAssignmentOverview } from "./assignment-overview.ts";

const groups = [{ groupId: 4, name: "机械组" }, { groupId: 7, name: "视觉组" }, { groupId: 8, name: "AI组" }];
const assignments = [
  { id: 1, groupId: 4, publicationStatus: "published", targetCount: 12, submittedCount: 8, reviewedCount: 5, passedCount: 4 },
  { id: 2, groupId: 4, publicationStatus: "withdrawn", targetCount: 80, submittedCount: 20, reviewedCount: 10, passedCount: 3 },
  { id: 3, groupId: 7, publicationStatus: "published", targetCount: 10, submittedCount: 0, reviewedCount: 0, passedCount: 0 },
  { id: 4, groupId: 99, publicationStatus: "published", targetCount: 50, submittedCount: 50, reviewedCount: 50, passedCount: 50 },
];
const pending = [{ groupId: 4, reviewCount: 3 }, { groupId: 7, reviewCount: 0 }, { groupId: 99, reviewCount: 20 }];

test("overview aggregates only authorized groups and published assignments", () => {
  const overview = buildAssignmentOverview(groups, assignments, pending);
  assert.deepEqual(overview.totals, { assignments: 2, targets: 22, submitted: 8, passed: 4, pendingReviews: 3 });
  assert.deepEqual(overview.groups.map(({ name, assignments, pendingReviews }) => [name, assignments, pendingReviews]), [
    ["机械组", 1, 3], ["视觉组", 1, 0], ["AI组", 0, 0],
  ]);
});

test("group selection changes presentation without changing the underlying data or counting people twice", () => {
  const overview = buildAssignmentOverview(groups, assignments, pending, 7);
  assert.deepEqual(overview.totals, { assignments: 1, targets: 10, submitted: 0, passed: 0, pendingReviews: 0 });
  assert.deepEqual(overview.groups.map((group) => group.groupId), [7]);
  assert.equal(buildAssignmentOverview(groups, assignments, pending, 99).groups.length, 0);
});
