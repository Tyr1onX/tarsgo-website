import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../routes/admin/users.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");

test("account list uses ten-row server pagination and keeps the search server-backed", () => {
  assert.match(page, /pageSize: 10/);
  assert.match(page, /listAdminUsers\(\{[\s\S]*?page: nextPage[\s\S]*?keyword,[\s\S]*?role: roleFilter/);
  assert.match(page, /第 \{page\} \/ \{totalPages\} 页/);
  assert.match(page, /onClick=\{\(\) => void loadAccounts\(page - 1\)\}[\s\S]*?>上一页<\/button>/);
  assert.match(page, /onClick=\{\(\) => void loadAccounts\(page \+ 1\)\}[\s\S]*?>下一页<\/button>/);
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
  assert.match(page, /重置登录密码/);
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
  assert.doesNotMatch(page.slice(page.indexOf('className="admin-filter-panel"'), page.indexOf('className="admin-users__table-wrap"')), /新建账号/);
});
