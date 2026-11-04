import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const profile = await readFile(new URL("../components/personal-profile-settings.tsx", import.meta.url), "utf8");
const memberProfile = await readFile(new URL("../routes/dashboard/community-member-profile.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const dashboardNavigation = await readFile(new URL("./dashboard-navigation.ts", import.meta.url), "utf8");
const leave = await readFile(new URL("../routes/leave-workbench.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
const authClient = await readFile(new URL("./auth-client.ts", import.meta.url), "utf8");
const registrationReviews = await readFile(new URL("../routes/admin/registrations.tsx", import.meta.url), "utf8");

test("profile settings edit the canonical account and keep the timetable", () => {
  assert.match(profile, /getAccountProfile/);
  assert.match(profile, /<AccountAcademicFields/);
  assert.match(profile, /academic: profile/);
  assert.match(profile, /id="timetable"[\s\S]*?<PersonalTimetableUpload userId=\{user\.id\} \/>/);
  assert.doesNotMatch(profile, /leaveClient\.saveProfile|CommunityGrowthProfileSection/);
});

test("the current member can edit name, bio, and avatar directly in the profile header", () => {
  assert.match(memberProfile, /const isSelf = member\.isSelf && member\.id === currentUser\.id/);
  assert.match(memberProfile, /isSelf \? <>[\s\S]*?aria-label="更换头像"/);
  assert.match(memberProfile, /isSelf \? <button[^>]*aria-label="编辑姓名"/);
  assert.match(memberProfile, /isSelf \? <button[^>]*aria-label="编辑个人介绍"/);
  assert.match(memberProfile, /event\.key === "Enter"[\s\S]*?void saveName\(\)/);
  assert.match(memberProfile, /event\.key === "Escape"[\s\S]*?cancelNameEdit\(\)/);
  assert.match(memberProfile, /onBlur=\{handleNameBlur\}/);
  assert.match(memberProfile, /updateProfile\(\{ realName: nextName, avatar: null \}\)/);
  assert.match(memberProfile, /updateProfile\(\{ realName: member\.displayName\.trim\(\), avatar: file \}\)/);
  assert.match(memberProfile, /file\.size > 2 \* 1024 \* 1024/);
  assert.match(memberProfile, /头像仅支持 JPG 或 PNG/);
  assert.match(memberProfile, /setResult\(\(current\) => current\?\.member\.id === updatedUser\.id \? \{ \.\.\.current, member: \{ \.\.\.current\.member, displayName: savedName \} \} : current\)/);
  assert.match(memberProfile, /clearCommunityLists\(\)/);
  assert.doesNotMatch(profile, /avatarInputRef|autoComplete="name"|realNameDraft/);
});

test("leave documents retain their locked identity and server-side access", () => {
  assert.match(profile, /leaveProfile\?\.identityLocked/);
  assert.match(profile, /leaveClient\.profile\(\)/);
  assert.match(api, /leaveMemberAPI\.Use\(middleware\.RequireAuthenticated\(authService\), middleware\.RequireWorkbench\(\), middleware\.RequireLeaveAccess\(leaveService\)\)/);
  assert.match(leave, /onClick=\{\(\) => openMyProfile\("settings"\)\}>完善学籍资料/);
});

test("account identity display uses only the canonical real name", () => {
  const start = authClient.indexOf("export function getAuthUserName");
  const end = authClient.indexOf("export function getAuthUserRoleLabel", start);
  const displayName = authClient.slice(start, end);
  assert.match(displayName, /user\.realName\?\.trim\(\) \|\| "姓名待核实"/);
  assert.doesNotMatch(displayName, /nickname|email/);
});

test("registration reviewers and audit actors never fall back to account email", () => {
  assert.match(registrationReviews, /detail\.screener\?\.name \|\| "姓名待核实"/);
  assert.match(registrationReviews, /detail\.interviewer\?\.name \|\| "姓名待核实"/);
  assert.match(registrationReviews, /item\.actor\?\.name \|\| "历史记录"/);
  assert.doesNotMatch(registrationReviews, /(?:screener|interviewer|actor)\?\.email/);
});

test("phone remains out of the editor and is not resent during unrelated edits", () => {
  assert.doesNotMatch(profile, /setPhone\(|type="tel"|>手机号<|填写 11 位手机号|手机号可自行更新/);
  assert.doesNotMatch(memberProfile, /phone: currentUser\.phone/);
  assert.match(memberProfile, /updateProfile\(/);
});

test("independent settings stay reachable without a profile settings tab", () => {
  assert.match(dashboardNavigation, /key: "my-profile", label: "我的主页", href: `\/dashboard\/members\/\$\{currentUser\.id\}`, iconKey: "user"/);
  assert.doesNotMatch(layout, /dashboard-shell__user-menu-actions[\s\S]*?>我的主页<\/button>/);
  assert.match(layout, /navigate\(`\/dashboard\/members\/\$\{currentUser\.id\}\?tab=settings#timetable`/);
  assert.match(memberProfile, /{tab === "settings" && isSelf/);
  assert.match(memberProfile, /<PersonalProfileSettings user=\{currentUser\} \/>/);
  assert.match(memberProfile, /{tab !== "settings" \? <nav className="community-member-tabs"/);
  assert.match(memberProfile, /onReplay=\{isSelf \? requestBadgeReplay : undefined\}/);
  assert.doesNotMatch(memberProfile, /label: "资料设置"|编辑资料/);
  assert.doesNotMatch(layout, /ProfileDialog|setProfileOpen/);
  assert.doesNotMatch(layout, /import \{ ProfileDialog \}/);
});
