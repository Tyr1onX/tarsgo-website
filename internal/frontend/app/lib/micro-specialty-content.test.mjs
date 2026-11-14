import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  lowAltitudeCourseTerms,
  lowAltitudeFaqs,
  lowAltitudeLearningModes,
} from "./micro-specialty-content.ts";

const route = await readFile(new URL("../routes/micro-specialty-low-altitude.tsx", import.meta.url), "utf8");
const routeConfig = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const homeVisualNavigation = await readFile(new URL("../components/home-visual-navigation.tsx", import.meta.url), "utf8");
const content = [
  route,
  ...lowAltitudeCourseTerms.flatMap((term) => [
    term.semester, term.focus,
    ...term.courses.flatMap((course) => [course.title, course.description, course.outcome]),
  ]),
  ...lowAltitudeLearningModes.flatMap((mode) => [mode.title, mode.description]),
  ...lowAltitudeFaqs.flatMap((faq) => [faq.question, faq.answer]),
].join("\n");

test("微专业首屏直接回答课程规模、学习路径，并展示真实课堂", () => {
  assert.match(route, /吉林大学 · 微专业/);
  assert.match(route, /1 年/);
  assert.match(route, /2 个学期/);
  assert.match(route, /4 门/);
  assert.match(route, /理论 \+ 实践/);
  assert.match(route, /查看四门课程/);
  assert.match(route, /看看真实课堂/);
  assert.match(route, /IMG_1043-1280.webp/);
  assert.match(route, /IMG_1044-640.webp/);
  assert.match(route, /loading="eager"/);
  assert.match(route, /fetchPriority="high"/);
  assert.doesNotMatch(route, /micro-specialty-glow|LEARN · PRACTICE · APPLY|micro-specialty-grid/);
});

test("四门课程按照两个学期组织，显示学习重点", () => {
  assert.deepEqual(lowAltitudeCourseTerms.map(({ semester }) => semester), ["第一学期", "第二学期"]);
  assert.deepEqual(lowAltitudeCourseTerms[0].courses.map(({ title }) => title), [
    "《无人机导论》", "《飞行控制及原理》",
  ]);
  assert.deepEqual(lowAltitudeCourseTerms[1].courses.map(({ title }) => title), [
    "《无人机飞行操控实务》", "《无人机应用实践》",
  ]);
  assert.ok(lowAltitudeCourseTerms.flatMap((term) => term.courses)
    .every(({ title, description, outcome }) => title && description && outcome));
  for (const id of ["curriculum", "learning", "moments", "faq"]) {
    assert.match(route, new RegExp('id="' + id + '"'));
    assert.match(route, new RegExp('href="#' + id + '"'));
  }
  assert.match(routeConfig, /micro-specialties\/low-altitude-intelligent-sensing-control/);
  assert.match(homeVisualNavigation, /href: "\/micro-specialties\/low-altitude-intelligent-sensing-control"/);
});

test("教学形式和学生关心的条件有明确、真实的解释", () => {
  assert.equal(lowAltitudeLearningModes.length, 3);
  assert.match(content, /线上为主/);
  assert.match(content, /基础组装、调试/);
  assert.match(content, /模拟器操控/);
  assert.match(content, /设备、场地与安全条件/);
  assert.equal(lowAltitudeFaqs.length, 4);
  assert.match(content, /没有无人机或编程基础/);
  assert.match(content, /可以亲自飞无人机吗/);
  assert.match(content, /有项目或竞赛机会吗/);
  assert.match(content, /怎么报名？学分、证书如何认定/);
  assert.match(content, /以学校正式通知为准/);
  assert.match(content, /不保证项目名额或竞赛成果/);
  assert.doesNotMatch(content, /寒假.{0,12}五天|4[—-]6\s*月|\d+\s*学分/);
});

test("宣讲会和首堂课各保留四张实际照片及两个响应式尺寸", async () => {
  for (const file of [
    "DSC05745", "DSC05861", "DSC05867", "DSC06440",
    "IMG_1042", "IMG_1043", "IMG_1044", "IMG_1046",
  ]) {
    assert.match(route, new RegExp(file));
    for (const size of [640, 1280]) {
      const image = await stat(new URL(
        "../../../../public/assets/images/MicroSpecialty/" + file + "-" + size + ".webp",
        import.meta.url,
      ));
      assert.ok(image.size > 0 && image.size < 300_000, file + "-" + size + " 体积异常");
    }
  }
  assert.match(route, /title: "微专业宣讲会"/);
  assert.match(route, /title: "首堂课现场"/);
  assert.match(route, /srcSet=/);
  assert.match(route, /loading="lazy"/);
  assert.match(route, /decoding="async"/);
});

test("页面不伪造报名入口，布局可在小屏使用", () => {
  assert.doesNotMatch(route, /(?:to|href)=["']\/register(?:["'/?#])/i);
  assert.doesNotMatch(route, /<form\b|auth-client|getOptionalCurrentUser/);
  assert.doesNotMatch(route, /招新/);
  assert.match(lowAltitudeFaqs.at(-1).answer, /不提供报名或账号注册功能/);
  assert.doesNotMatch(navbar, /navbar-micro-specialty|to=.*micro-specialties/);
  assert.match(navbar, /aria-label="TARSGO 首页"/);
  assert.match(route, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.04fr\)\]/);
  assert.match(route, /grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4/);
  assert.match(route, /overflow-x-auto/);
  assert.match(route, /min-w-0/);
});
