import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../routes/leave-workbench.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../../../backend/router/router.go", import.meta.url), "utf8");

test("members see application status before any leave profile or history request", () => {
  const statusCheck = route.indexOf("const nextAccessState = await leaveClient.leaveAccess()");
  const earlyReturn = route.indexOf("if (nextAccessState.status !== \"approved\") return;");
  const profileFetch = route.indexOf("leaveClient.profile()");
  const recordsFetch = route.indexOf("leaveClient.dailyRecords() : leaveClient.myDailyRecords()");

  assert.ok(statusCheck >= 0 && earlyReturn > statusCheck, "member access must be checked before loading the workbench");
  assert.ok(profileFetch > earlyReturn && recordsFetch > earlyReturn, "unapproved members must not load leave profile or records");
  assert.ok(route.includes("申请审核中"), "pending applications must show their review status");
  assert.ok(route.includes('accessState.status === "rejected" ? "重新申请" : "申请开通"'), "rejected members must be able to reapply");
});

test("completed leave profiles stay collapsed behind a concise control", () => {
  assert.ok(route.includes("查看/修改资料"), "completed profiles must have a concise entry");
  assert.ok(route.includes("profileReady && !profileExpanded ? null"), "completed profiles must be collapsed by default");
  assert.ok(route.includes(": <form onSubmit={saveProfile}"), "missing profile data must show the fill-in form");
});

test("member leave APIs are guarded and admin review stays in the existing admin API", () => {
  assert.match(api, /leaveMemberAPI\.Use\(middleware\.RequireAuthenticated\(authService\), middleware\.RequireLeaveAccess\(leaveService\)\)/);
  assert.match(api, /leaveAccessAPI\.GET\("\/leave\/access", leaveHandler\.GetLeaveAccess\)/);
  assert.match(api, /leaveAccessAPI\.POST\("\/leave\/access\/request"/);
  assert.match(api, /adminAPI\.GET\("\/leave\/access-requests", leaveHandler\.ListPendingLeaveAccessRequests\)/);
  assert.match(api, /adminAPI\.PATCH\("\/leave\/access-requests\/:id"/);
});
