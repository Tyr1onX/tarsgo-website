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
const editorDialog = await source("../components/community-editor-dialog.tsx");
const replyComposer = await source("../components/community-reply-composer.tsx");
const relatedTopics = await source("../components/community-related-topics.tsx");
const growthUI = await source("../components/community-growth.tsx");
const growthStyles = await source("../components/community-growth.css");
const profile = await source("../components/personal-profile-settings.tsx");
const postCard = await source("../components/community-post-card.tsx");
const authorProfile = await source("../components/community-author-profile.tsx");
const badgeInfo = await source("../components/community-badge-mark.tsx");
const memberProfilePage = await source("../routes/dashboard/community-member-profile.tsx");
const memberProfileClient = await source("./community-member-profile-client.ts");
const markdownEditor = await source("../components/community-markdown-editor.tsx");
const markdownRenderer = await source("../components/community-markdown.tsx");
const markdown = await source("./community-markdown.ts");
const communityUploads = await source("../../../backend/service/trainingqa/community_uploads.go");
const handler = await source("../../../backend/handler/community.go");
const router = await source("../../../backend/router/router.go");
const service = await source("../../../backend/service/trainingqa/community.go");
const memberProfileService = await source("../../../backend/service/trainingqa/community_member_profile.go");
const model = await source("../../../backend/model/training_question.go");
const migrations = await source("../../../backend/database/migrations.go");

test("workbench home is the community and public home stays separately routed", () => {
  assert.match(routes, /index\("routes\/home\.tsx"\)/);
  assert.match(routes, /index\("routes\/dashboard\/index\.tsx"\)/);
  assert.match(routes, /route\("community\/:id", "routes\/dashboard\/community-post\.tsx"\)/);
  assert.match(routes, /route\("members\/:id", "routes\/dashboard\/community-member-profile\.tsx"\)/);
  assert.match(dashboard, /吉甲社区/);
  assert.match(navigation, /key: "community", label: "社区", href: "\/dashboard", iconKey: "community"/);
  const primaryNavigation = navigation.match(/const DASHBOARD_SECTION_MENU:[\s\S]*?\];/)?.[0] ?? "";
  assert.doesNotMatch(primaryNavigation, /"\/dashboard\/questions"/);
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
  assert.match(dashboard, /communityReturnTo/);
  assert.match(dashboard, /communityClient\.create/);
  assert.match(client, /addComment/);
  assert.match(client, /updateComment/);
  assert.match(client, /bookmark/);
  assert.match(client, /moderate/);
  assert.match(replyComposer, /parentPostId: replyTarget\?\.id/);
  assert.match(thread, /communityClient\.update\(/);
  assert.match(thread, /communityClient\.remove\(/);
  assert.match(thread, /communityClient\.moderate\(/);
  assert.match(thread, /community-comment__context/);
  assert.match(thread, /scrollIntoView/);
  assert.match(thread, /removeCommunityPostFromLists/);
});

test("community cache remains bounded and invalidates stale favorites and deleted posts", () => {
  assert.match(listCache, /MAX_CACHED_FILTERS = 10/);
  assert.match(listCache, /export function clearCommunityLists/);
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
  assert.match(draft, /uploadTokens\?: string\[\]/);
  assert.match(draft, /loadCommunityDraft/);
  assert.match(draft, /saveCommunityDraft/);
  assert.match(draft, /clearCommunityDraft/);
  assert.match(composer, /loadCommunityDraft\(accountId\)/);
  assert.match(composer, /草稿已保存到此设备/);
  assert.match(composer, /CommunityMarkdownEditor/);
  assert.match(composer, /uploadTokens: draft\.uploads\.map/);
  assert.match(dashboard, /CommunityEditorDialog/);
  assert.match(editorDialog, /aria-modal="true"/);
  assert.match(editorDialog, /event\.key === "Escape"/);
  assert.match(editorDialog, /onMouseDown/);
});

test("reply editor floats above the thread and restores drafts by account and topic", () => {
  assert.match(replyComposer, /loadCommunityReplyDraft\(accountId, postId\)/);
  assert.match(replyComposer, /saveCommunityReplyDraft\(accountId, postId/);
  assert.match(replyComposer, /clearCommunityReplyDraft\(accountId, postId\)/);
  assert.match(replyComposer, /parentPostId: replyTarget\?\.id/);
  assert.match(replyComposer, /CommunityMarkdownEditor/);
  assert.match(replyComposer, /uploads=\{uploads\}/);
  assert.match(thread, /CommunityReplyComposer accountId=\{currentUser\.id\}/);
  assert.match(thread, /navigate\(\{ pathname: location\.pathname, search: location\.search, hash: `#community-comment-/);
  assert.doesNotMatch(thread, /className="community-thread-composer"/);
  assert.match(styles, /\.community-reply-panel \{ position: fixed/);
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*?\.community-reply-panel \{ right: 0; bottom: 0/);
});

test("related topics load near the end and stay inside the server visibility scope", () => {
  assert.match(client, /related: \(id: number\) => apiRequest/);
  assert.match(relatedTopics, /rootMargin: "480px 0px"/);
  assert.match(relatedTopics, /communityClient\.related\(postId\)/);
  assert.match(relatedTopics, /相关话题/);
  assert.match(relatedTopics, /推荐话题/);
  assert.match(relatedTopics, /item\.commentCount/);
  assert.match(relatedTopics, /item\.viewCount/);
  assert.match(relatedTopics, /communityPostHref\(item\.id\)/);
  assert.match(router, /communityAPI\.GET\("\/posts\/:id\/related", communityHandler\.Related\)/);
  assert.match(service, /func \(s \*Service\) RelatedCommunityPosts/);
  assert.match(service, /s\.requireVisible\(ctx, actor, question\)/);
  assert.match(service, /s\.communityPostQuery\(ctx, actor\)/);
  assert.match(service, /query = query\.Where\("q\.is_hidden = \?", false\)/);
});

test("the same Markdown editor is used for publishing, post edits, replies, and comment edits", () => {
  assert.match(composer, /<CommunityMarkdownEditor/);
  assert.match(thread, /<CommunityMarkdownEditor[^>]+attachments=\{post\.attachments\}/);
  assert.match(thread, /<CommunityMarkdownEditor[^>]+attachments=\{item\.attachments\}/);
  assert.match(replyComposer, /uploads=\{uploads\}/);
  assert.match(thread, /uploads=\{editCommentUploads\}/);
  assert.match(thread, /<CommunityMarkdown source=\{post\.body\}/);
  assert.match(thread, /<CommunityMarkdown source=\{item\.body\}/);
  assert.match(postCard, /community-topic-row__title/);
  assert.doesNotMatch(postCard, /stripCommunityMarkdown|communityStandaloneAttachments|community-post__excerpt/);
});

test("community home shows compact topic rows with recent linked participants and server view counts", () => {
  assert.match(postCard, /post\.participants\?\.slice\(0, 5\)/);
  assert.match(postCard, /dashboard\/members\/\$\{participant\.id\}/);
  assert.match(postCard, /communityProfileReturnTo/);
  assert.match(postCard, /\{post\.commentCount\} 回复/);
  assert.match(postCard, /post\.viewCount \?\? 0/);
  assert.match(postCard, /post\.lastReplyAt \?\? post\.createdAt/);
  assert.doesNotMatch(postCard, /community-post__actions|community-image-gallery|post\.body/);
  assert.match(client, /viewCount\?: number/);
  assert.match(client, /participants\?: CommunityParticipant\[\]/);
  assert.match(service, /ROW_NUMBER\(\) OVER/);
  assert.match(service, /participant_rank <= 5/);
  assert.match(service, /COUNT\(\*\) FROM community_post_views pv/);
  assert.match(service, /CommunityPostViewRecord/);
  assert.match(styles, /\.community-topic-row \{/);
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*?\.community-topic-row \{ grid-template-columns: minmax\(0, 1fr\)/);
});

test("rich editor surfaces are not nested in labels that steal focus from paste", () => {
  assert.match(composer, /<div className="community-field community-field--editor"><span>正文<\/span>/);
  assert.match(thread, /<div className="community-field community-field--editor"><span>正文<\/span>/);
  assert.doesNotMatch(composer, /<label className="community-field community-field--editor"/);
  assert.doesNotMatch(thread, /<label className="community-field community-field--editor"/);
});

test("pinned posts expose an admin-only keyboard-accessible menu and keep pinned-first ordering", () => {
  assert.match(postCard, /post\.canModerate && onModerate/);
  assert.match(postCard, /aria-label="更多帖子操作"/);
  assert.match(postCard, /role="menuitem"/);
  assert.match(postCard, /onModerate\(\{ pinned: !post\.isPinned \}\)/);
  assert.match(service, /q\.is_pinned DESC, recent_interactions DESC/);
  assert.match(service, /q\.is_pinned DESC, COALESCE\(q\.last_reply_at, q\.created_at\) DESC/);
  assert.match(thread, /<CommunityPostMenu/);
  assert.ok(styles.indexOf(".community-post-menu { position: relative; z-index: 20; display: inline-flex; flex: none; margin-left: 2px; }") < styles.lastIndexOf(".community-post-menu { margin-left: auto; }"), "mobile alignment must override the base menu margin");
});

test("community identity uses current positions and offers badge details with automatic highest-tier selection", () => {
  assert.match(client, /authorPositions\?: import\("~\/lib\/community-member-profile-client"\)\.CommunityMemberPosition\[\]/);
  assert.match(authorProfile, /positions: authorPositions = \[\]/);
  assert.match(authorProfile, /const positionLabel = primaryPosition\?\.title/);
  assert.match(authorProfile, /positions\.map\(\(position\) => position\.title\)/);
  assert.doesNotMatch(authorProfile, /position\.categoryTitle/);
  assert.match(authorProfile, /CommunityBadgeInfo/);
  assert.match(badgeInfo, /role="dialog"/);
  assert.match(badgeInfo, /badge\.description/);
  assert.match(badgeInfo, /badge\.earnedAt/);
  assert.match(memberProfilePage, /setSelectedBadge\(next\.member\.featuredBadgeKey \?\? ""\)/);
  assert.match(memberProfilePage, /自动选择最高等级/);
  assert.match(memberProfileService, /resolveCommunityFeaturedBadge\(badge, publicProfile\.FeaturedBadgeKey\)/);
  assert.match(memberProfileService, /if badge == nil \|\| !badge\.IsEarned/);
});

test("the editor offers WYSIWYG and source preview, image upload, tables, tasks, undo, and image controls", () => {
  assert.match(markdownEditor, /@milkdown\/crepe/);
  assert.match(markdownEditor, /所见即所得/);
  assert.match(markdownEditor, /Markdown/);
  assert.match(markdownEditor, /uploadConfig\.key/);
  assert.match(markdownEditor, /community-upload:\/\//);
  assert.match(markdownEditor, /createTable\(ctx, 3, 3\)/);
  assert.match(markdownEditor, /任务清单/);
  assert.match(markdownEditor, /undoCommand/);
  assert.match(markdownEditor, /redoCommand/);
  assert.match(markdownEditor, /替代文本/);
  assert.match(markdownEditor, /对齐方式/);
  assert.match(markdownEditor, /实时预览/);
  assert.match(markdownRenderer, /remarkGfm/);
  assert.match(markdownRenderer, /skipHtml/);
  assert.match(markdownRenderer, /highlightedCode/);
  assert.match(markdownRenderer, /clipboard\.writeText/);
  assert.match(markdownRenderer, /role="dialog"/);
  assert.match(markdown, /safeCommunityMarkdownUrl/);
});

test("uploaded images remain bound to Markdown and are removed with deleted inline references", () => {
  assert.match(client, /uploadTokens: string\[\]/);
  assert.match(client, /body: postForm\(\{ category: input\.category/);
  assert.match(client, /body: postForm\(\{ body: value\.body/);
  assert.match(handler, /communityMultipartUploadTokens/);
  assert.match(communityUploads, /validateCommunityUploadBindings/);
  assert.match(communityUploads, /replaceCommunityUploadTokens/);
  assert.match(communityUploads, /removeDeletedInlineAttachments/);
  assert.match(communityUploads, /正文中的临时图片未随请求上传/);
});

test("community layout follows workbench themes and adapts its reading layout", () => {
  assert.match(styles, /\.community-page \{[\s\S]*?width: min\(100%, 900px\)/);
  assert.match(styles, /\.community-post-list \{ border-top: 1px solid var\(--admin-border-subtle\)/);
  assert.match(styles, /\.community-topic-row__activity \{ display: flex/);
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*?\.community-category-row \{ overflow-x: auto/);
  assert.doesNotMatch(styles, /\.community-rail/);
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
  assert.match(model, /type CommunityPostViewRecord struct/);
  assert.match(service, /Clauses\(clause\.OnConflict\{DoNothing: true\}\)\.Create\(&model\.CommunityPostViewRecord/);
});

test("community extends training Q&A storage and keeps migration additive", () => {
  assert.match(service, /q\.group_id IS NULL AND q\.visibility = \?/);
  assert.match(service, /communityVisibleLegacyGroupIDs/);
  assert.match(service, /question\.Visibility == model\.TrainingQuestionPrivate/);
  assert.match(service, /DeletedAt/);
  assert.match(migrations, /version: 37/);
  assert.match(migrations, /version: 40/);
  const start = migrations.indexOf("{version: 37");
  const end = migrations.indexOf("\n\t\t}},", start);
  const migration = migrations.slice(start, end);
  assert.match(migration, /&model\.TrainingQuestion\{\}/);
  assert.match(migration, /&model\.TrainingQuestionPost\{\}/);
  assert.match(migration, /&model\.CommunityPostReaction\{\}/);
  assert.doesNotMatch(migration, /DELETE\s+|DROP\s+/i);
});

test("community growth shows Beijing check-ins, author levels, and idempotent interaction rewards", async () => {
  const growthService = service + await source("../../../backend/service/trainingqa/community_growth.go");
  assert.match(dashboard, /<CommunityGrowthBar profile=\{growthProfile\}/);
  assert.match(profile, /<CommunityGrowthProfileSection\s*\/>/);
  assert.match(thread, /CommunityAuthorProfile id=\{item\.authorId\}/);
  assert.match(thread, /likeComment\(item\.id, active\)/);
  assert.match(thread, /setSolution\(item\.isAcceptedSolution \? null : item\.id\)/);
  assert.match(growthUI, /communityClient\.checkIn\(\)/);
  assert.match(growthUI, /升级成功，现为 Lv\./);
  assert.match(growthUI, /window\.addEventListener\("focus", refreshOnReturn\)/);
  assert.match(client, /includeGrowth/);
  assert.match(growthUI, /upcomingCheckIns\.map/);
  assert.match(growthUI, /xpToNextLevel/);
  assert.match(growthStyles, /prefers-reduced-motion: reduce/);
  assert.match(growthService, /Asia\/Shanghai/);
  assert.match(growthService, /communityCheckInXP/);
  assert.match(growthService, /CommunityLevelForXP/);
  assert.match(growthService, /uk_community_xp_source|source_key/);
  assert.match(router, /communityAPI\.POST\("\/check-in"/);
  assert.match(router, /communityAPI\.PUT\("\/comments\/:id\/like"/);
  assert.match(router, /communityAPI\.PATCH\("\/posts\/:id\/solution"/);
  assert.match(migrations, /version: 38/);
});

test("member profiles reuse community permissions, XP, and public badge records", async () => {
  const memberService = await source("../../../backend/service/trainingqa/community_member_profile.go");
  const badgeProjection = await source("../../../backend/service/cobuilderbadge/public.go");
  assert.match(router, /communityAPI\.GET\("\/members\/:id", communityHandler\.GetMemberProfile\)/);
  assert.match(router, /communityAPI\.PUT\("\/me\/profile", requireSameOriginRequest/);
  assert.match(memberProfileClient, /\/api\/community\/members\/\$\{memberID\}/);
  assert.match(memberService, /s\.communityPostQuery\(ctx, actor\)/);
  assert.match(memberService, /CommunityLevelForXP\(totalXP\)/);
  assert.match(memberService, /organization\.MemberPositions\(memberID\)/);
  assert.match(memberService, /FeaturedBadgeKey/);
  assert.doesNotMatch(badgeProjection, /GrantedByID|RevokedByID/);
  assert.match(authorProfile, /communityMemberProfileClient\.get\(id, "card"\)/);
  assert.match(authorProfile, /communityProfileReturnTo/);
  assert.match(memberProfilePage, /概览[\s\S]*帖子[\s\S]*回复[\s\S]*徽章/);
  assert.match(memberProfilePage, /updateMine\(\{ bio: bioDraft, featuredBadgeKey: selectedBadge \}\)/);
  assert.match(memberProfilePage, /preventScrollReset: true/);
  assert.match(memberProfilePage, /navigate\(-1\)/);
  assert.match(styles, /\.community-member-hero/);
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*?\.community-member-overview/);
});
