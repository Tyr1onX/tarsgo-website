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
const memberAssignments = await readFile(new URL("../routes/dashboard/assignments.tsx", import.meta.url), "utf8");
const assignmentClient = await readFile(new URL("./assignment-client.ts", import.meta.url), "utf8");
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
  assert.match(assignmentManagement, /if \(!wasEditing && uploadingMaterials\)[\s\S]*?assignmentClient\.publishWithMaterials/);
  assert.match(assignmentManagement, /setItems\(\(current\) => \[result\.assignment, \.\.\.current\.filter/);
  assert.match(assignmentManagement, /作业已完整发布，但列表刷新失败/);
  assert.match(assignmentManagement, /作业及教学资料已完整发布/);
  assert.match(assignmentManagement, /async function refresh\(\)[\s\S]*?listAdmin\(groupId\)/);
});

test("new assignments with teaching materials publish atomically and retry idempotently", () => {
  assert.match(backendRoutes, /adminAPI\.POST\("\/assignments\/publish", requireSameOriginRequest\(cfg\), assignmentHandler\.PublishWithMaterials\)/);
  assert.match(assignmentService, /func \(s \*Service\) CreateWithMaterialFiles/);
  assert.ok(assignmentService.includes('Where("publish_request_id = ?", requestID)'));
  assert.match(assignmentService, /storedPaths = append\(storedPaths, stored\.storagePath\)/);
  assert.match(assignmentService, /发布请求内容已变化/);
  assert.match(assignmentService, /发布作业及教学资料失败/);
  assert.match(assignmentClient, /Idempotency-Key/);
  assert.match(assignmentClient, /publishWithMaterials/);
  assert.match(assignmentManagement, /发布结果待确认/);
  assert.match(assignmentManagement, /const definitelyNotPublished = status >= 400 && status < 500 && status !== 409/);
  assert.match(assignmentManagement, /发布结果待确认：\$\{detail\}/);
  assert.match(assignmentManagement, /发布失败，作业未开放给成员/);
  assert.match(assignmentManagement, /取消发布/);
});

test("admin teaching materials stay separate from submissions and use permission-checked APIs", () => {
  assert.match(assignmentManagement, /type="file" multiple accept=\{assignmentMaterialAccept\}/);
  assert.match(assignmentManagement, /validateAssignmentMaterialSelection\(existingMaterials, pendingMaterials, incoming\)/);
  assert.match(assignmentManagement, /assignmentClient\.uploadMaterialFiles\(saved\.id, pendingMaterials/);
  assert.match(assignmentManagement, /已有成员提交，教学资料已锁定/);
  assert.match(assignmentClient, /\/api\/admin\/assignments\/\$\{id\}\/materials/);
  assert.match(assignmentClient, /\/api\/admin\/assignments\/\$\{assignmentId\}\/materials\/\$\{fileId\}/);
  assert.match(backendRoutes, /assignmentMemberAPI\.GET\("\/assignment-materials\/:id", assignmentHandler\.OpenMaterialFile\)/);
  assert.match(backendRoutes, /adminAPI\.POST\("\/assignments\/:id\/materials"/);
  assert.match(backendRoutes, /adminAPI\.DELETE\("\/assignments\/:id\/materials\/:fileId"/);
  assert.match(assignmentService, /if targetCount == 0 \{[\s\S]*?return nil, notFound\("教学资料不存在"\)/);
  assert.match(memberAssignments, /aria-labelledby="assignment-teaching-materials-title"/);
  assert.match(memberAssignments, /assignment\.materialFiles \?\? \[\]/);
});

test("Beijing deadlines default to seven days, support shortcuts, and validate before save", async () => {
  const deadline = await readFile(new URL("./assignment-deadline.ts", import.meta.url), "utf8");
  assert.match(assignmentManagement, /dueAt: assignmentDeadlineForShortcut\(new Date\(\), 7\)/);
  assert.match(assignmentManagement, /assignmentDeadlineShortcuts\.map/);
  assert.match(assignmentManagement, /onInput=\{\(event\) => updateDeadline\(event\.currentTarget\.value\)\}/);
  assert.match(assignmentManagement, /function updateDeadline\(value: string\)/);
  assert.match(assignmentManagement, /requestInput\(\{ \.\.\.draft, groupId \}\)/);
  assert.match(assignmentService, /if input\.DueAt\.IsZero\(\) \|\| !input\.DueAt\.After\(now\)/);
  assert.match(deadline, /Date\.UTC\(/);
  assert.match(deadline, /wallClock - SHANGHAI_OFFSET_MS/);
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

test("migration 24 adds only the teaching-material metadata table", () => {
  const start = migrations.indexOf("{version: 24");
  const end = migrations.indexOf("\n\t\t}},", start);
  const migration24 = migrations.slice(start, end);
  assert.match(migration24, /AutoMigrate\(&model\.AssignmentMaterialFile\{\}\)/);
  assert.doesNotMatch(migration24, /UPDATE\s+|DELETE\s+|DROP\s+/i);
});

test("migration 25 only adds nullable idempotency metadata to existing assignments", () => {
  const start = migrations.indexOf("{version: 25");
  const migration25 = migrations.slice(start);
  assert.match(migration25, /migrateAssignmentPublishIdempotency/);
  assert.match(migration25, /AddColumn\(&model\.Assignment\{\}, "PublishRequestID"\)/);
  assert.match(migration25, /AddColumn\(&model\.Assignment\{\}, "PublishRequestHash"\)/);
  assert.match(migration25, /CreateIndex\(&model\.Assignment\{\}, "PublishRequestID"\)/);
  assert.doesNotMatch(migration25, /UPDATE\s+assignments|DELETE\s+FROM\s+assignments|DROP\s+TABLE/i);
});
