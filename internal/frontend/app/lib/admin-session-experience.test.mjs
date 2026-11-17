import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("account filtering uses database group options and a concrete group query", async () => {
  const [route, client] = await Promise.all([
    read("routes/admin/users.tsx"),
    read("lib/admin-users-client.ts"),
  ]);
  assert.match(route, /setGroupFilterOptions\(groups\)/);
  assert.match(route, /groupFilterOptions\.map\(\(group\)/);
  assert.match(route, /group\.status === 1 \? "" : "（已停用）"/);
  assert.match(route, /value="unassigned"/);
  assert.match(client, /params\.set\("groupId", String\(input\.groupId\)\)/);
  assert.doesNotMatch(route, /groupId\s*===\s*(1|2|3|4|5)/);
});

test("paused school leave does not load in the admin home or navigation", async () => {
  const [layout, leave, adminDashboard] = await Promise.all([
    read("routes/dashboard/layout.tsx"),
    read("lib/leave-client.ts"),
    read("components/dashboard-section-navigation.tsx"),
  ]);
  assert.doesNotMatch(leave, /SchoolLeaveSummary|schoolSummary/);
  assert.doesNotMatch(adminDashboard, /leaveClient|schoolSummary/);
  assert.doesNotMatch(adminDashboard, /leaveActionableCount/);
  assert.doesNotMatch(layout, /leaveActionableState|leaveClient|subscribeLeaveSummaryChange|请假待审批/);
  assert.doesNotMatch(layout, /summary\.unreadCount/);
});

test("account switching exposes reauthentication and synchronizes identity changes across tabs", async () => {
  const [layout, choices, login, auth] = await Promise.all([
    read("routes/dashboard/layout.tsx"),
    read("components/account-session-choices.tsx"),
    read("routes/login.tsx"),
    read("lib/auth-client.ts"),
  ]);
  assert.match(layout, /<AccountSessionChoices/);
  assert.match(choices, /account\.status === "available"/);
  assert.match(choices, /account\.status === "disabled"/);
  assert.match(choices, /onReauthenticate\(account\.user\.email\)/);
  assert.match(login, /account\.status === "available"/);
  assert.match(login, /reauthPath\(account\.user\.email/);
  assert.match(auth, /BroadcastChannel\(ACCOUNT_SESSION_CHANNEL\)/);
  assert.match(auth, /authSessionCache\.clear\(\)/);
  assert.doesNotMatch(auth, /localStorage\.(setItem|getItem)\([^)]*(token|session)/i);
});

test("newly created accounts open their exact detail without relying on list filters", async () => {
  const route = await read("routes/admin/users.tsx");
  assert.match(route, /const created = await createAdminUser\(/);
  assert.match(route, /showAccountDetail\(created\)/);
  assert.match(route, /next\.set\("userId", String\(created\.id\)\)/);
  assert.match(route, /if \(editing\?\.id === Number\(requestedUserId\)\) return/);
  assert.match(route, /账号已创建。/);
  assert.match(route, /getAdminUser\(Number\(requestedUserId\)\)/);
});

test("account choice stays inside both avatar menus and does not need a management dialog", async () => {
  const [layout, navbar, choices] = await Promise.all([
    read("routes/dashboard/layout.tsx"),
    read("components/navbar.tsx"),
    read("components/account-session-choices.tsx"),
  ]);
  for (const menu of [layout, navbar]) {
    assert.match(menu, /<AccountSessionChoices/);
    assert.match(menu, /switchAccountSession\(accountId\)/);
    assert.match(menu, /removeAccountSession\(accountId\)/);
  }
  assert.doesNotMatch(layout, /AccountSessionDialog|openAccountModal|accountModalMode/);
  assert.doesNotMatch(navbar, /getAccountSwitchHref/);
  assert.match(choices, /onSwitch\(account\.id\)/);
  assert.match(choices, /onRemove\(account\.id\)/);
  assert.match(choices, /会话已过期/);
  assert.match(choices, /会话已撤销/);
  assert.match(choices, /账号已停用/);
  assert.match(choices, /const otherAccounts = accounts\.filter\(\(account\) => !account\.current && account\.user\.id !== currentUserId\)/);
  assert.match(choices, /otherAccounts\.map\(\(account\) =>/);
  assert.doesNotMatch(choices, /accounts\.map\(\(account\) =>/);
  assert.match(choices, /const canAddAccount = !loading && accounts\.length === 1 && otherAccounts\.length === 0/);
  assert.match(choices, /if \(!loading && !error && otherAccounts\.length === 0 && !canAddAccount\) return null/);
  assert.doesNotMatch(choices, /aria-current|管理账号|添加账号/);
  assert.match(layout, /<AccountMenuIdentity user=\{currentUser\} \/>/);
  assert.match(navbar, /<AccountMenuIdentity user=\{visibleUser\} \/>/);
  assert.match(choices, /name !== role/);
  assert.match(choices, /account-session-choices__avatar/);
  assert.match(choices, /account-session-choices__remove/);
  assert.match(layout, /这只会移除该账号，不会退出其他账号/);
  for (const menu of [layout, navbar]) {
    assert.match(menu, /退出登录/);
    assert.doesNotMatch(menu, /退出全部账号|handleLogoutAll|logoutAllAccounts/);
  }
});

test("account and group permission changes publish targeted or global invalidation", async () => {
  const [users, groups, auth, groupCache] = await Promise.all([
    read("lib/admin-users-client.ts"),
    read("lib/admin-user-groups-client.ts"),
    read("lib/auth-client.ts"),
    read("lib/user-group-client.ts"),
  ]);
  assert.match(users, /announcePermissionChange\(userId\)/);
  assert.match(groups, /announcePermissionChange\(null\)/);
  assert.match(auth, /type: "permissions-changed"/);
  assert.match(groupCache, /markUserGroupConfirmationStateStale\(accountId: number \| null\)/);
  assert.match(groupCache, /if \(accountId === null\)[\s\S]*?cached, stale: true/);
});
