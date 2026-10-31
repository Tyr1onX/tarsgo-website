import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../routes/admin/timetable-availability.tsx", import.meta.url), "utf8");
const adminCss = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");

test("time coordination uses the configured current term without a semester selector", () => {
  assert.match(page, /resolveCurrentTeachingWeek/);
  for (const label of ["组别", "教学周", "查看对象"]) assert.match(page, new RegExp(`aria-label=\"${label}\"`));
  assert.doesNotMatch(page, /aria-label=\"学期\"|options\.semesters|semester=\{/);
  assert.match(page, /options\?\.currentSemester/);
  assert.match(page, /options\.firstWeekStart/);
  assert.match(page, /第 \$\{week\} 周/);
  assert.match(page, /请选择教学周/);
});

test("only super admins can open the count-confirmed global timetable cleanup", () => {
  assert.match(page, /currentUser\.role\.name === "super_admin"/);
  assert.match(page, /getTimetableCleanupPreview\(\)/);
  assert.match(page, /即将删除全站/);
  assert.match(page, /clearAllTimetables\(clearPreview\)/);
  assert.match(page, /setClearRevision/);
  assert.match(page, /确认清空/);
});

test("member details live in an on-demand dialog and the persistent interval controls are removed", () => {
  assert.match(page, /role=\"dialog\"/);
  assert.match(page, /aria-modal=\"true\"/);
  assert.match(page, /aria-label=\"关闭时段详情\"/);
  assert.match(page, /selectedSlot/);
  assert.match(page, /createPortal\(/);
  assert.match(page, /document\.body/);
  assert.match(page, /className="admin-design fixed inset-0/);
  assert.match(page, /z-\[70\]/);
  assert.match(page, /event\.target === event\.currentTarget/);
  assert.match(page, /无课程冲突/);
  assert.match(page, /有课程冲突/);
  assert.match(page, /数据缺失/);
  assert.doesNotMatch(page, /aria-label=\"结束节次\"/);
  assert.doesNotMatch(page, /aria-label=\"成员类别\"/);
  assert.doesNotMatch(page, /aria-label=\"成员类别\"|aria-pressed=\{category/);
  assert.doesNotMatch(page, /setEndSection|endSection/);
});

test("heatmap retains valid-timetable ratios and only opens member details in group view", () => {
  assert.match(page, /availabilityFreeRatio/);
  assert.match(page, /availabilityCounts/);
  assert.match(page, /filterAvailabilityMembers/);
  assert.match(page, /if \(!member\) setSelectedSlot/);
});

test("admins can switch between all members and every group without leaving the page", () => {
  assert.match(page, /setGroupId\(value\.defaultGroupId\)/);
  assert.match(page, /<option value=\{0\}>全部成员<\/option>/);
  assert.match(page, /getAvailabilityWeek\(\{ groupId, week \}\)/);
  assert.match(page, /result\.groupName/);
});

test("heatmap uses discrete levels and exposes valid-count ratios on hover and click", () => {
  assert.match(page, /availabilityHeatLevel/);
  assert.match(page, /low: "availability-heatmap__level--low"/);
  assert.match(page, /medium: "availability-heatmap__level--medium"/);
  assert.match(page, /high: "availability-heatmap__level--high"/);
  assert.match(page, /aria-label=\{details\} title=\{details\}/);
  assert.match(page, /有效课表 \$\{validCount\} 人，空闲比例/);
  assert.match(page, /有效课表 \{selectedValidCount\} 人 · 空闲比例/);
  assert.match(page, /低 &lt; 1\/3/);
  assert.match(page, /中 1\/3–&lt;2\/3/);
  assert.match(page, /高 ≥ 2\/3/);
  assert.doesNotMatch(page, /linear-gradient\(|backgroundColor:/);
  for (const level of ["low", "medium", "high"]) {
    assert.ok(adminCss.includes(`:root[data-theme="light"] .admin-design .availability-heatmap__level--${level}`));
  }
});
