import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  lowAltitudeCourses,
  lowAltitudeFaqs,
  lowAltitudePractices,
} from "./micro-specialty-content.ts";

const route = await readFile(new URL("../routes/micro-specialty-low-altitude.tsx", import.meta.url), "utf8");
const routeConfig = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");

test("low-altitude micro-specialty page includes the course path, practice, and FAQ content", () => {
  assert.equal(lowAltitudeCourses.length, 4);
  assert.equal(lowAltitudePractices.length, 3);
  assert.equal(lowAltitudeFaqs.length, 4);
  assert.ok(lowAltitudeCourses.every(({ title, description, outcome }) => title && description && outcome));
  assert.ok(lowAltitudePractices.every(({ title, description }) => title && description));
  assert.ok(lowAltitudeFaqs.every(({ question, answer }) => question && answer));
  assert.match(route, /id="curriculum"/);
  assert.match(route, /id="practice"/);
  assert.match(route, /id="faq"/);
  assert.match(routeConfig, /micro-specialties\/low-altitude-intelligent-sensing-control/);
  assert.match(navbar, /低空微专业.*micro-specialties\/low-altitude-intelligent-sensing-control/);
});

test("micro-specialty page uses the existing registration entry without collecting personal data", () => {
  assert.match(route, /to="\/register"/);
  assert.doesNotMatch(route, /<form\b/i);
  assert.match(route, /仅在原流程中处理/);
});

test("course cards use fluid responsive grid breakpoints without a fixed page width", () => {
  assert.match(route, /grid gap-4 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(route, /min-w-0/);
  assert.doesNotMatch(route, /min-width:\s*\d+px|min-w-\[\d+px\]/);
});
