import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { layoutOrganizationPreview } from "./organization-preview-layout.ts";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const backend = source("../../../backend/handler/organization_preview.go");
const raw = backend.match(/var organizationPreviewData = json\.RawMessage\(`([\s\S]*?)`\)/)?.[1];
assert.ok(raw, "organization preview must be stored behind the backend API");
const preview = JSON.parse(raw);
const expectedPeople = [
  "镇沈晖", "吉荣昌", "孙煦朝", "高畅", "童逸创", "姜浩洋", "张育宁", "沈桂清", "白航铭", "待确认",
  "张坤杰", "雷韶冉", "曲佳响", "陆广鹏", "王彬赫", "左文添",
];
const allPositions = [preview.leader, ...preview.categories.flatMap((category) => category.positions)];

test("appointment data is complete and has no duplicate positions", () => {
  assert.deepEqual(allPositions.map(({ name }) => name), expectedPeople);
  assert.equal(new Set(allPositions.map(({ id }) => id)).size, allPositions.length);
  assert.equal(new Set(allPositions.map(({ name }) => name)).size, allPositions.length);
  assert.equal(preview.categories.find(({ id }) => id === "technical")?.positions.find(({ id }) => id === "electrical-lead")?.name, "待确认");
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

test("wide preview places role categories in non-overlapping columns", () => {
  const expanded = new Set(preview.categories.map(({ id }) => id));
  const layout = layoutOrganizationPreview(1280, expanded, preview.categories);
  assert.equal(layout.columns, 4);
  assert.equal(layout.categories.length, 4);
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
  const collapsed = layoutOrganizationPreview(360, new Set(["technical", "special-projects"]), preview.categories);
  assert.equal(full.columns, 1);
  for (let index = 1; index < full.categories.length; index++) {
    assert.ok(full.categories[index].y >= full.categories[index - 1].y + full.categories[index - 1].height);
  }
  assert.equal(collapsed.categories.find(({ id }) => id === "management")?.positions.length, 0);
  assert.ok(collapsed.height < full.height);
});
