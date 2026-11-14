import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../routes/leave-workbench.tsx", import.meta.url), "utf8");
const accountsRoute = await readFile(new URL("../routes/admin/users.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
const access = await readFile(new URL("../../../backend/service/leave/access.go", import.meta.url), "utf8");
const generation = await readFile(new URL("../../../backend/service/leave/activities.go", import.meta.url), "utf8");

test("member access is checked before loading the workbench", () => {
  const statusCheck = route.indexOf("const nextAccessState = await leaveClient.leaveAccess()");
  const earlyReturn = route.indexOf('!["granted", "pending", "approved"].includes(nextAccessState.status)');
  const profileFetch = route.indexOf("leaveClient.profile()");
  assert.ok(statusCheck >= 0 && earlyReturn > statusCheck && profileFetch > earlyReturn);
  assert.match(route, /暂无请假台使用资格，请联系超级管理员/);
  assert.doesNotMatch(route, /申请开通|重新申请/);
});

test("superadmin controls access; members request approval for a dated, single-use leave", () => {
  assert.match(api, /leaveAccessAPI\.POST\("\/leave\/request"/);
  assert.doesNotMatch(api, /leaveAccessAPI\.POST\("\/leave\/access\/request"/);
  assert.match(api, /superAdminAPI\.Use\(middleware\.RequireSuperAdmin\(authService\)\)[\s\S]*?superAdminAPI\.GET\("\/leave\/requests"/);
  assert.match(api, /superAdminAPI\.PATCH\("\/leave\/requests\/:id"/);
  assert.match(api, /superAdminAPI\.GET\("\/leave\/permissions"/);
  assert.match(api, /superAdminAPI\.PUT\("\/leave\/permissions\/:id"/);
  assert.match(route, /listAdminUsers\(\{ keyword: accountKeyword\.trim\(\)/);
  assert.match(route, /一次性请假审批/);
  assert.match(route, /leaveClient\.requestLeaveAccess\(dailyDraft\)/);
  assert.match(route, /accessState\?\.status === "approved"/);
  assert.match(access, /func \(s \*Service\) GrantLeaveAccess/);
  assert.match(access, /Where\("user_id = \? AND status = \?", userID, model\.LeaveAccessGranted\)/);
  assert.match(generation, /Update\("status", model\.LeaveAccessUsed\)/);
  assert.match(generation, /result\.RowsAffected != 1/);
});

test("leave identity is edited only in profile settings", () => {
  assert.doesNotMatch(route, /<form onSubmit=\{saveProfile\}/);
  assert.match(route, /openMyProfile\("settings"\)/);
  assert.match(api, /api\.GET\("\/leave\/profile", middleware\.RequireAuthenticated\(authService\), leaveHandler\.GetProfile\)/);
  assert.match(api, /api\.PUT\("\/leave\/profile", middleware\.RequireAuthenticated\(authService\), requireSameOriginRequest\(cfg\), leaveHandler\.SaveProfile\)/);
});

test("approval record opens existing account details by exact ID", () => {
  assert.match(route, /to=\{\`\/dashboard\/admin\/users\?userId=\$\{request\.userId\}\`\}/);
  assert.match(accountsRoute, /const requestedUserId = searchParams\.get\("userId"\)/);
  assert.match(accountsRoute, /getAdminUser\(Number\(requestedUserId\)\)/);
});
