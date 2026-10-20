import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const routes = await source("../routes.ts");
const navigation = await source("./dashboard-navigation.ts");
const router = await source("../../../backend/router/router.go");
const service = await source("../../../backend/service/trainingqa/service.go");
const files = await source("../../../backend/service/trainingqa/files.go");
const model = await source("../../../backend/model/training_question.go");
const migrations = await source("../../../backend/database/migrations.go");
const thread = await source("../components/training-question-thread.tsx");
const memberRoute = await source("../routes/dashboard/training-questions.tsx");
const adminRoute = await source("../routes/admin/training-question-management.tsx");

test("training Q&A is integrated into the existing member and newcomer-training routes", () => {
  assert.match(routes, /route\("questions", "routes\/dashboard\/training-questions\.tsx"\)/);
  assert.match(routes, /route\("admin\/training\/questions", "routes\/admin\/training-question-management\.tsx"\)/);
  assert.match(navigation, /label: "提问答疑"[\s\S]*?href: "\/dashboard\/questions"/);
  assert.match(navigation, /label: "答疑管理"[\s\S]*?href: "\/dashboard\/admin\/training\/questions"/);
  assert.match(navigation, /hasTechnicalGroup && \["user", "admin", "super_admin"\]/);
});

test("member and admin Q&A routes keep derived group options stable during list loading", () => {
  for (const route of [memberRoute, adminRoute]) {
    assert.match(route, /const memberGroups = useMemo\([\s\S]*?\[groupResolution\?\.groups\]/);
  }
});

test("member writes are authenticated and same-origin; management routes require admin role", () => {
  assert.match(router, /assignmentMemberAPI\.Use\(middleware\.RequireAuthenticated\(authService\)\)[\s\S]*?GET\("\/questions"[\s\S]*?POST\("\/questions", requireSameOriginRequest/);
  assert.match(router, /adminAPI\.Use\(middleware\.RequireAdmin\(authService\)\)[\s\S]*?GET\("\/questions"[\s\S]*?PATCH\("\/questions\/:id\/faq", requireSameOriginRequest/);
});

test("service scopes member searches, private reads, manager writes and FAQ eligibility on the backend", () => {
  assert.match(service, /training_questions\.group_id IN \?/);
  assert.match(service, /training_questions\.visibility = \? OR training_questions\.asker_id = \?/);
  assert.match(service, /func \(s \*Service\) requireManagerGroupWithDB/);
  assert.match(service, /func \(s \*Service\) requireVisibleWithDB/);
  assert.match(service, /Only|只有已解决的公开问题可以加入 FAQ/);
  assert.match(service, /FAQ 需要至少一条回答/);
  assert.match(service, /requireVisible\(ctx, actor, question\)/);
  assert.match(service, /content, err := s\.files\.open\(file\.StoragePath\)/);
  assert.doesNotMatch(service, /\.Delete\(/);
});

test("Q&A attachments are private image files and discussion text renders without raw HTML", () => {
  assert.match(files, /maxQuestionFiles\s*=\s*5/);
  assert.match(files, /maxQuestionFileSize\s*=\s*10 << 20/);
  assert.match(files, /maxQuestionFilesTotal\s*=\s*20 << 20/);
  assert.match(files, /matchesQuestionImageSignature/);
  assert.match(files, /0o700/);
  assert.match(files, /0o600/);
  assert.match(model, /StoragePath\s+string\s+`json:"-"/);
  assert.doesNotMatch(thread, /dangerouslySetInnerHTML/);
  assert.match(thread, /<code>\{match\[2\]\}<\/code>/);
});

test("v19 only adds the Q&A tables while retaining existing v18 assignments", () => {
  assert.match(migrations, /\{version: 18[\s\S]*?&model\.Assignment\{\}[\s\S]*?&model\.AssignmentReview\{\}/);
  const start = migrations.indexOf("{version: 19");
  const end = migrations.indexOf("\n\t\t}},", start);
  const migration19 = migrations.slice(start, end);
  assert.match(migration19, /&model\.TrainingQuestion\{\}[\s\S]*&model\.TrainingQuestionPost\{\}[\s\S]*&model\.TrainingQuestionAttachment\{\}/);
  assert.doesNotMatch(migration19, /UPDATE\s+|DELETE\s+|DROP\s+/i);
});
