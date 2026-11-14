import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  lowAltitudeCourseTerms,
  lowAltitudeFaqs,
  lowAltitudePractices,
} from "./micro-specialty-content.ts";

const route = await readFile(new URL("../routes/micro-specialty-low-altitude.tsx", import.meta.url), "utf8");
const routeConfig = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const homeVisualNavigation = await readFile(new URL("../components/home-visual-navigation.tsx", import.meta.url), "utf8");
const visibleContent = [
  route,
  lowAltitudeCourseTerms.map(({ semester, focus, description, courses }) =>
    `${semester} ${focus} ${description} ${courses.map(({ title, description: courseDescription, outcome }) => `${title} ${courseDescription} ${outcome}`).join(" ")}`,
  ).join("\n"),
  lowAltitudePractices.map(({ title, description }) => `${title} ${description}`).join("\n"),
  lowAltitudeFaqs.map(({ question, answer }) => `${question} ${answer}`).join("\n"),
].join("\n");

test("micro-specialty page presents the four real courses in a two-semester path", () => {
  assert.deepEqual(lowAltitudeCourseTerms.map(({ semester }) => semester), ["第一学期", "第二学期"]);
  assert.deepEqual(lowAltitudeCourseTerms[0].courses.map(({ title }) => title), [
    "《无人机导论》",
    "《飞行控制及原理》",
  ]);
  assert.deepEqual(lowAltitudeCourseTerms[1].courses.map(({ title }) => title), [
    "《无人机飞行操控实务》",
    "《无人机应用实践》",
  ]);
  const courses = lowAltitudeCourseTerms.flatMap((term) => term.courses);
  assert.equal(courses.length, 4);
  assert.ok(courses.every(({ title, description, outcome }) => title && description && outcome));
  assert.match(route, /一年两学期，从基础认知到实践应用/);
  assert.match(route, /id="introduction"/);
  assert.match(route, /id="moments"/);
  assert.match(route, /id="curriculum"/);
  assert.match(route, /id="practice"/);
  assert.match(route, /id="faq"/);
  assert.match(routeConfig, /micro-specialties\/low-altitude-intelligent-sensing-control/);
  assert.match(homeVisualNavigation, /href: "\/micro-specialties\/low-altitude-intelligent-sensing-control"/);
  assert.doesNotMatch(navbar, /navbar-micro-specialty|to=.*micro-specialties/);
  assert.doesNotMatch(visibleContent, /低空系统与任务基础|智能感知与状态估计|运动控制与任务规划|综合项目与系统联调/);
});

test("宣讲会和首堂课各展示四张优化后的现场照片", async () => {
  for (const file of [
    "DSC05745", "DSC05861", "DSC05867", "DSC06440",
    "IMG_1042", "IMG_1043", "IMG_1044", "IMG_1046",
  ]) {
    assert.match(route, new RegExp(file));
    for (const size of [640, 1280]) {
      const path = new URL(`../../../../public/assets/images/MicroSpecialty/${file}-${size}.webp`, import.meta.url);
      const image = await stat(path);
      assert.ok(image.size > 0 && image.size < 300_000, `${file}-${size} 文件大小异常`);
    }
  }
  assert.match(route, /href="#moments"/);
  assert.match(route, /title: "微专业宣讲会"/);
  assert.match(route, /title: "首堂课现场"/);
  assert.match(route, /srcSet=/);
  assert.match(route, /loading="lazy"/);
  assert.match(route, /decoding="async"/);
});

test("practice and FAQ content reflects planned teaching without unsupported promises", () => {
  assert.equal(lowAltitudePractices.length, 4);
  assert.ok(lowAltitudePractices.every(({ title, description }) => title && description));
  assert.match(visibleContent, /组装/);
  assert.match(visibleContent, /调试/);
  assert.match(visibleContent, /模拟器/);
  assert.match(visibleContent, /安全规范/);
  assert.match(visibleContent, /设备、场地和安全条件/);
  assert.match(visibleContent, /应用实践与项目探索/);
  assert.equal(lowAltitudeFaqs.length, 6);
  assert.match(visibleContent, /没有无人机或编程基础/);
  assert.match(visibleContent, /课程和实践时间怎么安排/);
  assert.match(visibleContent, /会安排真实飞行吗/);
  assert.match(visibleContent, /会参加项目或竞赛吗/);
  assert.match(visibleContent, /学时、学分及考核方式以学校正式通知为准/);
  assert.match(visibleContent, /不承诺个人飞行次数或独立飞行/);
  assert.match(visibleContent, /不保证项目名额、立项或获奖/);
  assert.doesNotMatch(visibleContent, /寒假.{0,12}五天|4[—-]6\s*月|\d+\s*学时|\d+\s*学分/);
});

test("micro-specialty page is informational and has no registration or recruitment entry", () => {
  assert.doesNotMatch(route, /(?:to|href)=["']\/register(?:["'/?#])/i);
  assert.doesNotMatch(route, /前往.{0,12}(?:报名|注册)|报名入口|报名流程/);
  assert.doesNotMatch(route, /auth-client|getOptionalCurrentUser|subscribeAuthStateChange/);
  assert.doesNotMatch(route, /<form\b/i);
  assert.match(route, /仅用于介绍微专业项目，不提供报名、账号注册或招生管理功能/);
  assert.doesNotMatch(route, /招新/);
  assert.match(lowAltitudeFaqs.at(-1).answer, /不提供报名、登录、注册或招生管理功能，也不收集个人资料/);
  assert.doesNotMatch(lowAltitudeFaqs.map(({ question, answer }) => `${question} ${answer}`).join("\n"), /请使用.{0,20}(?:报名|注册)|报名入口|现有报名流程/);
  assert.doesNotMatch(navbar, /microSpecialtyNavLinks|const navLinks|site-mobile-menu/);
  assert.match(navbar, /aria-label="TARSGO 首页"/);

});

test("page layout remains responsive across mobile and desktop widths", () => {
  assert.match(route, /lg:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(300px,\.9fr\)\]/);
  assert.match(route, /sm:flex-row/);
  assert.match(route, /grid gap-6 lg:grid-cols-2/);
  assert.match(route, /grid grid-cols-1 gap-4 sm:grid-cols-2/);
  assert.match(route, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(route, /min-h-12/);
  assert.match(route, /min-w-0/);
  assert.doesNotMatch(route.replace(/sizes="[^"]*"/g, ""), /min-width:\s*\d+px|min-w-\[\d+px\]/);
});
