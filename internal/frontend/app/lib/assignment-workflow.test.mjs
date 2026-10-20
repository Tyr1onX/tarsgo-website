import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("./dashboard-navigation.ts", import.meta.url), "utf8");
const backendRoutes = await readFile(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
const assignmentService = await readFile(new URL("../../../backend/service/assignment/service.go", import.meta.url), "utf8");
const assignmentFiles = await readFile(new URL("../../../backend/service/assignment/file_store.go", import.meta.url), "utf8");
const migrations = await readFile(new URL("../../../backend/database/migrations.go", import.meta.url), "utf8");
const assignmentManagement = await readFile(new URL("../routes/admin/assignment-management.tsx", import.meta.url), "utf8");
const assignmentGroups = await readFile(new URL("./use-assignment-groups.ts", import.meta.url), "utf8");

test("workbench exposes member work to technical members and all manager routes to super-admins", () => {
  assert.match(routes, /route\("assignments", "routes\/dashboard\/assignments\.tsx"\)/);
  assert.match(routes, /route\("admin\/training\/assignments", "routes\/admin\/assignment-management\.tsx"\)/);
  assert.match(routes, /route\("admin\/training\/submissions", "routes\/admin\/assignment-submissions\.tsx"\)/);
  assert.match(navigation, /new Set\(\["机械组", "电控组", "视觉组", "AI组"\]\)/);
  assert.match(navigation, /if \(roleName === "super_admin"\) return true/);
  assert.match(layout, /pathname === "\/dashboard\/assignments" && !hasTechnicalGroup/);
  assert.match(layout, /canAccessDashboardAdminPath\(currentUser, pathname, hasTechnicalGroup, hasSkillGroup\)/);
  assert.match(navigation, /hasTechnicalGroup && \["user", "admin", "super_admin"\]/);
  assert.match(assignmentGroups, /roleName === "super_admin"/);
  assert.match(assignmentGroups, /listAdminUserGroupOptions/);
  assert.match(assignmentGroups, /group\.status === 1 && isTechnicalGroupName\(group\.name\)/);
});

test("backend applies role, current group, target, and ownership checks to every operation", () => {
  assert.match(backendRoutes, /assignmentMemberAPI\.Use\(middleware\.RequireAuthenticated\(authService\)\)/);
  assert.match(backendRoutes, /adminAPI\.Use\(middleware\.RequireAdmin\(authService\)\)[\s\S]*?adminAPI\.POST\("\/assignments"/);
  assert.match(assignmentService, /user_groups\.name IN \? AND user_groups\.status = \? AND users\.status = \?/);
  assert.match(assignmentService, /user_group_members\.user_id = \? AND user_groups\.name IN \?/);
  assert.match(assignmentService, /assignment_targets\.user_id = \? AND assignments\.group_id IN \?/);
  assert.match(assignmentService, /case model\.RoleNameAdmin, model\.RoleNameSuperAdmin:[\s\S]*?case model\.RoleNameUser:/);
  assert.match(assignmentService, /if err := s\.requireGroupAccess\(ctx, actor\.ID, item\.GroupID\); err != nil/);
  assert.match(assignmentService, /func managerTechnicalGroupIDs\(db \*gorm\.DB, actor Actor\)/);
  assert.match(assignmentService, /if actor\.RoleName != model\.RoleNameSuperAdmin/);
  assert.match(assignmentService, /requireManagerGroupAccessWithDB\(tx, actor, item\.GroupID\)/);
});

test("successful publishing remains visible if the following list refresh fails", () => {
  assert.match(assignmentManagement, /const saved = editing[\s\S]*?assignmentClient\.create\(input\)/);
  assert.match(assignmentManagement, /setItems\(\(current\) => wasEditing[\s\S]*?\[saved, \.\.\.current\.filter/);
  assert.match(assignmentManagement, /作业已保存，但列表刷新失败/);
  assert.match(assignmentManagement, /async function refresh\(\)[\s\S]*?listAdmin\(groupId\)/);
});

test("specified recipients can be searched, removed, and retained across search changes", () => {
  assert.match(assignmentManagement, /type="search"[\s\S]*?搜索成员姓名/);
  assert.match(assignmentManagement, /已选 \{draft\.targetUserIds\.length\} 人/);
  assert.match(assignmentManagement, /取消选择\$\{member\.name\}/);
  assert.match(assignmentManagement, /清空搜索/);
  assert.match(assignmentManagement, /没有匹配成员/);
  assert.match(assignmentManagement, /filterAssignmentMembers\(members, memberSearch\)/);
  assert.match(assignmentManagement, /targetUserIds: toggleAssignmentMemberSelection/);
});

test("submissions and grading keep prior attempts, use Beijing deadlines, and protect uploaded files", () => {
  assert.match(assignmentService, /Attempt: attempt/);
  assert.match(assignmentService, /now\.After\(readStoredUTCWall\(item\.DueAt\)\)/);
  assert.match(assignmentService, /tx\.Create\(&review\)/);
  assert.match(assignmentService, /loadSubmissionHistories/);
  assert.match(assignmentFiles, /maxAssignmentFiles\s*=\s*10/);
  assert.match(assignmentFiles, /maxAssignmentFileSize\s*=\s*20 << 20/);
  assert.match(assignmentFiles, /maxAssignmentFilesTotal\s*=\s*50 << 20/);
  assert.match(assignmentFiles, /func matchesAssignmentFileSignature/);
  assert.match(assignmentFiles, /func \(s \*assignmentFileStore\) resolve/);
});

test("migration 18 creates only new assignment tables without rewriting existing data", () => {
  const start = migrations.indexOf("{version: 18");
  const end = migrations.indexOf("\n\t\t}},", start);
  const migration18 = migrations.slice(start, end);
  assert.match(migration18, /AutoMigrate\([\s\S]*&model\.Assignment\{\}[\s\S]*&model\.AssignmentReview\{\}/);
  assert.doesNotMatch(migration18, /UPDATE\s+|DELETE\s+|DROP\s+/i);
});
