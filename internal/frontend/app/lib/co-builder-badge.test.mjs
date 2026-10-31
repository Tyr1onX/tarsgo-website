import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const profile = await readFile(new URL("../components/profile-dialog.tsx", import.meta.url), "utf8");
const adminUsers = await readFile(new URL("../routes/admin/users.tsx", import.meta.url), "utf8");
const adminPanel = await readFile(new URL("../components/co-builder-badge-admin-panel.tsx", import.meta.url), "utf8");
const summaryView = await readFile(new URL("../components/co-builder-badge-summary.tsx", import.meta.url), "utf8");
const badgeMark = await readFile(new URL("../components/co-builder-badge-mark.tsx", import.meta.url), "utf8");
const unlockToast = await readFile(new URL("../components/co-builder-badge-unlock-toast.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("./co-builder-badge-client.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../../../backend/router/router.go", import.meta.url), "utf8");
const dashboardLayout = await readFile(new URL("../routes/dashboard/layout.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");

test("personal profile reads the badge only through the signed-in member endpoint", () => {
  assert.match(profile, /<CoBuilderBadgeProfile\s*\/>/);
  assert.match(client, /getMyCoBuilderBadge\(\)[\s\S]*?"\/api\/me\/co-builder-badge"/);
  assert.doesNotMatch(client, /getMyCoBuilderBadge\([^)]*userId/);
  assert.match(router, /authenticatedAPI\.GET\("\/me\/co-builder-badge"/);
});

test("only super admins see the contribution manager in member editing", () => {
  assert.match(adminUsers, /currentUser\.role\.name === "super_admin" \? <CoBuilderBadgeAdminPanel userId=\{editing\.id\}/);
  assert.match(adminPanel, /贡献说明（可选）/);
  assert.match(adminPanel, /授予贡献 \+1/);
  assert.match(adminPanel, /留空将使用默认说明：参与吉甲官网测试与反馈/);
  assert.match(adminPanel, /disabled=\{saving\}/);
  assert.doesNotMatch(adminPanel, /<form/);
  assert.match(adminPanel, /type="button" onClick=\{\(\) => void grant\(\)\}/);
  assert.doesNotMatch(adminPanel, /<textarea required/);
  assert.match(adminPanel, /撤销这条贡献记录/);
  assert.match(client, /POST[\s\S]*?co-builder-badge\/contributions/);
  assert.match(client, /co-builder-badge\/contributions\/\$\{contributionId\}[\s\S]*?method: "DELETE"/);
  assert.match(router, /superAdminAPI\.POST\("\/users\/:id\/co-builder-badge\/contributions"/);
  assert.match(router, /superAdminAPI\.DELETE\("\/users\/:id\/co-builder-badge\/contributions\/:contributionID"/);
});

test("badge summary shows current tier, count, progress, and contribution history", () => {
  assert.match(summaryView, /<CoBuilderBadgeMark level=\{summary\.levelCode\} size=\{48\}/);
  assert.doesNotMatch(summaryView, /@iconify-icons\/lucide\/award/);
  assert.match(summaryView, /当前等级/);
  assert.match(summaryView, /summary\.contributionCount/);
  assert.match(summaryView, /role="progressbar"/);
  assert.match(summaryView, /贡献记录/);
  assert.match(summaryView, /已撤销/);
});

test("badge mark uses the shared mechanical silhouette with distinct metal tiers", () => {
  assert.match(badgeMark, /viewBox="0 0 96 96"/);
  assert.match(badgeMark, /height=\{size\}[\s\S]*?width=\{size\}/);
  assert.match(badgeMark, /linearGradient/);
  assert.match(badgeMark, /bronze:/);
  assert.match(badgeMark, /silver:/);
  assert.match(badgeMark, /gold:/);
  assert.match(badgeMark, /level === "gold"/);
  assert.match(badgeMark, /level !== "bronze" && level !== "none"/);
  assert.match(badgeMark, /role="img"/);
  assert.doesNotMatch(badgeMark, /<text[\s>]/);
});

test("workbench unlock notice reuses the current SVG and confirms only after display", () => {
  assert.match(dashboardLayout, /<CoBuilderBadgeUnlockToast key=\{currentUser\.id\} onOpenProfile=\{\(\) => setProfileOpen\(true\)\} \/>/);
  assert.match(unlockToast, /<CoBuilderBadgeMark level=\{notice\.levelCode\} size=\{78\}/);
  assert.match(unlockToast, /ACHIEVEMENT UNLOCKED/);
  assert.match(unlockToast, /吉甲共建者 <span aria-hidden="true">·<\/span> \{romanLevel\}/);
  assert.match(unlockToast, /你的贡献，让吉甲变得更好。/);
  assert.match(unlockToast, /setTimeout\(\(\) => \{[\s\S]*?displayed = true;[\s\S]*?\}, 420\)/);
  assert.match(unlockToast, /document\.visibilityState === "hidden"/);
  assert.match(unlockToast, /onClick=\{onOpenProfile\}/);
  assert.match(client, /POST[\s\S]*?\/api\/me\/co-builder-badge\/unlock-notice/);
  assert.match(client, /\/api\/me\/co-builder-badge\/unlock-notice\/seen/);
  assert.match(router, /authenticatedAPI\.POST\("\/me\/co-builder-badge\/unlock-notice", requireSameOriginRequest\(cfg\)/);
  assert.match(router, /authenticatedAPI\.POST\("\/me\/co-builder-badge\/unlock-notice\/seen", requireSameOriginRequest\(cfg\)/);
});

test("unlock notice timing, responsive placement, and reduced motion are defined in native CSS", () => {
  assert.match(styles, /\.co-builder-unlock\s*\{[\s\S]*?animation: co-builder-unlock-card 4\.4s/);
  assert.match(styles, /\.co-builder-unlock__mark\s*\{[\s\S]*?animation: co-builder-unlock-badge 4\.4s/);
  assert.match(styles, /\.co-builder-unlock__sheen\s*\{[\s\S]*?animation: co-builder-unlock-sheen 4\.4s/);
  assert.match(styles, /@media \(max-width: 639px\)\s*\{[\s\S]*?\.co-builder-unlock/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.co-builder-unlock,[\s\S]*?animation: none/);
});
