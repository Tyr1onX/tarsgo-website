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

test("eligible workbench members can read the workbench directory, while the legacy admin endpoint stays restricted", () => {
  assert.match(router, /teamAPI\.Use\(middleware\.RequireAuthenticated\(authService\), middleware\.RequireWorkbench\(\)\)[\s\S]*?teamAPI\.GET\("\/organization-preview", handler\.OrganizationPreview\(db\)\)/);
  assert.match(router, /superAdminAPI\.Use\(middleware\.RequireSuperAdmin\(authService\)\)[\s\S]*?superAdminAPI\.GET\("\/organization-preview", handler\.OrganizationPreview\(db\)\)/);
  assert.match(routes, /route\("workbench\/organization", "routes\/organization-preview\.tsx"\)/);
  assert.match(routes, /route\("team", "routes\/dashboard\/team-redirect\.tsx"\)/);
  assert.match(navigation, /label: "成员与岗位",[\s\S]*?iconKey: "team",[\s\S]*?href: "\/dashboard\/workbench\/organization"/);
  assert.match(component, /apiRequest<OrganizationPreview>\("\/api\/team\/organization-preview"\)/);
  assert.match(handler, /Select\("id", "real_name", "avatar_url", "status"\)/);
  assert.doesNotMatch(handler, /Select\([^)]*(email|phone)/);
});

test("organization puts the advisor above the leader and keeps categories collapsible", () => {
  assert.match(component, /useState<Set<string>>\(\(\) => new Set\(\)\)/);
  assert.match(component, /setExpandedIDs\(new Set\(\)\)/);
  assert.match(component, /aria-expanded=\{expanded\}/);
  assert.match(component, /expanded \? \([\s\S]*?organization-directory__members/);
  assert.match(component, /<section className="organization-directory__advisor"/);
  assert.ok(component.indexOf('organization-directory__advisor"') < component.indexOf('organization-directory__leader"'));
  assert.match(component, /<section className="organization-directory__leader"/);
  assert.match(component, /data.categories.filter\(\(category\) => category.id !== "advisors"\)/);
  assert.match(component, /<LeaderNode position=\{data\.leader\} members=\{members\} \/>/);
  assert.match(component, /addPosition\(data\.leader, null, null\)/);
  assert.doesNotMatch(component, /核心管理层/);
  assert.match(component, /<section className="organization-directory__groups"/);
  assert.match(component, /for \(const position of category\.positions\) addPosition\(position, category\.id, category\.title\)/);
  assert.match(component, /new Set\(category\.positions\.flatMap/);
  assert.match(component, /members\.get\(userId\)/);
  assert.doesNotMatch(component, /layoutOrganizationPreview|organization-preview__confirmed-link|setExpandedIDs\(new Set\(result\.categories\.map/);
});

test("real member avatars link to profiles and show keyboard-accessible position context", () => {
  assert.match(component, /to=\{`\/dashboard\/members\/\$\{member\.id\}`\}/);
  assert.match(component, /aria-label=\{`查看 \$\{member\.name\} 的个人主页`\}/);
  assert.match(component, /Array\.from\(member\.name\.trim\(\)\)\[0\] \?\? "吉"/);
  assert.match(component, /member\.avatarUrl \? <img/);
  assert.match(component, /organization-directory__member-tooltip" role="tooltip"/);
  assert.match(component, /position\.title/);
  assert.match(component, /position\.categoryTitle/);
  assert.match(component, /organizationPositionDuty\(positions\[0\]\.id, positions\[0\]\.categoryId\)/);
  assert.match(style, /\.organization-directory__member:hover \.organization-directory__member-tooltip/);
  assert.match(style, /\.organization-directory__member:focus-within \.organization-directory__member-tooltip/);
  assert.match(style, /@media \(max-width: 639px\)[\s\S]*?\.organization-directory__member-roles \{\s*display: grid/);
  assert.match(style, /prefers-reduced-motion: reduce/);
  assert.match(style, /grid-template-columns: repeat\(auto-fit, minmax/);
  assert.doesNotMatch(style, /transform:\s*scale\(/);
});

test("vacant roles stay compact and never render a placeholder member avatar", () => {
  assert.match(component, /const vacancies = category\.positions\.filter\(\(position\) => position\.userId === null &&/);
  assert.match(component, /const unlinkedMembers = category\.positions/);
  assert.match(component, /accountStatus \?\? "账号未关联"/);
  assert.match(component, /member.id !== null/);
  assert.match(component, /organization-directory__vacancies/);
  assert.match(component, /<small>待确认<\/small>/);
  assert.match(component, /if \(position\.userId === null\) return/);
  assert.match(style, /\.organization-directory__vacancies \{/);
  assert.doesNotMatch(component, /selectedPosition|leader-card|member-detail/);
});

test("tree connects category branches without claiming that roles report to the leader", () => {
  assert.match(style, /\.organization-directory__category-content\.has-members::before/);
  assert.match(style, /\.organization-directory__members::before/);
  assert.match(style, /\.organization-directory__member::before/);
  assert.doesNotMatch(style, /organization-directory__leader::after/);
  assert.match(authService, /OrganizationPositions:\s*organization\.MemberPositions\(user\.ID\)/);
  assert.match(profile, /战队职务/);
  assert.match(profile, /user\.organizationPositions\?\.length/);
  assert.match(organizationPositionDuty("vision-lead", "technical"), /培训和选拔/);
  assert.match(organizationPositionDuty("radar-station", "robot-classes"), /底层架构与关键技术决策/);
});


test("confirmed roster covers non-positioned members and all other guides", () => {
  const members = organizationServer.match(/var formalMemberNames = \[\]string\{([\s\S]*?)\}/)?.[1].match(/"[^"]+"/g) ?? [];
  const guides = organizationServer.match(/var otherGuideNames = \[\]string\{([\s\S]*?)\}/)?.[1].match(/"[^"]+"/g) ?? [];
  assert.equal(members.length, 33);
  assert.equal(guides.length, 8);
  assert.equal(new Set([...members, ...guides]).size, 41);
  assert.match(organizationServer, /assignedNames\[name\]/);
  assert.match(handler, /Where\("id IN \? OR real_name IN \?", userIDs, rosterNames\)/);
  assert.match(handler, /len\(matches\) > 1/);
  assert.match(handler, /member\.AccountStatus = "账号不在"/);
  assert.match(handler, /member\.AccountStatus = "账号待核实"/);
  assert.match(component, /organization-directory__others/);
  assert.match(component, /organization-directory__coaches/);
  assert.ok(component.indexOf('organization-directory__advisor"') < component.indexOf('organization-directory__coaches"'));
  assert.ok(component.indexOf('organization-directory__coaches"') < component.indexOf('organization-directory__leader"'));
  assert.match(style, /\.organization-directory__roster/);
  assert.doesNotMatch(handler, /Select\([^)]*(email|phone|student_id)/);
});
