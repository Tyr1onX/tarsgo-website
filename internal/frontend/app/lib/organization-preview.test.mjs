import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { organizationPositionDuty } from "./organization-preview-duties.ts";
import { layoutOrganizationPreview } from "./organization-preview-layout.ts";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const backend = source("../../../backend/handler/organization_preview.go");
const raw = backend.match(/var organizationPreviewData = json\.RawMessage\(`([\s\S]*?)`\)/)?.[1];
assert.ok(raw, "organization preview must be stored behind the backend API");
const preview = JSON.parse(raw);
const expectedPeople = [
  "镇沈晖", "吉荣昌", "孙煦朝", "高畅", "童逸创", "姜昊阳", "张育宁", "沈桂清", "白航铭", "待确认",
  "张坤杰", "雷韶冉", "曲佳响", "陆广鹏", "王彬赫", "左文添",
];
const allPositions = [preview.leader, ...preview.categories.flatMap((category) => category.positions)];

test("appointment data is complete and has no duplicate positions", () => {
  assert.deepEqual(allPositions.map(({ name }) => name), expectedPeople);
  assert.equal(new Set(allPositions.map(({ id }) => id)).size, allPositions.length);
  assert.equal(new Set(allPositions.map(({ name }) => name)).size, allPositions.length);
  assert.equal(preview.categories.find(({ id }) => id === "technical")?.positions.find(({ id }) => id === "electrical-lead")?.name, "待确认");
  assert.equal(preview.categories.length, 3);
  assert.equal(preview.categories.find(({ id }) => id === "management")?.title, "核心管理层");
  assert.equal(preview.categories.find(({ id }) => id === "technical")?.title, "技术体系");
  const robotProjects = preview.categories.find(({ id }) => id === "robot-classes");
  assert.equal(robotProjects?.title, "兵种项目体系");
  assert.equal(robotProjects?.positions.find(({ id }) => id === "radar-station")?.title, "雷达站负责人");
  assert.equal(robotProjects?.positions.find(({ id }) => id === "aerial-lead")?.title, "飞机组长");
  assert.ok(!allPositions.some(({ id }) => id === "reserve-captain"), "reserve captain appears only after an appointment exists");
});

test("preview is restricted to super admins, including its source data", () => {
  const router = source("../../../backend/router/router.go");
  const routes = source("../routes.ts");
  const navigation = source("./dashboard-navigation.ts");
  const component = source("../routes/organization-preview.tsx");
  const frontendData = source("../data/organization-preview.ts");

  assert.match(router, /superAdminAPI\.Use\(middleware\.RequireSuperAdmin\(authService\)\)[\s\S]*?superAdminAPI\.GET\("\/organization-preview", handler\.OrganizationPreview\)/);
  assert.match(routes, /route\("admin\/organization-preview", "routes\/organization-preview\.tsx"\)/);
  assert.doesNotMatch(routes, /^\s*route\("organization-preview",/m);
  assert.match(navigation, /key: "organization-preview",[\s\S]*?allowedRoles: \["super_admin"\]/);
  assert.match(component, /apiRequest<OrganizationPreview>\("\/api\/admin\/organization-preview"\)/);
  for (const { name } of allPositions.filter(({ name }) => name !== "待确认")) {
    assert.ok(!component.includes(name) && !frontendData.includes(name), "names must not be bundled in the frontend: " + name);
  }
});

test("positions expose inline, keyboard-accessible role details without changing page or permission boundaries", () => {
  const component = source("../routes/organization-preview.tsx");
  const duties = source("./organization-preview-duties.ts");

  assert.match(component, /role="button"[\s\S]*?aria-pressed=\{selected\}[\s\S]*?onKeyDown={onKeyDown}/);
  assert.match(component, /aria-label="职位详情"/);
  assert.match(component, /organizationPositionDuty\(selectedPosition\.position\.id, selectedPosition\.categoryID\)/);
  assert.match(component, /点击岗位查看职责/);
  assert.match(component, /if \(!window\.matchMedia\("\(max-width: 720px\)"\)\.matches\)\s*\{\s*setViewportHeight/);
  assert.doesNotMatch(component, /role="dialog"/);
  for (const positionID of ["captain", "vice-captain-project", "vice-captain-training", "vice-captain-test-safety", "project-management", "operations-manager", "reserve-captain"]) {
    const dutyKey = positionID === "captain" ? "captain:" : "\"" + positionID + "\":";
    assert.ok(duties.includes(dutyKey), "missing duty for " + positionID);
  }
  assert.match(organizationPositionDuty("vision-lead", "technical"), /培训和选拔/);
  assert.match(organizationPositionDuty("radar-station", "robot-classes"), /底层架构与关键技术决策/);
  assert.match(organizationPositionDuty("reserve-captain", "management"), /为接任队长积累经验/);
});

test("wide preview places role categories in non-overlapping columns", () => {
  const expanded = new Set(preview.categories.map(({ id }) => id));
  const layout = layoutOrganizationPreview(1280, expanded, preview.categories);
  assert.equal(layout.columns, 3);
  assert.equal(layout.categories.length, 3);
  for (let left = 0; left < layout.categories.length; left++) {
    for (let right = left + 1; right < layout.categories.length; right++) {
      const a = layout.categories[left], b = layout.categories[right];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
  }
  for (const category of layout.categories) {
    for (const position of category.positions) {
      assert.ok(position.x >= category.x && position.x + position.width <= category.x + category.width);
      assert.ok(position.y >= category.y && position.y + position.height <= category.y + category.height);
    }
  }
});

test("mobile preview stacks categories and collapse removes hidden positions", () => {
  const expanded = new Set(preview.categories.map(({ id }) => id));
  const full = layoutOrganizationPreview(360, expanded, preview.categories);
  const collapsed = layoutOrganizationPreview(360, new Set(["technical", "robot-classes"]), preview.categories);
  assert.equal(full.columns, 1);
  for (let index = 1; index < full.categories.length; index++) {
    assert.ok(full.categories[index].y >= full.categories[index - 1].y + full.categories[index - 1].height);
  }
  assert.equal(collapsed.categories.find(({ id }) => id === "management")?.positions.length, 0);
  assert.ok(collapsed.height < full.height);
});
