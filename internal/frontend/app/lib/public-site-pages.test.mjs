import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");

const pages = [
  ["about", "about"],
  ["robots", "robots"],
  ["events-and-honors", "events-and-honors"],
  ["team-history", "team-history"],
  ["join", "join"],
];

test("all five new public topic routes are directly registered and share the existing site sections", async () => {
  for (const [path, page] of pages) {
    assert.match(routes, new RegExp(`route\\("${path}", "routes/${path}\\.tsx"\\)`));
    const wrapper = await readFile(new URL(`../routes/${path}.tsx`, import.meta.url), "utf8");
    assert.match(wrapper, new RegExp(`<Home page="${page}" \\/>`));
  }
  assert.match(routes, /route\("micro-specialties\/low-altitude-intelligent-sensing-control"/);
  for (const [path, page] of pages) {
    assert.match(home, new RegExp(`"/${path}": "${page}"`));
  }
});

test("the original home keeps its video and legacy anchors while all historical and interactive assets remain present", () => {
  for (const anchor of ["hero", "about", "achievements", "robots", "certificates", "join"]) {
    assert.ok(home.includes(`id="${anchor}"`), `missing legacy home anchor #${anchor}`);
  }
  assert.match(home, /hero-showreel\.mp4/);
  assert.match(home, /const timelineMilestones = \[/);
  assert.match(home, /year: "2018"[\s\S]*?year: "2025"/);
  assert.equal((home.match(/CertificateOfAchievement\/certificate-\d{2}\.webp/g) ?? []).length, 25);
  assert.match(home, /showAllCertificates/);
  assert.match(home, /moveCertificatePreview/);
  assert.match(home, /scrollToTimelineYear/);
  assert.match(home, /setActiveRobotIndex/);
});

test("topic content uses the existing five groups, practice modules, and real event highlights", () => {
  assert.match(home, /const groups = \[/);
  assert.match(home, /机械组/);
  assert.match(home, /电控组/);
  assert.match(home, /视觉组/);
  assert.match(home, /AI组/);
  assert.match(home, /运营组/);
  assert.match(home, /const aboutModules = \[/);
  assert.match(home, /const competitionHighlights = timelineMilestones\.map/);
  assert.match(home, /从日常训练与组内协作开始/);
});
