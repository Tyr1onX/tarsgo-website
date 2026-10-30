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

test("paused Q&A pages remain in source but reject direct frontend entry", () => {
  assert.match(routes, /route\("questions", "routes\/dashboard\/training-questions\.tsx"\)/);
  assert.match(routes, /route\("admin\/training\/questions", "routes\/admin\/training-question-management\.tsx"\)/);
  assert.doesNotMatch(navigation, /label: "提问答疑"|label: "答疑管理"/);
  assert.match(navigation, /"\/dashboard\/questions"/);
  assert.match(navigation, /"\/dashboard\/admin\/training\/questions"/);
  assert.match(navigation, /isTemporarilyUnavailableDashboardPath/);
});

test("member and admin Q&A routes keep derived group options stable during list loading", () => {
  for (const route of [memberRoute, adminRoute]) {
    assert.match(route, /const memberGroups = useMemo\([\s\S]*?\[groupResolution\?\.groups\]/);
  }
});

test("Q&A APIs are paused while service logic and historical schema remain", () => {
  assert.doesNotMatch(router, /trainingQuestionHandler|GET\("\/questions"|POST\("\/questions"/);
  assert.match(service, /func \(s \*Service\) Create/);
  assert.match(migrations, /&model\.TrainingQuestion\{\}/);
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
