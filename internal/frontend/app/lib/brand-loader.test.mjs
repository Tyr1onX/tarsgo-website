import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const component = await read("../components/brand-loader.tsx");
const css = await read("../components/brand-loader.css");
const logo = await read("../../../../public/assets/images/Logo/tarsgo-logo-v5-light.svg");
const robot = await read("../../../../public/assets/images/Logo/tarsgo-robot-loading.svg");

test("loader renders the authentic TARSGO robot as an image, without the wordmark", () => {
  const originalRobot = logo.match(/<g id="robot-TARS"[\s\S]*?<\/g>/)?.[0];
  assert.ok(originalRobot, "the official logo must contain its robot symbol");
  assert.ok(robot.includes(originalRobot), "the transparent loader icon retains the official geometry");
  assert.doesNotMatch(robot, /wordmark-TARSGO|<rect\b/);
  assert.match(component, /tarsgo-robot-loading\.svg/);
  assert.match(component, /<img className="brand-loader__robot" src=\{robotImage\} alt="" \/>/);
  assert.equal((component.match(/<img /g) ?? []).length, 1);
  assert.doesNotMatch(component, /<use href=/);
  assert.match(component, /role="status" aria-label=\{label\}/);
});

test("transparent robot pulses without blur or masks and respects reduced motion", () => {
  assert.match(css, /brand-loader-appear 0s 300ms both/);
  assert.match(css, /brand-loader-pulse 1\.8s ease-in-out infinite/);
  assert.doesNotMatch(css, /mask-image|filter: blur|brand-loader__robot--base|brand-loader__robot--shine/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("shared robot loader remains in pages with independent loading indicators", async () => {
  const pages = [
    "../root.tsx",
    "../routes/base.tsx",
    "../routes/dashboard/index.tsx",
    "../routes/dashboard/community-post.tsx",
    "../routes/dashboard/assignments.tsx",
    "../routes/dashboard/weekly-reports.tsx",
    "../routes/admin/assignment-management.tsx",
    "../routes/admin/assignment-submissions.tsx",
    "../routes/admin/form-config.tsx",
    "../routes/admin/users.tsx",
    "../routes/ai-salon.tsx",
    "../routes/ai-salon-detail.tsx",
    "../routes/ai-salon-registrations.tsx",
    "../routes/organization-preview.tsx",
  ];
  for (const page of pages) {
    const source = await read(page);
    assert.match(source, /<BrandLoader\b/, page);
    assert.match(source, /import \{ BrandLoader \} from "~\/components\/brand-loader"/, page);
  }
});

test("data-heavy routes reserve their actual layout during initial requests", async () => {
  const review = await read("../routes/admin/assignment-submissions.tsx");
  const training = await read("../routes/admin/training-assessment.tsx");
  const analytics = await read("../routes/admin/recruitment-analytics.tsx");
  const profile = await read("../routes/dashboard/community-member-profile.tsx");
  const registrations = await read("../routes/admin/registrations.tsx");

  assert.match(registrations, /<tr key=\{row\} className="admin-table-row content-skeleton motion-safe:animate-pulse">/);
  assert.match(registrations, /<td><div aria-hidden="true" className="admin-operation-group justify-end">/);
  assert.doesNotMatch(registrations, /<td colSpan=\{5\} className="admin-table-empty">\s*<div role="status"/);
  assert.match(review, /loading && !error \? <ReviewSkeleton withSelector \/>/);
  assert.match(review, /listLoaded && selectedID > 0 && !assignment && !error \? <ReviewSkeleton/);
  assert.match(review, /aria-label=\{withSelector \? "正在加载作业列表" : "正在加载提交记录"\}/);
  assert.match(training, /loading && !snapshot \? <AssessmentSkeleton \/>/);
  assert.match(analytics, /loading \? <AnalyticsSkeleton \/>/);
  assert.match(profile, /if \(loading && !result\) return <MemberProfileSkeleton tab=\{tab\} \/>/);
  assert.match(profile, /function MemberProfileSkeleton\(\{ tab \}: \{ tab: ProfileTab \}\)/);
  assert.match(profile, /setLoading\(true\);\s*setResult\(null\)/);
  assert.match(training, /<table className="w-full border-collapse text-sm">/);
  assert.match(training, /<th scope="col"[^>]*>批改反馈<\/th>/);
  assert.match(analytics, /recruitment-analytics__status-track/);
  assert.match(analytics, /recruitment-analytics__group-track/);
  assert.match(review, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.1fr\)\]/);
  for (const tab of ["overview", "posts", "replies", "badges", "settings"]) {
    assert.ok(profile.includes(`tab === "${tab}" ?`), `missing ${tab} skeleton`);
  }
  for (const source of [review, training, analytics, profile]) {
    assert.match(source, /content-skeleton/);
    assert.match(source, /motion-safe:animate-pulse/);
  }
});

test("operations dashboard uses layout-shaped skeleton on cold load", async () => {
  const operations = await read("../routes/dashboard/operations-progress.tsx");
  assert.match(operations, /loading && !board \? <OperationsProgressSkeleton \/>/);
  assert.match(operations, /content-skeleton motion-safe:animate-pulse/);
  assert.match(operations, /aria-label="正在加载战队动态"/);
  assert.match(operations, /operations-progress__account-metrics/);
  assert.match(operations, /operations-progress__stats/);
  assert.match(operations, /operations-progress__items/);
  assert.doesNotMatch(operations, /<PublicHomePage|正在加载…/);
});

test("inline status stays compact and cached sections remain visible while refreshing", async () => {
  const growth = await read("../components/community-growth.tsx");
  const interviews = await read("../routes/admin/interview-sessions.tsx");
  const groups = await read("../routes/admin/user-groups.tsx");
  const leave = await read("../routes/leave-workbench.tsx");
  assert.match(component, /size\?: "sm" \| "md" \| "inline"/);
  assert.match(css, /\.brand-loader--inline\s*\{[^}]*width: 24px/);
  assert.match(growth, /<BrandLoader label="正在读取成长信息" size="inline"/);
  assert.match(interviews, /loading && sessions\.length === 0 \? <BrandLoader/);
  assert.match(groups, /loading && filteredGroups\.length === 0 \? <BrandLoader/);
  assert.match(leave, /loading && !profile && dailyEntries\.length === 0 \? <BrandLoader/);
});

test("background refresh retains existing community data without a loading banner", async () => {
  const feed = await read("../routes/dashboard/index.tsx");
  const workbench = await read("../routes/dashboard/workbench.tsx");
  const thread = await read("../routes/dashboard/community-post.tsx");
  assert.match(thread, /if \(loading && detail\?\.post\.id !== postID\)/);
  assert.doesNotMatch(thread, /if \(loading\) return/);
  assert.match(feed, /visibleLoading && visiblePosts\.length === 0 \? <div className="community-post-list content-skeleton"/);
  assert.doesNotMatch(feed, /正在同步最新内容/);
  assert.doesNotMatch(workbench, /正在同步最新状态…/);
});

test("personal workbench keeps per-section progress without a second global loader", async () => {
  const workbench = await read("../routes/dashboard/workbench.tsx");
  assert.doesNotMatch(workbench, /BrandLoader|正在读取个人事务状态/);
  assert.match(workbench, /weeklyLoading \? "读取中"/);
  assert.match(workbench, /assignmentsLoading \? "读取中"/);
  assert.match(workbench, /const leaveStatus = leaveLoading \? "读取中"/);
  assert.match(workbench, /!loading && !tasksPending && taskCount === 0 && !hasErrors/);
});