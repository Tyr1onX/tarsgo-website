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
  assert.match(route, /待审批申请/);
  assert.match(route, /leaveClient\.requestLeaveAccess\(dailyDraft\)/);
  assert.match(route, /accessState\?\.status === "approved"/);
  assert.match(access, /func \(s \*Service\) GrantLeaveAccess/);
  assert.match(access, /Where\("user_id = \? AND status = \?", userID, model\.LeaveAccessGranted\)/);
  assert.match(generation, /Update\("status", model\.LeaveAccessUsed\)/);
  assert.match(generation, /result\.RowsAffected != 1/);
});

test("historic approved members retain permanent self-service and admins choose either grant type", () => {
  assert.match(access, /row\.Status == model\.LeaveAccessApproved[\s\S]*row\.StartAt == nil && row\.EndAt == nil/);
  assert.match(access, /status = \? AND start_at IS NULL AND end_at IS NULL/);
  assert.match(access, /mode == "permanent"/);
  assert.match(access, /mode == "temporary"/);
  assert.match(route, /<h2>自助生成假条<\/h2>/);
  assert.match(route, /<h2>已批准 · 生成一次假条<\/h2>/);
  assert.match(route, /setPermission\(user\.id, "permanent"\)/);
  assert.match(route, /setPermission\(user\.id, "temporary"\)/);
  assert.match(route, /setPermission\(item\.userId, "revoke"\)/);
  assert.match(generation, /if permanent \{[\s\S]*s\.logDailyDocument/);
  assert.match(generation, /else if err := s\.consumeApprovedLeave/);
});

test("super-admin sees pending approvals first, delegates generation, and expands permissions only as needed", () => {
  const approval = route.indexOf('id="leave-access-requests-title"');
  const delegated = route.indexOf('id="leave-delegate-title"');
  const folded = route.indexOf('<details className="admin-panel');
  assert.ok(approval >= 0 && delegated > approval && folded > delegated);
  assert.match(route, /<summary[^>]*>授权管理/);
  assert.match(route, /leaveClient\.adminMemberProfile\(user\.id\)/);
  assert.match(route, /leaveClient\.adminGenerateDaily\(delegateAccount\.id, delegateDraft, offline\)/);
  assert.match(api, /superAdminAPI\.GET\("\/leave\/users\/:id\/profile", leaveHandler\.GetAdminDocumentProfile\)/);
  assert.match(api, /superAdminAPI\.POST\("\/leave\/users\/:id\/document", leaveHandler\.AdminGenerateDailyDocument\)/);
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
