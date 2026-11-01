import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../routes/admin/timetable-availability.tsx", import.meta.url), "utf8");
const adminCss = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");

test("heatmap shows the official JLU start and end times for all 12 periods", () => {
  const match = page.match(/const SECTION_TIMES = \[([\s\S]*?)\] as const;/);
  assert.ok(match, "official period mapping exists");
  const ranges = [...match[1].matchAll(/\[\"(\d{2}:\d{2})\", \"(\d{2}:\d{2})\"\]/g)].map(([, start, end]) => `${start}–${end}`);
  assert.deepEqual(ranges, [
    "08:00–08:45", "08:55–09:40", "10:00–10:45", "10:55–11:40",
    "13:30–14:15", "14:25–15:10", "15:30–16:15", "16:25–17:10",
    "18:20–19:05", "19:05–19:50", "20:00–20:45", "20:45–21:30",
  ]);
  assert.match(page, /SECTION_TIMES\s*=\s*\[/);
  assert.match(page, />时间<\/span>/);
  assert.match(page, /第 \{period\} 节/);
});

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
  const heatmapStyles = adminCss.slice(adminCss.indexOf(".admin-design .availability-heatmap__level--low"));
  for (const token of ["--admin-danger", "--admin-warning", "--admin-success", "--admin-neutral"]) {
    assert.ok(heatmapStyles.includes(token), token);
  }
  assert.doesNotMatch(heatmapStyles, /:root\[data-theme=/);
});

test("slot descriptions and detail headings include real times and their section numbers", () => {
  assert.match(page, /\$\{DAYS\[day - 1\]\} · \$\{sectionTimeLabel\(period\)\}（第\$\{period\}节）/);
  assert.match(page, /\{DAYS\[selectedSlot\.weekday - 1\]\} · \{sectionTimeLabel\(selectedSlot\.section\)\}/);
  assert.match(page, /第 \{selectedSlot\.section\} 节 · 第 \{result\.week\} 周/);
  assert.match(adminCss, /\.admin-design \.availability-heatmap__row-break[\s\S]*?border-top: 1px solid var\(--admin-border-subtle\)/);
});

test("the time labels stay visible while the mobile heatmap scrolls horizontally", () => {
  assert.match(page, /availability-heatmap__time-header[^>]*>时间<\/span>/);
  assert.match(adminCss, /\.admin-design \.availability-heatmap__time-label\s*\{[\s\S]*?position: sticky;[\s\S]*?left: 0;[\s\S]*?background: var\(--admin-surface\)/);
  assert.match(adminCss, /\.admin-design \.availability-heatmap__time-header\s*\{[\s\S]*?position: sticky;[\s\S]*?left: 0;[\s\S]*?z-index: 2/);
});
