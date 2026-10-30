import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("./dashboard-navigation.ts", import.meta.url), "utf8");
const backendRoutes = await readFile(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
const assignmentService = await readFile(new URL("../../../backend/service/assignment/service.go", import.meta.url), "utf8");
const assignmentFiles = await readFile(new URL("../../../backend/service/assignment/file_store.go", import.meta.url), "utf8");
const privateFiles = await readFile(new URL("../../../backend/service/privatefile/file_store.go", import.meta.url), "utf8");
const migrations = await readFile(new URL("../../../backend/database/migrations.go", import.meta.url), "utf8");
const assignmentManagement = await readFile(new URL("../routes/admin/assignment-management.tsx", import.meta.url), "utf8");
const assignmentSubmissions = await readFile(new URL("../routes/admin/assignment-submissions.tsx", import.meta.url), "utf8");
const assignmentModel = await readFile(new URL("../../../backend/model/assignment.go", import.meta.url), "utf8");
const memberAssignments = await readFile(new URL("../routes/dashboard/assignments.tsx", import.meta.url), "utf8");
const assignmentClient = await readFile(new URL("./assignment-client.ts", import.meta.url), "utf8");
const assignmentGroups = await readFile(new URL("./use-assignment-groups.ts", import.meta.url), "utf8");
const practicePage = await readFile(new URL("../routes/dashboard/practice-projects.tsx", import.meta.url), "utf8");
const practiceService = await readFile(new URL("../../../backend/service/assignment/practice.go", import.meta.url), "utf8");
const skillsManagement = await readFile(new URL("../routes/admin/skill-route-management.tsx", import.meta.url), "utf8");
const skillGraph = await readFile(new URL("../components/skill-tree-graph.tsx", import.meta.url), "utf8");
const skillLayout = await readFile(new URL("./skill-tree-layout.ts", import.meta.url), "utf8");
const skillsClient = await readFile(new URL("./skills-client.ts", import.meta.url), "utf8");
const skillsService = await readFile(new URL("../../../backend/service/skills/service.go", import.meta.url), "utf8");
const cultivationPage = await readFile(new URL("../routes/admin/cultivation.tsx", import.meta.url), "utf8");
const cultivationService = await readFile(new URL("../../../backend/service/cultivation/service.go", import.meta.url), "utf8");

test("workbench exposes member work to technical members and all manager routes to super-admins", () => {
  assert.match(routes, /route\("assignments", "routes\/dashboard\/assignments\.tsx"\)/);
  assert.match(routes, /route\("admin\/training\/assignments", "routes\/admin\/assignment-management\.tsx"\)/);
  assert.match(routes, /route\("admin\/training\/submissions", "routes\/admin\/assignment-submissions\.tsx"\)/);
  assert.match(navigation, /new Set\(\["机械组", "电控组", "视觉组", "AI组"\]\)/);
  assert.match(navigation, /if \(roleName === "super_admin"\) return true/);
  assert.match(layout, /pathname === "\/dashboard\/assignments" && !hasTechnicalGroup/);
  assert.match(layout, /canAccessDashboardAdminPath\(currentUser, pathname, hasTechnicalGroup, hasSkillGroup, hasCapabilityGroup\)/);
  assert.match(navigation, /hasTechnicalGroup && \["user", "admin", "super_admin"\]/);
  assert.match(assignmentGroups, /roleName === "super_admin"/);
  assert.match(assignmentGroups, /listAdminUserGroupOptions/);
  assert.match(assignmentGroups, /group\.status === 1 && isTechnicalGroupName\(group\.name\)/);
});

test("assignment member options are not cleared by unrelated loader revalidation", () => {
  assert.match(assignmentManagement, /setGroupId\(\(current\) => technicalGroups\.some/);
  assert.doesNotMatch(assignmentManagement, /groupResolution, technicalGroups\]\)/);
  assert.match(assignmentManagement, /setItems\(\[\]\);\s*setMembers\(\[\]\);\s*Promise\.all/);
  assert.match(assignmentManagement, /正在加载组内成员/);
});

test("practice creation validates the field and converts deadlines in Beijing time", () => {
  assert.match(practicePage, /assignmentDeadlineToISOString\(draft\.dueAt\)/);
  assert.match(practicePage, /assignmentDeadlineIsFuture\(draft\.dueAt,new Date\(\)\)/);
  assert.match(practicePage, /shanghaiDateTimeLocal\(selected\.dueAt\)/);
  assert.match(practicePage, /setDeadlineError\("截止时间必须晚于当前北京时间。"/);
  assert.doesNotMatch(practicePage, /new Date\(draft\.dueAt\)\.toISOString\(\)/);
  assert.match(practiceService, /return practiceBad\("截止时间必须晚于当前北京时间"\)/);
});

test("backend applies role, current group, target, and ownership checks to every operation", () => {
  assert.match(backendRoutes, /assignmentMemberAPI\.Use\(middleware\.RequireAuthenticated\(authService\)\)/);
  assert.match(backendRoutes, /adminAPI\.Use\(middleware\.RequireAdmin\(authService\)\)[\s\S]*?adminAPI\.POST\("\/assignments"/);
  assert.match(assignmentService, /user_groups\.name IN \? AND user_groups\.status = \? AND users\.status = \?/);
  assert.match(assignmentService, /JOIN roles ON roles\.id = users\.role_id[\s\S]*?roles\.name = \?"/);
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

test("targeted assignments default to false and keep their saved recipients when edited", () => {
  assert.match(assignmentModel, /IsGroupWide\s+bool[\s\S]*?gorm:"column:is_group_wide;type:tinyint\(1\);not null;default:0"/);
  assert.match(migrations, /\{version: 26, apply: migrateAssignmentGroupWideDefault\}/);
  assert.match(migrations, /func migrateAssignmentGroupWideDefault\(db \*gorm\.DB\) error[\s\S]*?AlterColumn\(&model\.Assignment\{\}, "IsGroupWide"\)/);
  assert.match(assignmentManagement, /setDraft\(\(current\) => \(\{ \.\.\.current, targetUserIds: detail\.members\.map\(\(member\) => member\.userId\) \}\)\)/);
  assert.match(assignmentService, /if input\.IsGroupWide != item\.IsGroupWide[\s\S]*?接收范围在发布时确定/);
  assert.match(assignmentService, /接收范围在发布时确定/);
  assert.match(assignmentManagement, /接收范围在发布时确定[\s\S]*?另建作业/);
  assert.match(assignmentManagement, /Boolean\(editing\)/);
});

test("assignment lifecycle retains history, blocks submissions after withdrawal, and guards deletion", () => {
  assert.match(backendRoutes, /adminAPI\.PATCH\("\/assignments\/:id\/status", requireSameOriginRequest\(cfg\), assignmentHandler\.SetPublicationStatus\)/);
  assert.match(backendRoutes, /adminAPI\.DELETE\("\/assignments\/:id", requireSameOriginRequest\(cfg\), assignmentHandler\.Delete\)/);
  assert.match(assignmentService, /func \(s \*Service\) SetPublicationStatus/);
  assert.match(assignmentService, /func \(s \*Service\) Delete/);
  assert.match(assignmentService, /作业已撤回，当前不能提交或重新提交/);
  assert.match(assignmentService, /请先撤回作业，再删除/);
  assert.match(assignmentService, /已有提交、审核、技能关联或成长依据/);
  assert.match(assignmentService, /PublicationStatus: model\.AssignmentPublicationPublished/);
  assert.match(assignmentManagement, /assignmentPublicationStatusLabel/);
  assert.match(assignmentManagement, /确定撤回/);
  assert.match(assignmentManagement, /确定永久删除/);
  assert.match(assignmentManagement, /重新发布/);
  assert.match(memberAssignments, /assignment\.publicationStatus !== "withdrawn"/);
  assert.match(memberAssignments, /作业已撤回，无法继续提交/);
});

test("cultivation shows joining years and activity instead of incomplete score rankings", () => {
  assert.match(cultivationService, /user_group_members\.joined_at/);
  assert.match(cultivationService, /JoinedYear: row\.JoinedAt\.Year\(\)/);
  assert.doesNotMatch(cultivationService, /left\.OverallScore > \*right\.OverallScore/);
  assert.match(cultivationPage, /item\.joinedYear === activeYear/);
  assert.match(cultivationPage, /入组年份/);
  assert.doesNotMatch(cultivationPage, /<CapabilityRadar/);
  assert.doesNotMatch(cultivationPage, /item\.overallScore === null/);
});

test("skill graph shows the start on load and only blocks deletion for protected history or dependants", () => {
  assert.match(skillGraph, /scrollTo\(\{ left: 0, top: 0, behavior: "auto" \}\)/);
  assert.doesNotMatch(skillGraph, /if \(selectedID !== null\) focusSelected\(\)/);
  assert.match(skillsService, /Where\("prerequisite_node_id = \?", nodeID\)/);
  assert.match(skillsService, /Delete\(&model\.SkillNodePrerequisite\{\}\)/);
  assert.match(skillsService, /Delete\(&model\.SkillNodeAssignment\{\}\)/);
});

test("skill graph auto-arranges dependencies, focuses context, and safely handles node removal", () => {
  assert.match(skillLayout, /barycenter sweeps/);
  assert.match(skillLayout, /channelX/);
  assert.match(skillGraph, /定位选中节点/);
  assert.match(skillGraph, /自动整理布局/);
  assert.doesNotMatch(skillGraph, /is-dimmed/);
  assert.match(skillGraph, /prefers-reduced-motion/);
  assert.match(skillsManagement, /同层排列顺序/);
  assert.match(skillsManagement, /只微调同层节点位置/);
  assert.match(skillsManagement, /async function autoArrangeLayout/);
  assert.match(skillsManagement, /async function deleteNode/);
  assert.match(skillsManagement, /删除节点/);
  assert.match(skillsClient, /reorderLayout/);
  assert.match(skillsClient, /deleteNode/);
  assert.match(skillsService, /func \(s \*Service\) ReorderNodes/);
  assert.match(skillsService, /func \(s \*Service\) DeleteNode/);
  assert.match(skillsService, /已有学习或审核历史，或被其他节点依赖/);
  assert.match(skillsService, /hasDependencyCycle\(graph\)/);
});

test("submission page distinguishes list loading, empty lists, detail loading, and no submissions", () => {
  assert.match(assignmentSubmissions, /const technicalGroupKey = technicalGroups\.map\(\(group\) => group\.groupId\)\.join\(","\)/);
  assert.match(assignmentSubmissions, /\[currentUser\.id, currentUser\.role\.name, technicalGroupKey\]/);
  assert.match(assignmentSubmissions, /\[groupId, currentUser\.id, currentUser\.role\.name, technicalGroupKey\]/);
  assert.match(assignmentSubmissions, /setListLoaded\(true\)/);
  assert.match(assignmentSubmissions, /listLoaded && !loading && !error && assignments\.length === 0/);
  assert.match(assignmentSubmissions, /listLoaded && assignments\.some\(\(item\) => item\.id === selectedID\) && detail\?\.assignment\.id === selectedID/);
  assert.match(assignmentSubmissions, /正在加载作业列表/);
  assert.match(assignmentSubmissions, /正在加载提交记录/);
  assert.match(assignmentSubmissions, /暂无成员提交/);
  assert.match(assignmentSubmissions, /role="alert" className="admin-notice admin-notice--error"/);
});

test("member feedback preserves comments and status without exposing scores", () => {
  assert.match(assignmentService, /Score\s+\*uint8\s+`json:"score,omitempty"`/);
  assert.match(assignmentService, /loadSubmissionHistories\(ctx, assignmentID, \[\]uint64\{userID\}, false\)/);
  assert.match(assignmentService, /s\.loadSubmissionHistories\(ctx, item\.ID, targetUserIDs, true\)/);
  assert.doesNotMatch(memberAssignments, /review\.score/);
  assert.match(memberAssignments, /assignmentDecisionLabel\(review\.decision\)/);
  assert.match(memberAssignments, /review\.comment/);
  assert.match(assignmentSubmissions, /review\.score/);
});

test("submissions and grading keep prior attempts, use Beijing deadlines, and protect uploaded files", () => {
  assert.match(assignmentService, /Attempt: attempt/);
  assert.match(assignmentService, /now\.After\(readStoredUTCWall\(item\.DueAt\)\)/);
  assert.match(assignmentService, /tx\.Create\(&review\)/);
  assert.match(assignmentService, /loadSubmissionHistories/);
  assert.match(assignmentFiles, /maxAssignmentFiles\s*=\s*privatefile\.MaxFiles/);
  assert.match(assignmentFiles, /maxAssignmentFileSize\s*=\s*privatefile\.MaxFileSize/);
  assert.match(assignmentFiles, /maxAssignmentFilesTotal\s*=\s*privatefile\.MaxFilesTotal/);
  assert.match(privateFiles, /MaxFiles\s*=\s*10/);
  assert.match(privateFiles, /MaxFileSize\s*=\s*20 << 20/);
  assert.match(privateFiles, /MaxFilesTotal\s*=\s*50 << 20/);
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
