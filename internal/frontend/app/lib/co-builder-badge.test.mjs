import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const profile = await readFile(new URL("../components/profile-dialog.tsx", import.meta.url), "utf8");
const adminUsers = await readFile(new URL("../routes/admin/users.tsx", import.meta.url), "utf8");
const adminPanel = await readFile(new URL("../components/co-builder-badge-admin-panel.tsx", import.meta.url), "utf8");
const summaryView = await readFile(new URL("../components/co-builder-badge-summary.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("./co-builder-badge-client.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../../../backend/router/router.go", import.meta.url), "utf8");

test("personal profile reads the badge only through the signed-in member endpoint", () => {
  assert.match(profile, /<CoBuilderBadgeProfile\s*\/>/);
  assert.match(client, /getMyCoBuilderBadge\(\)[\s\S]*?"\/api\/me\/co-builder-badge"/);
  assert.doesNotMatch(client, /getMyCoBuilderBadge\([^)]*userId/);
  assert.match(router, /authenticatedAPI\.GET\("\/me\/co-builder-badge"/);
});

test("only super admins see the contribution manager in member editing", () => {
  assert.match(adminUsers, /currentUser\.role\.name === "super_admin" \? <CoBuilderBadgeAdminPanel userId=\{editing\.id\}/);
  assert.match(adminPanel, /登记有效贡献（每条计 1 次）/);
  assert.match(adminPanel, /撤销这条贡献记录/);
  assert.match(client, /POST[\s\S]*?co-builder-badge\/contributions/);
  assert.match(client, /co-builder-badge\/contributions\/\$\{contributionId\}[\s\S]*?method: "DELETE"/);
  assert.match(router, /superAdminAPI\.POST\("\/users\/:id\/co-builder-badge\/contributions"/);
  assert.match(router, /superAdminAPI\.DELETE\("\/users\/:id\/co-builder-badge\/contributions\/:contributionID"/);
});

test("badge summary shows current tier, count, progress, and contribution history", () => {
  assert.match(summaryView, /当前等级/);
  assert.match(summaryView, /summary\.contributionCount/);
  assert.match(summaryView, /role="progressbar"/);
  assert.match(summaryView, /贡献记录/);
  assert.match(summaryView, /已撤销/);
});
