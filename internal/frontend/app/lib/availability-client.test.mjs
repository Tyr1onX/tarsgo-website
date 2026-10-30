import assert from "node:assert/strict";
import test from "node:test";
import { availabilityCounts, availabilityFreeRatio, filterAvailabilityMembers, intervalStatus } from "./availability-client.ts";

const members = [
  { userId: 1, name: "甲", occupied: [{ weekday: 3, startSection: 3, endSection: 4 }], hasUncertainCourses: false, uncertainCourseCount: 0 },
  { userId: 2, name: "乙", occupied: [{ weekday: 4, startSection: 11, endSection: 12 }], hasUncertainCourses: true, uncertainCourseCount: 1 },
  { userId: 3, name: "丙", missingReason: "not_imported", occupied: [], hasUncertainCourses: false, uncertainCourseCount: 0 },
];
test("group grid counts only imported members as available", () => {
  assert.deepEqual(availabilityCounts(members, 3, 3, 3), { free: 1, conflict: 1, missing: 1 });
  assert.deepEqual(availabilityCounts(members, 3, 3, 4), { free: 1, conflict: 1, missing: 1 });
  assert.deepEqual(availabilityCounts(members, 7, 1, 12), { free: 2, conflict: 0, missing: 1 });
});
test("whole interval and rescheduled slots match every section", () => {
  assert.equal(intervalStatus(members[0], 3, 2, 4), "conflict");
  assert.equal(intervalStatus(members[0], 3, 5, 6), "free");
  assert.equal(intervalStatus(members[1], 4, 9, 12), "conflict");
  assert.equal(intervalStatus(members[2], 6, 1, 2), "missing");
});
test("heatmap proportions use valid timetables as the denominator", () => {
  assert.equal(availabilityFreeRatio(members, 3, 3, 3), 0.5);
  assert.equal(availabilityFreeRatio(members, 3, 2, 6), 0.5);
  assert.equal(availabilityFreeRatio([members[2]], 3, 1, 12), null);
});
test("member lists use the status of the complete continuous interval", () => {
  assert.deepEqual(filterAvailabilityMembers(members, 3, 2, 6, "conflict").map(({ name }) => name), ["甲"]);
  assert.deepEqual(filterAvailabilityMembers(members, 3, 2, 6, "free").map(({ name }) => name), ["乙"]);
  assert.deepEqual(filterAvailabilityMembers(members, 3, 2, 6, "missing").map(({ name }) => name), ["丙"]);
});
