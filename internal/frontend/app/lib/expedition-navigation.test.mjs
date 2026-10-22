import test from "node:test";
import assert from "node:assert/strict";

import { EXPEDITION_FACILITY_IDS, parseExpeditionArea, withExpeditionArea } from "./expedition-navigation.ts";

test("supports deep links to each of the six expedition areas", () => {
	assert.deepEqual(EXPEDITION_FACILITY_IDS, ["hangar", "mechanical", "controls", "vision", "ai", "operations"]);
	for (const id of EXPEDITION_FACILITY_IDS) assert.equal(parseExpeditionArea(id), id);
	assert.equal(parseExpeditionArea(null), null);
	assert.equal(parseExpeditionArea("unknown"), null);
});

test("switching scenes preserves the selected assembly project", () => {
	const current = new URLSearchParams("projectId=15&filter=mine");
	const scene = withExpeditionArea(current, "mechanical");
	assert.equal(scene.get("area"), "mechanical");
	assert.equal(scene.get("projectId"), "15");
	assert.equal(scene.get("filter"), "mine");
	const overview = withExpeditionArea(scene, null);
	assert.equal(overview.has("area"), false);
	assert.equal(overview.get("projectId"), "15");
});
