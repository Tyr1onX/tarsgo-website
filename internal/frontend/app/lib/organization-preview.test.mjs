import assert from "node:assert/strict";
import test from "node:test";

import { ORGANIZATION_PREVIEW } from "../data/organization-preview.ts";
import { layoutOrganizationPreview } from "./organization-preview-layout.ts";

const expectedPeople = [
  "镇沈晖", "吉荣昌", "孙煦朝", "高畅", "童逸创", "姜浩洋", "张育宁", "沈桂清", "白航铭", "待确认",
  "张坤杰", "雷韶冉", "曲佳响", "陆广鹏", "王彬赫", "左文添",
];
const allPositions = [ORGANIZATION_PREVIEW.leader, ...ORGANIZATION_PREVIEW.categories.flatMap((category) => category.positions)];

test("preview positions match the provided appointment sheet without duplicates", () => {
  assert.deepEqual(allPositions.map(({ name }) => name), expectedPeople);
  assert.equal(new Set(allPositions.map(({ id }) => id)).size, allPositions.length);
  assert.equal(new Set(allPositions.map(({ name }) => name)).size, allPositions.length);
  assert.equal(ORGANIZATION_PREVIEW.categories.find(({ id }) => id === "technical")?.positions.find(({ id }) => id === "electrical-lead")?.name, "待确认");
  assert.equal(ORGANIZATION_PREVIEW.categories.reduce((count, category) => count + category.positions.filter(({ name }) => name === "待确认").length, 0), 1);
});

test("wide preview places each role category in its own non-overlapping column", () => {
  const expanded = new Set(ORGANIZATION_PREVIEW.categories.map(({ id }) => id));
  const layout = layoutOrganizationPreview(1280, expanded);

  assert.equal(layout.columns, 4);
  assert.equal(layout.categories.length, 4);
  for (let left = 0; left < layout.categories.length; left++) {
    for (let right = left + 1; right < layout.categories.length; right++) {
      const a = layout.categories[left];
      const b = layout.categories[right];
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

test("narrow preview stacks categories and collapse removes hidden positions from layout", () => {
  const allExpanded = new Set(ORGANIZATION_PREVIEW.categories.map(({ id }) => id));
  const expandedLayout = layoutOrganizationPreview(360, allExpanded);
  const collapsedLayout = layoutOrganizationPreview(360, new Set(["technical", "special-projects"]));

  assert.equal(expandedLayout.columns, 1);
  for (let index = 1; index < expandedLayout.categories.length; index++) {
    const previous = expandedLayout.categories[index - 1];
    const current = expandedLayout.categories[index];
    assert.ok(current.y >= previous.y + previous.height);
  }
  const management = collapsedLayout.categories.find(({ id }) => id === "management");
  assert.equal(management?.positions.length, 0);
  assert.ok(management && management.height < expandedLayout.categories[0].height);
  assert.ok(collapsedLayout.height < expandedLayout.height);
});
