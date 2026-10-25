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

test("leave navigation counts approvals and actionable work, not unread rows", async () => {
  const [layout, leave] = await Promise.all([
    read("routes/dashboard/layout.tsx"),
    read("lib/leave-client.ts"),
  ]);
  assert.match(leave, /pendingApprovalCount: number/);
  assert.match(leave, /actionableCount: number/);
  assert.match(layout, /actionableCount: summary\.actionableCount/);
  assert.match(layout, /pendingApprovalCount: summary\.pendingApprovalCount, todoCount: summary\.todoCount/);
  assert.match(layout, /leaveActionableCount \?\? 0/);
  assert.match(layout, /subscribeLeaveSummaryChange/);
  assert.doesNotMatch(layout, /summary\.unreadCount/);
});

test("account switching exposes reauthentication and synchronizes identity changes across tabs", async () => {
  const [layout, login, auth] = await Promise.all([
    read("routes/dashboard/layout.tsx"),
    read("routes/login.tsx"),
    read("lib/auth-client.ts"),
  ]);
  assert.match(layout, /account\.status === "available"/);
  assert.match(layout, /account\.status === "disabled"/);
  assert.match(layout, /onReauthenticate\(account\.user\.email\)/);
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
  assert.match(route, /nextSearchParams\.set\("userId", String\(created\.id\)\)/);
  assert.match(route, /if \(editing\?\.id === Number\(requestedUserId\)\) return/);
  assert.match(route, /账号已创建，请继续设置所属组别和组织身份/);
  assert.match(route, /async function openAccount\(userId: number\)[\s\S]*getAdminUser\(userId\)/);
});

test("full account storage identifies unavailable sessions and only removes the selected account", async () => {
  const layout = await read("routes/dashboard/layout.tsx");
  assert.match(layout, /MAX_SAVED_ACCOUNT_SESSIONS = 5/);
  assert.match(layout, /账号名额已满。过期、已撤销或停用的记录仍占用名额/);
  assert.match(layout, /会话已过期/);
  assert.match(layout, /会话已撤销/);
  assert.match(layout, /账号已停用/);
  assert.match(layout, /onRemove\(account\.id\)/);
  assert.match(layout, /释放名额后添加/);
  assert.match(layout, /确定移除「\$\{accountLabel\}」的已保存登录会话？这只会移除该账号，不会退出其他账号/);
  assert.match(layout, /mode === "manage" \|\| account\.status !== "available"/);
});
