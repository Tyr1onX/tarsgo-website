import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { organizationPositionDuty } from "./organization-preview-duties.ts";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const organizationServer = source("../../../backend/service/organization/organization.go");
const raw = organizationServer.match(/const organizationPreviewJSON = `([\s\S]*?)`/)?.[1];
assert.ok(raw, "organization positions must remain in server-owned data");
const preview = JSON.parse(raw);
const handler = source("../../../backend/handler/organization_preview.go");
const router = source("../../../backend/router/router.go");
const routes = source("../routes.ts");
const navigation = source("./dashboard-navigation.ts");
const component = source("../routes/organization-preview.tsx");
const style = source("../routes/organization-preview.css");
const profile = source("../components/personal-profile-settings.tsx");
const authService = source("../../../backend/service/auth/service.go");
const allPositions = [preview.leader, ...preview.categories.flatMap((category) => category.positions)];

test("organization directory retains all server-owned positions without duplicating names in the client", () => {
  assert.equal(allPositions.length, 17);
  assert.equal(new Set(allPositions.map(({ id }) => id)).size, allPositions.length);
  assert.equal(new Set(allPositions.map(({ name }) => name)).size, allPositions.length);
  assert.equal(allPositions.filter(({ userId }) => userId !== null).length, 15);
  assert.equal(preview.categories.length, 4);
  assert.equal(preview.categories.find(({ id }) => id === "technical")?.title, "技术体系");
  assert.equal(preview.categories.find(({ id }) => id === "robot-classes")?.title, "兵种项目体系");
  assert.equal(preview.categories.find(({ id }) => id === "advisors")?.title, "指导教师");
  assert.equal(preview.categories.find(({ id }) => id === "technical")?.positions.find(({ id }) => id === "electrical-lead")?.name, "待确认");
  for (const { name } of allPositions.filter(({ name }) => name !== "待确认")) {
    assert.ok(!component.includes(name), "member names must be loaded from the API: " + name);
  }
});

test("all authenticated members can read the workbench directory, while the legacy admin endpoint stays restricted", () => {
  assert.match(router, /teamAPI\.Use\(middleware\.RequireAuthenticated\(authService\)\)[\s\S]*?teamAPI\.GET\("\/organization-preview", handler\.OrganizationPreview\(db\)\)/);
  assert.match(router, /superAdminAPI\.Use\(middleware\.RequireSuperAdmin\(authService\)\)[\s\S]*?superAdminAPI\.GET\("\/organization-preview", handler\.OrganizationPreview\(db\)\)/);
  assert.match(routes, /route\("workbench\/organization", "routes\/organization-preview\.tsx"\)/);
  assert.match(routes, /route\("team", "routes\/dashboard\/team-redirect\.tsx"\)/);
  assert.match(navigation, /label: "成员与岗位", href: "\/dashboard\/workbench\/organization"/);
  assert.match(component, /apiRequest<OrganizationPreview>\("\/api\/team\/organization-preview"\)/);
  assert.match(handler, /Select\("id", "real_name", "avatar_url"\)/);
  assert.doesNotMatch(handler, /Select\([^)]*(email|phone)/);
});

test("directory opens on the leader and category names;岗位 and member details expand on demand", () => {
  assert.match(component, /useState<Set<string>>\(\(\) => new Set\(\)\)/);
  assert.match(component, /setExpandedIDs\(new Set\(\)\)/);
  assert.match(component, /aria-expanded=\{expanded\}/);
  assert.match(component, /expanded \? \([\s\S]*?category\.positions\.map/);
  assert.match(component, /onSelectPosition\(position, category\)/);
  assert.match(component, /<section className="organization-directory__leader"/);
  assert.match(component, /<section className="organization-directory__groups"/);
  assert.doesNotMatch(component, /<svg|layoutOrganizationPreview|organization-preview__confirmed-link/);
  assert.doesNotMatch(component, /setExpandedIDs\(new Set\(result\.categories\.map/);
});

test("assigned members link directly to their personal homepage; vacant posts do not invent a member", () => {
  assert.match(component, /position\.userId === null \? "待确认" : "查看成员"/);
  assert.match(component, /selectedPosition\.position\.userId === null \? "负责人待确认"/);
  assert.match(component, /dashboard\/members\/\$\{selectedPosition\.position\.userId\}/);
  assert.match(component, /dashboard\/members\/\$\{data\.leader\.userId\}/);
  assert.match(component, /organizationPositionDuty\(selectedPosition\.position\.id, selectedPosition\.categoryId\)/);
  assert.match(style, /grid-template-columns: repeat\(auto-fit, minmax/);
  assert.match(style, /@media \(max-width: 520px\)/);
  assert.match(authService, /OrganizationPositions:\s*organization\.MemberPositions\(user\.ID\)/);
  assert.match(profile, /战队职务/);
  assert.match(profile, /user\.organizationPositions\?\.length/);
  assert.match(organizationPositionDuty("vision-lead", "technical"), /培训和选拔/);
  assert.match(organizationPositionDuty("radar-station", "robot-classes"), /底层架构与关键技术决策/);
});
