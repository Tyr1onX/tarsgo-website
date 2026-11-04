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
  assert.match(component, /<img className="brand-loader__robot/);
  assert.doesNotMatch(component, /<use href=/);
  assert.match(component, /role="status" aria-label=\{label\}/);
});

test("sheen appears after 300ms, loops and respects reduced motion", () => {
  assert.match(css, /brand-loader-appear 0s 300ms both/);
  assert.match(css, /brand-loader-sheen 2\.5s ease-in-out infinite/);
  assert.match(css, /\.brand-loader__robot--base\s*\{[^}]*opacity: 0\.28;[^}]*blur/);
  assert.match(css, /mask-image: linear-gradient/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("cold-loading placeholders reuse one component across public and internal pages", async () => {
  const pages = [
    "../root.tsx",
    "../routes/base.tsx",
    "../routes/dashboard/index.tsx",
    "../routes/dashboard/community-post.tsx",
    "../routes/dashboard/community-member-profile.tsx",
    "../routes/dashboard/assignments.tsx",
    "../routes/dashboard/practice-projects.tsx",
    "../routes/dashboard/weekly-reports.tsx",
    "../routes/dashboard/workbench.tsx",
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
  assert.match(feed, /visibleLoading && visiblePosts\.length === 0 \? <div[^>]*><BrandLoader/);
  assert.doesNotMatch(feed, /正在同步最新内容/);
  assert.doesNotMatch(workbench, /正在同步最新状态…/);
});
