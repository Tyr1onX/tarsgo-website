import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const routes = await source("../routes.ts");
const navigation = await source("./dashboard-navigation.ts");
const dashboard = await source("../routes/dashboard/index.tsx");
const thread = await source("../routes/dashboard/community-post.tsx");
const styles = await source("../routes/dashboard/community.css");
const client = await source("./community-client.ts");
const listCache = await source("./community-list-cache.ts");
const draft = await source("./community-draft.ts");
const gallery = await source("../components/community-image-gallery.tsx");
const composer = await source("../components/community-composer.tsx");
const handler = await source("../../../backend/handler/community.go");
const router = await source("../../../backend/router/router.go");
const service = await source("../../../backend/service/trainingqa/community.go");
const model = await source("../../../backend/model/training_question.go");
const migrations = await source("../../../backend/database/migrations.go");

test("workbench home is the community and public home stays separately routed", () => {
  assert.match(routes, /index\("routes\/home\.tsx"\)/);
  assert.match(routes, /index\("routes\/dashboard\/index\.tsx"\)/);
  assert.match(routes, /route\("community\/:id", "routes\/dashboard\/community-post\.tsx"\)/);
  assert.match(dashboard, /吉甲社区/);
  assert.match(navigation, /label: "吉甲社区"/);
  assert.doesNotMatch(navigation, /"\/dashboard\/questions"/);
});

test("legacy question links redirect into community discussions without a second Q&A area", async () => {
  const alias = await source("../routes/dashboard/community-question-redirect.tsx");
  assert.match(routes, /route\("questions", "routes\/dashboard\/community-question-redirect\.tsx"\)/);
  assert.match(alias, /`\/dashboard\/community\/\$\{id\}`/);
  assert.doesNotMatch(routes, /training-questions\.tsx|training-question-management\.tsx/);
});

test("community offers shareable filters, cached browsing, and the post discussion loop", () => {
  assert.match(dashboard, /useSearchParams/);
  assert.match(dashboard, /sort, category, q: query, saved: savedOnly, page: 1, pageSize: PAGE_SIZE/);
  assert.match(dashboard, /updateFilters\(\{ sort: "hot", saved: false \}\)/);
  assert.match(dashboard, /updateFilters\(\{ category: item\.id \}\)/);
  assert.match(dashboard, /getCommunityListSnapshot/);
  assert.match(dashboard, /rememberCommunityList/);
  assert.match(dashboard, /clearOtherCommunityLists/);
  assert.match(dashboard, /communityReturnTo/);
  assert.match(dashboard, /communityClient\.create/);
  assert.match(client, /addComment/);
  assert.match(client, /updateComment/);
  assert.match(client, /bookmark/);
  assert.match(client, /moderate/);
  assert.match(thread, /parentPostId: replyTarget\?\.id/);
  assert.match(thread, /communityClient\.update\(/);
  assert.match(thread, /communityClient\.remove\(/);
  assert.match(thread, /communityClient\.moderate\(/);
  assert.match(thread, /community-comment__context/);
  assert.match(thread, /scrollIntoView/);
  assert.match(thread, /removeCommunityPostFromLists/);
});

test("community cache remains bounded and invalidates stale favorites and deleted posts", () => {
  assert.match(listCache, /MAX_CACHED_FILTERS = 10/);
  assert.match(listCache, /clearOtherCommunityLists/);
  assert.match(listCache, /removeCommunityPostFromLists/);
});

test("community images open an accessible gallery with keyboard navigation", () => {
  assert.match(gallery, /role="dialog" aria-modal="true"/);
  assert.match(gallery, /ArrowLeft/);
  assert.match(gallery, /ArrowRight/);
  assert.match(gallery, /Escape/);
  assert.match(gallery, /setActiveIndex\(index\)/);
});

test("post drafts persist text and selected image files per account", () => {
  assert.match(draft, /indexedDB\.open/);
  assert.match(draft, /files: File\[\]/);
  assert.match(draft, /loadCommunityDraft/);
  assert.match(draft, /saveCommunityDraft/);
  assert.match(draft, /clearCommunityDraft/);
  assert.match(composer, /loadCommunityDraft\(accountId\)/);
  assert.match(composer, /草稿已保存到此设备/);
  assert.match(composer, /communityImageHint/);
});

test("community layout follows workbench themes and adapts its reading layout", () => {
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) 238px/);
  assert.match(styles, /@media \(max-width: 1023px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*?\.community-rail \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /var\(--admin-surface\)/);
  assert.match(styles, /var\(--admin-text\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /:focus-visible/);
});

test("mutations are authenticated and reaction uniqueness prevents duplicate counts", () => {
  assert.match(router, /authenticatedAPI\.Use\(middleware\.RequireAuthenticated\(authService\)\)/);
  assert.match(router, /communityAPI\.POST\("\/posts", requireSameOriginRequest/);
  assert.match(handler, /currentTrainingQuestionActor\(c\)/);
  assert.match(service, /clause\.OnConflict\{DoNothing: true\}/);
  assert.match(model, /type CommunityPostReaction struct/);
  assert.match(model, /QuestionID\s+uint64[\s\S]*UserID\s+uint64[\s\S]*Kind\s+string/);
});

test("community extends training Q&A storage and keeps migration additive", () => {
  assert.match(service, /q\.group_id IS NULL AND q\.visibility = \?/);
  assert.match(service, /communityVisibleLegacyGroupIDs/);
  assert.match(service, /question\.Visibility == model\.TrainingQuestionPrivate/);
  assert.match(service, /DeletedAt/);
  assert.match(migrations, /version: 37/);
  const start = migrations.indexOf("{version: 37");
  const end = migrations.indexOf("\n\t\t}},", start);
  const migration = migrations.slice(start, end);
  assert.match(migration, /&model\.TrainingQuestion\{\}/);
  assert.match(migration, /&model\.TrainingQuestionPost\{\}/);
  assert.match(migration, /&model\.CommunityPostReaction\{\}/);
  assert.doesNotMatch(migration, /DELETE\s+|DROP\s+/i);
});
