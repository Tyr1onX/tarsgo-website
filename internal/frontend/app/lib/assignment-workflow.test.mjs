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
const feishuBitableHandler = await readFile(new URL("../../../backend/handler/feishu_bitable.go", import.meta.url), "utf8");
const assignmentGroups = await readFile(new URL("./use-assignment-groups.ts", import.meta.url), "utf8");

test("workbench exposes assignments to all five supported groups", () => {
  assert.match(routes, /route\("assignments", "routes\/dashboard\/assignments\.tsx"\)/);
  assert.match(routes, /route\("admin\/training\/assignments", "routes\/admin\/assignment-management\.tsx"\)/);
  assert.match(routes, /route\("admin\/training\/submissions", "routes\/admin\/assignment-submissions\.tsx"\)/);
  assert.match(assignmentSubmissions, /function AssignmentSubmissionsRedirect\(\)/);
  assert.match(assignmentSubmissions, /params\.set\("view", "review"\)/);
  assert.match(assignmentManagement, /<AssignmentReview key=\{groupId\} groupId=\{groupId\}/);
  assert.match(assignmentManagement, /批改中心<\/button>/);
  assert.match(assignmentManagement, /作业列表<\/button>/);
  assert.match(navigation, /if \(pathname === "\/dashboard\/admin\/training\/submissions"\)/);
  assert.doesNotMatch(navigation, /key: "assignment-submissions"/);
  assert.match(navigation, /const ASSIGNMENT_GROUP_NAMES = new Set\(\["机械组", "电控组", "视觉组", "AI组", "运营组"\]\)/);
  assert.match(navigation, /!item\.requiresAssignmentGroup \|\| roleName === "super_admin" \|\| hasAssignmentGroup/);
  assert.match(layout, /pathname === "\/dashboard\/assignments" && !hasAssignmentGroup/);
  assert.match(layout, /canAccessDashboardAdminPath\(currentUser, pathname, hasAssignmentGroup\)/);
  assert.match(navigation, /hasAssignmentGroup && roleName === "user"/);
  assert.match(assignmentGroups, /roleName === "super_admin"/);
  assert.match(assignmentGroups, /listAdminUserGroupOptions/);
  assert.match(assignmentGroups, /group\.status === 1 && isAssignmentGroupName\(group\.name\)/);
  assert.match(assignmentGroups, /return \{ assignmentGroups, error, loading:/);
});

test("assignment member options are not cleared by unrelated loader revalidation", () => {
  assert.match(assignmentManagement, /setGroupId\(\(current\) => assignmentGroups\.some/);
  assert.doesNotMatch(assignmentManagement, /groupResolution, technicalGroups\]\)/);
  assert.match(assignmentManagement, /setItems\(\[\]\);\s*setMembers\(\[\]\);\s*Promise\.all/);
  assert.match(assignmentManagement, /正在加载组内成员/);
});

test("backend applies role, current group, target, and ownership checks to every operation", () => {
  assert.match(backendRoutes, /assignmentMemberAPI\.Use\(middleware\.RequireAuthenticated\(authService\), middleware\.RequireWorkbench\(\)\)/);
  assert.match(backendRoutes, /adminAPI\.Use\(middleware\.RequireAdmin\(authService\), requireSameOriginRequest\(cfg\)\)[\s\S]*?adminAPI\.POST\("\/assignments"/);
  assert.match(assignmentService, /user_groups\.name IN \? AND user_groups\.status = \? AND users\.status = \?/);
  assert.match(assignmentService, /JOIN roles ON roles\.id = users\.role_id[\s\S]*?roles\.name = \?"/);
  assert.match(assignmentService, /user_group_members\.user_id = \? AND user_groups\.name IN \?/);
  assert.match(assignmentService, /assignments\.is_group_wide = 1 AND \?/);
  assert.match(assignmentService, /SELECT 1 FROM assignment_targets t WHERE t\.assignment_id = assignments\.id AND t\.user_id = \?/);
  assert.match(assignmentService, /actor\.RoleName == model\.RoleNameUser/);
  assert.match(assignmentService, /case model\.RoleNameAdmin, model\.RoleNameSuperAdmin:[\s\S]*?case model\.RoleNameUser:/);
  assert.match(assignmentService, /if err := s\.requireGroupAccess\(ctx, actor\.ID, item\.GroupID\); err != nil/);
  assert.match(assignmentService, /func managerAssignmentGroupIDs\(db \*gorm\.DB, actor Actor\)/);
  assert.match(assignmentService, /if actor\.RoleName != model\.RoleNameSuperAdmin/);
  assert.match(assignmentService, /requireManagerGroupAccessWithDB\(tx, actor, item\.GroupID\)/);
});

test("removed training workflows have no routes or API handlers while leave approvals stay protected", () => {
  assert.doesNotMatch(routes, /route\("(?:practice-projects|expedition|expedition\/projects|admin\/training\/(?:practice-projects|expedition|questions))"/);
  assert.match(layout, /currentPath\.pathname === "\/dashboard\/questions"/);
  assert.doesNotMatch(backendRoutes, /practiceHandler|trainingQuestionHandler|skillsHandler|capabilitiesHandler|cultivationHandler|expeditionHandler|growthHandler/);
  assert.match(backendRoutes, /superAdminAPI\.GET\("\/leave\/access-requests"/);
  assert.match(backendRoutes, /superAdminAPI\.PATCH\("\/leave\/access-requests\/:id"/);
  assert.match(backendRoutes, /leaveMemberAPI\.GET\("\/school-leave\/requests"/);
});

test("successful publishing remains visible if the following list refresh fails", () => {
  assert.match(assignmentManagement, /if \(!wasEditing && uploadingMaterials\)[\s\S]*?assignmentClient\.publishWithMaterials/);
  assert.match(assignmentManagement, /setItems\(\(current\) => \[result\.assignment, \.\.\.current\.filter/);
  assert.match(assignmentManagement, /作业已完整发布，但列表刷新失败/);
  assert.match(assignmentManagement, /作业及教学资料已完整发布/);
  assert.match(assignmentManagement, /async function refresh\(\)[\s\S]*?listAdmin\(groupId\)/);
});

test("new assignments with teaching materials publish atomically and retry idempotently", () => {
  assert.match(backendRoutes, /adminAPI\.POST\("\/assignments\/publish", assignmentHandler\.PublishWithMaterials\)/);
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
  assert.doesNotMatch(assignmentManagement, /accept=\{assignmentMaterialAccept\}/);
  assert.doesNotMatch(memberAssignments, /accept=\{fileAccept\}/);
  assert.match(assignmentManagement, /FileUploadField[\s\S]*?label="教学资料附件"[\s\S]*?multiple/);
  assert.match(assignmentManagement, /validateSelection=\{\(next\) => validateAssignmentMaterialSelection\(existingMaterials, \[\], next\)/);
  assert.match(assignmentManagement, /assignmentClient\.uploadMaterialFiles\(saved\.id, pendingMaterials/);
  assert.match(assignmentManagement, /已有成员提交，教学资料已锁定/);
  assert.match(assignmentClient, /\/api\/admin\/assignments\/\$\{id\}\/materials/);
  assert.match(assignmentClient, /\/api\/admin\/assignments\/\$\{assignmentId\}\/materials\/\$\{fileId\}/);
  assert.match(backendRoutes, /assignmentMemberAPI\.GET\("\/assignment-materials\/:id", assignmentHandler\.OpenMaterialFile\)/);
  assert.match(backendRoutes, /adminAPI\.POST\("\/assignments\/:id\/materials"/);
  assert.match(backendRoutes, /adminAPI\.DELETE\("\/assignments\/:id\/materials\/:fileId"/);
  assert.match(assignmentService, /assigned, err := s\.memberHasAssignment\(s\.db\.WithContext\(ctx\), actor, item\)/);
  assert.match(assignmentService, /if !assigned \{[\s\S]*?return nil, notFound\("教学资料不存在"\)/);
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

test("review center displays each assigned member in a single current progress category", () => {
  assert.match(assignmentSubmissions, /useState<"toSubmit" \| "toReview" \| "passed">\("toReview"\)/);
  assert.match(assignmentSubmissions, /member\.status === "pending" \|\| member\.status === "overdue" \|\| member\.status === "needs_redo"/);
  assert.match(assignmentSubmissions, /member\.status === "submitted"/);
  assert.match(assignmentSubmissions, /member\.status === "passed"/);
  assert.match(assignmentSubmissions, /const visibleMembers = submissionFilter === "toSubmit" \? toSubmit : submissionFilter === "toReview" \? toReview : passed/);
  assert.match(assignmentSubmissions, /label: "待提交（含返修）", count: toSubmit\.length/);
  assert.match(assignmentSubmissions, /label: "待批改", count: toReview\.length/);
  assert.match(assignmentSubmissions, /label: "已通过", count: passed\.length/);
  assert.doesNotMatch(assignmentSubmissions, /未提交 \{pendingMembers\.length\} 人/);
  assert.match(assignmentSubmissions, /aria-pressed=\{submissionFilter === value\}/);
  assert.match(assignmentSubmissions, /visibleMembers\.map\(\(member\) =>/);
});

test("saving a new review opens the next current submission without interrupting corrections", () => {
  assert.match(assignmentSubmissions, /const wasCorrection = detail\?\.members\.some\(/);
  assert.match(assignmentSubmissions, /const next = wasCorrection \? undefined : updated\.members\.find\(\(member\) => member\.status === "submitted"\)\?\.latestSubmission/);
  assert.match(assignmentSubmissions, /setEditingReviewID\(next\?\.id \?\? 0\)/);
  assert.match(assignmentSubmissions, /setSubmissionFilter\("toReview"\)/);
  assert.match(assignmentSubmissions, /<input autoFocus className=\{fieldClass\} type="number"/);
});

test("website review reuses rich image editor and protects feedback media", () => {
  assert.match(assignmentSubmissions, /CommunityMarkdownEditor/);
  assert.match(assignmentSubmissions, /validateCommunityImageBindings/);
  assert.match(assignmentSubmissions, /setEditingReviewID/);
  assert.match(assignmentSubmissions, /visibleMembers\.map\(\(member\) =>/);
  assert.match(assignmentSubmissions, /提交与批改历史/);
  assert.match(assignmentClient, /body\.set\("uploadTokens", JSON\.stringify/);
  assert.match(assignmentClient, /body\.append\("files", file, file\.name\)/);
  assert.match(memberAssignments, /CommunityMarkdown source=\{review\.comment\}/);
  assert.match(backendRoutes, /assignmentMemberAPI\.GET\("\/assignment-review-images\/:id", assignmentHandler\.OpenReviewImage\)/);
  assert.match(assignmentService, /validateReviewImages\(input\.Comment, input\.ImageFiles, input\.UploadTokens\)/);
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
  assert.match(assignmentManagement, /指定成员名单已锁定。需要调整请另建作业。/);
  assert.match(assignmentManagement, /全组范围持续同步/);
  assert.match(assignmentManagement, /Boolean\(editing\)/);
});

test("latest targeted recipient shortcut reads the latest group assignment without extra persistence", () => {
  assert.match(assignmentManagement, /items\.find\(\(item\) => !item\.isGroupWide\)/);
  assert.match(assignmentManagement, /assignmentClient\.getAdmin\(lastTargetedAssignment\.id\)/);
  assert.match(assignmentManagement, /currentIDs\.has\(id\)/);
  assert.match(assignmentManagement, /上次指定的成员/);
  assert.match(assignmentManagement, /#\{member\.userId\}/);
  assert.match(assignmentSubmissions, /#\{member\.userId\}/);
});

test("Bitable repair syncs each authorized member history in a bounded sequential request", () => {
  const reconcile = assignmentManagement.slice(
    assignmentManagement.indexOf("async function reconcileFeishuBoard()"),
    assignmentManagement.indexOf("async function changePublicationStatus(", assignmentManagement.indexOf("async function reconcileFeishuBoard()")),
  );
  assert.match(reconcile, /assignmentClient\.listAdmin\(\)/);
  assert.match(reconcile, /assignmentClient\.getAdmin\(item\.id\)/);
  assert.match(reconcile, /for \(let index = 0; index < targets\.length; index\+\+\)/);
  assert.match(reconcile, /assignmentClient\.reconcileBitable\(target\.assignmentId, target\.memberId\)/);
  assert.match(assignmentClient, /reconcileBitable: \(assignmentId: number, memberId: number\)/);
  assert.match(feishuBitableHandler, /WithTimeout\(c\.Request\.Context\(\), 50\*time\.Second\)/);
  assert.match(feishuBitableHandler, /h\.assignments\.GetAdmin\(ctx, actor, assignmentID\)/);
  assert.match(feishuBitableHandler, /h\.syncBitableHistory\(ctx, token, actor, detail\.Assignment, \*target\)/);
});

test("assignment lifecycle retains history, blocks submissions after withdrawal, and guards deletion", () => {
  assert.match(backendRoutes, /adminAPI\.PATCH\("\/assignments\/:id\/status", assignmentHandler\.SetPublicationStatus\)/);
  assert.match(backendRoutes, /adminAPI\.DELETE\("\/assignments\/:id", assignmentHandler\.Delete\)/);
  assert.match(assignmentService, /func \(s \*Service\) SetPublicationStatus/);
  assert.match(assignmentService, /func \(s \*Service\) Delete/);
  assert.match(assignmentService, /func requireMemberAssignmentPublished\(item model\.Assignment\) error \{[\s\S]*?notFound\("作业不存在"\)/);
  assert.match(assignmentService, /请先撤回作业，再删除/);
  assert.match(assignmentService, /已有提交或审核记录/);
  assert.match(assignmentService, /PublicationStatus: model\.AssignmentPublicationPublished/);
  assert.match(assignmentManagement, /assignmentPublicationStatusLabel/);
  assert.match(assignmentManagement, /确定撤回/);
  assert.match(assignmentManagement, /确定永久删除/);
  assert.match(assignmentManagement, /重新发布/);
  assert.match(memberAssignments, /assignment\.publicationStatus !== "withdrawn"/);
  assert.match(memberAssignments, /作业已撤回，无法继续提交/);
});




test("review center uses the shared group and distinguishes loading and empty states", () => {
  assert.match(assignmentSubmissions, /export function AssignmentReview\(\{ groupId \}: \{ groupId: number \}\)/);
  assert.match(assignmentSubmissions, /\}, \[groupId\]\);/);
  assert.match(assignmentSubmissions, /setListLoaded\(true\)/);
  assert.match(assignmentSubmissions, /listLoaded && !loading && !error && assignments\.length === 0/);
  assert.match(assignmentSubmissions, /listLoaded && assignments\.some\(\(item\) => item\.id === selectedID\) && detail\?\.assignment\.id === selectedID/);
  assert.match(assignmentSubmissions, /正在加载作业列表/);
  assert.match(assignmentSubmissions, /正在加载提交记录/);
  assert.match(assignmentSubmissions, /当前没有待提交或返修的成员/);
  assert.match(assignmentSubmissions, /role="alert" className="admin-notice admin-notice--error"/);
});

test("member assignments sort actionable work, filter locally, and keep detail links in sync", () => {
  assert.match(memberAssignments, /const sorted = \[\.\.\.result\]\.sort\(\(a, b\) => assignmentPriority\(a\) - assignmentPriority\(b\)/);
  assert.match(memberAssignments, /case "overdue": return 0/);
  assert.match(memberAssignments, /case "needs_redo": return 1/);
  assert.match(memberAssignments, /case "pending": return 2/);
  assert.match(memberAssignments, /const visibleItems = items\.filter\(\(item\) => matchesFilter\(item, filter\)\)/);
  assert.match(memberAssignments, /aria-pressed=\{filter === value\} disabled=\{saving\}/);
  assert.match(memberAssignments, /next\.set\("assignmentId", String\(item\.id\)\)/);
  assert.match(memberAssignments, /setSearchParams\(\(current\) =>/);
  assert.match(memberAssignments, /visibleItems\.some\(\(item\) => item\.id === selectedID\)/);
});

test("successful member submission keeps the selected assignment visible and confirms completion", () => {
  assert.match(memberAssignments, /setDetail\(updated\);[\s\S]*?setFilter\(\(current\) => matchesFilter\(updated\.assignment, current\) \? current : "all"\)/);
  assert.match(memberAssignments, /setSubmittedAssignmentID\(updated\.assignment\.id\)/);
  assert.match(memberAssignments, /await loadAssignments\(updated\.assignment\.id, false\)/);
  assert.match(memberAssignments, /submittedAssignmentID === assignment\.id \? <p role="status"[\s\S]*?提交成功，等待批改/);
  assert.match(memberAssignments, /setSubmittedAssignmentID\(null\)/);
});

test("member assignment selection scrolls to details only on stacked mobile layout", () => {
  assert.match(memberAssignments, /scrollToDetailIDRef\.current = scrollOnMobile && window\.matchMedia\("\(max-width: 1279px\)"\)\.matches \? item\.id : null/);
  assert.match(memberAssignments, /onClick=\{\(\) => void selectAssignment\(item, true\)\}/);
  assert.match(memberAssignments, /if \(!detail \|\| scrollToDetailIDRef\.current !== detail\.assignment\.id\) return/);
  assert.match(memberAssignments, /detailPanelRef\.current\?\.scrollIntoView\(/);
  assert.match(memberAssignments, /prefers-reduced-motion: reduce/);
  assert.match(memberAssignments, /ref=\{detailPanelRef\} className="admin-panel scroll-mt-20/);
  assert.match(memberAssignments, /\}, \[detail\]\);/);
});

test("member upload errors stay beside the upload field and Feishu repair stays under maintenance", () => {
  assert.match(memberAssignments, /setSubmissionError\(cause instanceof ApiError/);
  assert.match(memberAssignments, /<p role="alert" className="text-sm text-\[var\(--admin-danger\)\]">\{submissionError\}<\/p>/);
  assert.match(assignmentManagement, /<details[^>]*>[\s\S]*?<summary[^>]*>维护操作<\/summary>[\s\S]*?修复飞书看板[\s\S]*?<\/details>/);
  assert.doesNotMatch(memberAssignments, /WorkbenchFeatureStatus/);
  assert.doesNotMatch(assignmentManagement, /WorkbenchFeatureStatus/);
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
  assert.match(assignmentFiles, /privatefile\.HashUpload\(header, true\)/);
  assert.doesNotMatch(assignmentFiles, /maxAssignmentFileSize|maxAssignmentFilesTotal/);
  assert.match(privateFiles, /MaxFiles\s*=\s*10/);
  assert.match(privateFiles, /MaxFileSize\s*=\s*20 << 20/);
  assert.match(privateFiles, /MaxFilesTotal\s*=\s*50 << 20/);
  assert.doesNotMatch(assignmentFiles, /func matchesAssignmentFileSignature/);
  assert.match(privateFiles, /ContentType: "application\/octet-stream"/);
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
  const end = migrations.indexOf("\n\t\t{version: 26", start);
  const helperStart = migrations.indexOf("func migrateAssignmentPublishIdempotency");
  const helperEnd = migrations.indexOf("\nfunc ", helperStart + 1);
  const migration25 = `${migrations.slice(start, end)}\n${migrations.slice(helperStart, helperEnd)}`;
  assert.match(migration25, /migrateAssignmentPublishIdempotency/);
  assert.match(migration25, /AddColumn\(&model\.Assignment\{\}, "PublishRequestID"\)/);
  assert.match(migration25, /AddColumn\(&model\.Assignment\{\}, "PublishRequestHash"\)/);
  assert.match(migration25, /CreateIndex\(&model\.Assignment\{\}, "PublishRequestID"\)/);
  assert.doesNotMatch(migration25, /UPDATE\s+assignments|DELETE\s+FROM\s+assignments|DROP\s+TABLE/i);
});

test("assignment management lists current work before opening the editor", () => {
  assert.match(assignmentManagement, /const \[composerOpen, setComposerOpen\] = useState\(false\)/);
  assert.match(assignmentManagement, /setGroupId\(nextGroupID\); resetDraft\(nextGroupID\); setSearchParams\(\{ view \}, \{ replace: true \}\); \}\}/);
  assert.doesNotMatch(assignmentManagement, /resetDraft\(nextGroupID\); setComposerOpen\(true\)/);
  assert.match(assignmentManagement, /\{!composerOpen \? <button type="button" className="admin-button admin-button--primary"[\s\S]*?>发布作业<\/button> : null\}/);
  assert.match(assignmentManagement, /view === "review" \? <Suspense/);
  assert.match(assignmentManagement, /view === "list" \? "is-active"/);
  assert.match(assignmentManagement, /assignments\?view=review&assignmentId=\$\{item\.id\}/);
  assert.match(assignmentSubmissions, /const toSubmit = detail\?\.members\.filter\(\(member\) => member\.status === "pending"/);
  assert.match(assignmentSubmissions, /items\.find\(\(item\) => item\.submittedCount > item\.reviewedCount\)/);
  assert.match(assignmentSubmissions, /待批改 \$\{item\.submittedCount - item\.reviewedCount\}/);
  assert.match(assignmentSubmissions, /label: "待提交（含返修）", count: toSubmit\.length/);
  assert.doesNotMatch(assignmentSubmissions, /未提交 \{pendingMembers\.length\} 人/);
  assert.match(assignmentManagement, /\{composerOpen \? <section className="admin-panel assignment-editor"/);
  assert.match(assignmentManagement, /assignment-editor__description[\s\S]*?assignment-editor__requirements[\s\S]*?assignment-editor__materials[\s\S]*?assignment-editor__recipients/);
  assert.match(assignmentManagement, /assignment-deadline-shortcuts/);
  assert.match(assignmentManagement, /!groupsLoading && groupId > 0 && !loading && !error && !groupError && items\.length === 0 \? <p[^>]*>本组尚未发布作业。/);
  assert.match(assignmentManagement, /assignment-list__actions/);
});

test("Feishu binding is completed from assignment management without a second account state", () => {
  assert.match(backendRoutes, /adminAPI\.GET\("\/integrations\/feishu\/binding-status", feishuReviewHandler\.FeishuBindingStatus\)/);
  assert.match(backendRoutes, /adminAPI\.POST\("\/integrations\/feishu\/link-code", feishuReviewHandler\.FeishuLinkCode\)/);
  assert.match(assignmentClient, /feishuBindingStatus: \(\) => apiRequest/);
  assert.match(assignmentClient, /createFeishuLinkCode: \(\) => apiRequest/);
  assert.match(assignmentManagement, /assignmentClient\.feishuBindingStatus\(\)/);
  assert.match(assignmentManagement, /assignmentClient\.createFeishuLinkCode\(\)/);
  assert.match(assignmentManagement, /navigator\.clipboard\.writeText\(feishuCommand\)/);
  assert.match(assignmentManagement, /https:\/\/applink\.feishu\.cn\/client\/bot\/open\?appId=/);
  assert.match(assignmentManagement, /window\.addEventListener\("focus", onReturn\)/);
  assert.match(assignmentManagement, /document\.addEventListener\("visibilitychange", onReturn\)/);
  assert.match(assignmentManagement, /onClick=\{\(\) => void copyFeishuCommand\(\)\}>复制命令并打开飞书/);
  assert.match(assignmentManagement, /catch\(\(cause: unknown\) => \{ if \(active\) setFeishuError/);
  assert.match(assignmentManagement, /飞书已绑定/);
  assert.match(assignmentManagement, /feishuPanelAccount === currentUser\.id && !feishuBound/);
});

test("student submission precedes collapsible history while redo feedback stays visible", () => {
  const feedback = memberAssignments.indexOf('aria-label="返修意见"');
  const submission = memberAssignments.indexOf('assignment.status === "submitted" && canSubmit ? <details');
  const history = memberAssignments.indexOf('id="assignment-history-title"');
  assert.ok(feedback > 0 && feedback < submission && submission < history);
  assert.match(memberAssignments, /assignment\.status === "needs_redo"/);
  assert.match(memberAssignments, /<details key=\{assignment\.id\} className="space-y-3" aria-labelledby="assignment-history-title">/);
  assert.match(memberAssignments, /detail\.submissions\.length > 0 \? <details/);
  assert.match(memberAssignments, /CommunityMarkdown source=\{latestFeedback\}/);
});

test("submission deadline changes update the page without hiding server errors", () => {
  assert.match(memberAssignments, /const \[now, setNow\] = useState\(Date\.now\)/);
  assert.match(memberAssignments, /const remaining = new Date\(detail\.assignment\.dueAt\)\.getTime\(\) - Date\.now\(\)/);
  assert.match(memberAssignments, /window\.setTimeout\(refresh, remaining \+ 1\)/);
  assert.match(memberAssignments, /window\.addEventListener\("focus", refresh\)/);
  assert.match(memberAssignments, /window\.clearTimeout\(timer\)/);
  assert.match(memberAssignments, /\!detail\?\.submissions\.length \|\| now <= new Date\(assignment\.dueAt\)\.getTime\(\)/);

  const formEnd = memberAssignments.indexOf("  ) : null;\n\n  return (");
  const visibleError = memberAssignments.indexOf('{submissionError ? <p role="alert"');
  const submitChoice = memberAssignments.indexOf('assignment.status === "submitted" && canSubmit ? <details');
  assert.ok(formEnd > 0 && visibleError > formEnd && submitChoice > visibleError,
    "Submission errors must stay outside the conditional form and before the submit action");
});

test("member actions distinguish first submission, waiting for review, redo, and completion", () => {
  assert.match(memberAssignments, /const submissionForm = canSubmit \? \(/);
  assert.match(memberAssignments, /assignment\?\.status === "needs_redo" \? "重新提交"/);
  assert.match(memberAssignments, /assignment\?\.status === "submitted" \? "更新提交"/);
  assert.match(memberAssignments, /item\.status === "submitted" \? "待批改"/);
  assert.match(memberAssignments, /assignment\.status === "submitted" \? "已提交，等待批改"/);
  assert.match(memberAssignments, /assignment\.status === "submitted" && canSubmit \? <details key=\{detail\.submissions\.at\(-1\)\?\.id\}/);
  assert.match(memberAssignments, /<summary[^>]*>更新已提交的附件<\/summary>/);
  assert.match(memberAssignments, /assignment\.status === "submitted" \? null : submissionForm/);
  assert.match(memberAssignments, /assignment\.status === "needs_redo" && !canSubmit && assignment\.publicationStatus !== "withdrawn"/);
  assert.match(memberAssignments, /已过截止时间，无法重新提交/);
  assert.match(memberAssignments, /assignment\.status !== "passed"/);
  assert.match(assignmentService, /if latestErr == nil \{\s+if now\.After\(readStoredUTCWall\(item\.DueAt\)\)/);
  assert.match(assignmentService, /review\.Decision == model\.AssignmentReviewPassed/);
});
