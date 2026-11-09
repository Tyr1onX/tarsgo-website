import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../routes/admin/users.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");
const registrations = await readFile(new URL("../routes/admin/registrations.tsx", import.meta.url), "utf8");
const adminClient = await readFile(new URL("./admin-users-client.ts", import.meta.url), "utf8");
const registrationClient = await readFile(new URL("./registrations-client.ts", import.meta.url), "utf8");
const registrationService = await readFile(new URL("../../../backend/service/registration/service.go", import.meta.url), "utf8");

test("account list uses ten-row server pagination and keeps the search server-backed", () => {
  assert.match(page, /pageSize: 10/);
  assert.match(page, /listAdminUsers\(\{[\s\S]*?page: nextPage[\s\S]*?keyword: searchKeyword,[\s\S]*?role: roleFilter/);
  assert.match(page, /setTimeout\(\(\) => setSearchKeyword\(keyword\), 300\)/);
  assert.match(page, /loading && items\.length === 0/);
  assert.match(page, /第 \{page\} \/ \{totalPages\} 页/);
  assert.match(page, /onClick=\{\(\) => void loadAccounts\(page - 1\)\}[\s\S]*?>上一页<\/button>/);
  assert.match(page, /onClick=\{\(\) => void loadAccounts\(page \+ 1\)\}[\s\S]*?>下一页<\/button>/);
});

test("account cold loading preserves table columns without fake zero totals", () => {
  assert.match(page, /loading && items\.length === 0 && summary\.total === 0/);
  assert.match(page, /" content-skeleton"/);
  assert.match(page, /role=\{loading && items\.length === 0 \? "status" : undefined\}/);
  assert.match(page, /正在加载账号列表/);
  assert.match(page, /loading && items\.length === 0 \? \[0, 1, 2, 3, 4\]\.map/);
  assert.match(page, /: items\.map\(\(item\) => \(/);
  assert.equal([...page.matchAll(/<table className="admin-table admin-users__table">/g)].length, 1);
  assert.match(styles, /\.content-skeleton \{\s*animation: content-skeleton-appear 0s 300ms both/);
});

test("account table stays compact and opens full details from the member name", () => {
  const start = page.indexOf('<table className="admin-table admin-users__table">');
  const end = page.indexOf("</table>", start);
  assert.ok(start >= 0 && end > start, "compact account table exists");
  const table = page.slice(start, end);
  assert.match(table, /成员/);
  assert.match(table, /组别/);
  assert.match(table, /身份与权限/);
  assert.match(table, /状态/);
  assert.match(table, /onClick=\{\(\) => void openEdit\(item\)\}/);
  assert.doesNotMatch(table, /item\.email|item\.authMethods|lastLoginAt|organizationTitleLabel/);
  assert.match(page, /editing\.authMethods\.hasPassword/);
  assert.match(page, /editing\.groups\.map/);
  assert.match(page, /登录密码/);
  assert.match(page, /确认重置/);
});

test("member detail has three read-only sections and one local editor at a time", () => {
  assert.match(page, /detailSection === "account"/);
  assert.match(page, /detailSection === "organization"/);
  assert.match(page, /detailSection === "records"/);
  assert.match(page, /const \[activeEditor, setActiveEditor\]/);
  assert.match(page, /activeEditor === "profile"/);
  assert.match(page, /activeEditor === "access"/);
  assert.match(page, /activeEditor === "password"/);
  assert.doesNotMatch(page, /保存修改|修正意向组|updateAdminUserRecruitmentGroup/);
  assert.match(page, /set\("userId", String\(item\.id\)\)/);
  assert.match(page, /getAdminUser\(detail\.id\)/);
});

test("membership changes cannot overwrite multiple existing groups", () => {
  assert.match(page, /editing\.groups\.length > 1/);
  assert.match(page, /latest\.groups\.length > 1/);
  assert.match(page, /JSON\.stringify\(latest\.groups\) !== JSON\.stringify\(editing\.groups\)/);
  assert.match(page, /window\.confirm\("调整组别将移除/);
  assert.match(page, /editing\.groups\.map\(\(group\) =>/);
  assert.match(page, /updateAdminUserGroupRole\(editing\.id, groupId, role\)/);
});

test("recruitment intention correction has one admin entry in recruitment details", () => {
  assert.doesNotMatch(page, /updateAdminUserRecruitmentGroup|修正意向组/);
  assert.match(registrations, /updateAdminUserRecruitmentGroup\(detail\.userId, Number\(preferredGroupDraft\)\)/);
  assert.match(registrations, /currentUser\.role\.name === "super_admin" && detail\.formStatus === 1 && detail\.status !== "admitted"/);
  assert.match(registrations, /preferredGroupError \? <p role="alert"/);
  assert.match(adminClient, /updateAdminUserRecruitmentGroup\(userId: number, groupId: number\)/);
  assert.match(registrationClient, /userId: number;[\s\S]*?formStatus: number;/);
  assert.match(registrationService, /UserID:\s+registration\.UserID,[\s\S]*?FormStatus:\s+registration\.Form\.Status/);
});

test("account filters, key metrics, group distribution, and create action have distinct priority", () => {
  assert.match(page, /type="search"[\s\S]*?placeholder="姓名或邮箱"/);
  const filterStart = page.indexOf('<section className="admin-filter-panel">');
  const filterEnd = page.indexOf('<section className="admin-panel', filterStart);
  const filterPanel = page.slice(filterStart, filterEnd);
  assert.equal([...filterPanel.matchAll(/>账号状态<select/g)].length, 1, "compact filters show one status filter");
  assert.match(page, /<summary[^>]*>高级筛选<\/summary>/);
  assert.match(styles, /\.admin-design \.admin-users__filters\s*\{\s*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(styles, /\.admin-design \.admin-users__table \.admin-table-row > td:nth-child\(2\) \{ display: block; grid-area: group; \}/);
  assert.match(styles, /\.admin-design \.admin-users__table \.admin-table-row > td:nth-child\(4\) \{[\s\S]*?display: block/);
  assert.match(page, /summary\.pending \+ summary\.cleanupPending/);
  assert.match(page, /<details className="admin-users__distribution">/);
  assert.match(page, /className="admin-page-header admin-users__header"[\s\S]*?新建账号/);
  assert.doesNotMatch(filterPanel, /新建账号/);
});
