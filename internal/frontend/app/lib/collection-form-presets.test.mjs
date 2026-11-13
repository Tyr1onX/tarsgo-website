import assert from "node:assert/strict";
import test from "node:test";

import { collectionPresets, makeCollectionPreset } from "./collection-form-presets.ts";

test("collection presets provide four distinct starting points", () => {
  assert.deepEqual(collectionPresets.map((item) => item.id), [
    "registration", "information", "feedback", "blank",
  ]);
  for (const { id } of collectionPresets) {
    const form = makeCollectionPreset(id);
    assert.equal(form.status, "draft");
    assert.ok(form.fields.length >= 1 && form.fields.length <= 30);
    assert.ok(form.closesAt);
    assert.equal(new Set(form.fields.map((field) => field.key)).size, form.fields.length);
  }
});

test("registration preset includes three independent five-seat sessions", () => {
  const first = makeCollectionPreset("registration");
  const again = makeCollectionPreset("registration");
  assert.deepEqual(first.fields.map((field) => field.label), ["参加场次"]);
  assert.equal(first.fields[0].type, "radio");
  assert.deepEqual(first.fields[0].options?.map((option) => option.capacity), [5, 5, 5]);
  assert.equal(new Set(first.fields[0].options?.map((option) => option.value)).size, 3);
  assert.notEqual(first.fields[0].key, again.fields[0].key);
  assert.equal(first.loginRequired, true);
});

test("information and feedback presets have expected privacy and required defaults", () => {
  const info = makeCollectionPreset("information");
  const feedback = makeCollectionPreset("feedback");
  const blank = makeCollectionPreset("blank");
  assert.deepEqual(info.fields.map((field) => field.label), ["确认结果", "补充说明"]);
  assert.equal(info.fields.at(-1)?.required, false);
  assert.equal(info.loginRequired, true);
  assert.equal(feedback.loginRequired, true);
  assert.equal(feedback.fields[1].type, "textarea");
  assert.equal(feedback.fields[1].required, false);
  assert.equal(blank.title, "");
  assert.equal(blank.fields[0].label, "");
});
