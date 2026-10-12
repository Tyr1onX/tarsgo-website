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
  assert.match(route, /id="introduction"/);
  assert.match(route, /id="curriculum"/);
  assert.match(route, /id="practice"/);
  assert.match(route, /id="faq"/);
  assert.match(routeConfig, /micro-specialties\/low-altitude-intelligent-sensing-control/);
  assert.match(navbar, /低空微专业.*micro-specialties\/low-altitude-intelligent-sensing-control/);
});

test("micro-specialty page is informational and has no registration or recruitment entry", () => {
  assert.doesNotMatch(route, /(?:to|href)=["']\/register(?:["'/?#])/i);
  assert.doesNotMatch(route, /前往.{0,12}(?:报名|注册)|报名入口|报名流程/);
  assert.doesNotMatch(route, /auth-client|getOptionalCurrentUser|subscribeAuthStateChange/);
  assert.doesNotMatch(route, /<form\b/i);
  assert.match(route, /仅用于介绍微专业项目，不提供报名、账号注册或招生管理功能/);
  assert.doesNotMatch(route, /招新/);
  assert.doesNotMatch(lowAltitudeFaqs.map(({ question, answer }) => `${question} ${answer}`).join("\n"), /请使用.{0,20}(?:报名|注册)|报名入口|现有报名流程/);
  assert.match(navbar, /variant\s*===\s*"default"\s*\?/);
  assert.match(navbar, /microSpecialtyNavLinks/);
  assert.doesNotMatch(navbar.match(/const microSpecialtyNavLinks = \[([\s\S]*?)\];/)?.[1] ?? "", /register|login|加入我们|招新/i);
  assert.match(navbar, /to="\/register"/);
  assert.match(navbar, /label: "加入我们"/);
});

test("page layout and course cards use responsive breakpoints without a fixed page width", () => {
  assert.match(route, /lg:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(300px,\.9fr\)\]/);
  assert.match(route, /sm:flex-row/);
  assert.match(route, /md:grid-cols-3/);
  assert.match(route, /grid gap-4 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(route, /min-h-12/);
  assert.match(route, /min-w-0/);
  assert.doesNotMatch(route, /min-width:\s*\d+px|min-w-\[\d+px\]/);
});
