import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const profile = await readFile(new URL("../components/profile-dialog.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const leave = await readFile(new URL("../routes/leave-workbench.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../../../backend/router/router.go", import.meta.url), "utf8");

test("profile fields share a fixed 44px control height and common grid baseline", () => {
  assert.match(profile, /const fieldClass = "admin-field box-border h-11 min-h-11/);
  assert.match(profile, /const readOnlyClass = "flex h-11 min-h-11/);
  assert.match(profile, /const labelClass = "mb-2 block text-xs/);
  assert.match(profile, /grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2/);
  assert.match(profile, /aria-label="姓名"/);
  assert.match(profile, /aria-label="邮箱"/);
  assert.match(profile, /aria-label="所属组别"/);
  assert.match(profile, /aria-label="账号权限"/);
  assert.doesNotMatch(profile, /<div className="mt-1 min-h-10/);
});

test("avatar preview, account save and timetable upload retain separate behaviors", () => {
  assert.match(profile, /URL\.createObjectURL\(avatar\)/);
  assert.match(profile, /URL\.revokeObjectURL\(avatarPreview\)/);
  assert.match(profile, /avatarInputRef\.current\?\.click\(\)/);
  assert.match(profile, /group-hover:opacity-100 group-focus-visible:opacity-100/);
  assert.match(profile, /file\.size > 2 \* 1024 \* 1024/);
  assert.match(profile, /<PersonalTimetableUpload userId=\{user\.id\} \/>/);
  assert.match(profile, /form="profile-dialog-form"/);
  assert.match(profile, /footerClassName=/);
  assert.match(profile, /updateProfile\(\{ nickname: user\.nickname \?\? "", phone, avatar \}\)/);
});

test("leave identity uses account name, restricts edits to locked identifiers, and permits voluntary registration", () => {
  assert.match(profile, /user\.realName\?\.trim\(\) \|\| user\.nickname\?\.trim\(\)/);
  assert.match(profile, /leaveProfile\?\.identityLocked \? leaveProfile\.name : accountName/);
  assert.match(profile, /readOnly=\{Boolean\(leaveProfile\?\.identityLocked\)\}/);
  assert.match(profile, /leaveClient\.saveProfile/);
  assert.match(profile, /leaveClient\.profile\(\)/);
  assert.match(profile, /leaveClient\.colleges\(\)/);
  assert.match(profile, /\^\[0-9\]\{8\}\$/);
  assert.match(api, /leaveAccessAPI\.Use\(middleware\.RequireAuthenticated\(authService\)\)/);
  assert.match(api, /leaveAccessAPI\.GET\("\/leave\/profile"/);
  assert.match(api, /leaveAccessAPI\.PUT\("\/leave\/profile", requireSameOriginRequest\(cfg\)/);
  assert.match(api, /leaveMemberAPI\.Use\(middleware\.RequireAuthenticated\(authService\), middleware\.RequireLeaveAccess\(leaveService\)\)/);
  assert.match(leave, /onClick=\{openProfile\}>完善个人资料/);
  assert.match(layout, /openProfile: \(\) => setProfileOpen\(true\)/);
  assert.match(layout, /setProfileRevision\(\(revision\) => revision \+ 1\)/);
});
