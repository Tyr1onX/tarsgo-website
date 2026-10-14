import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");

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

test("the homepage uses six image-led routes, preserves legacy hashes, and keeps reduced-motion video behavior", () => {
  const modules = home.match(/const homeNavigationModules = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  assert.equal((modules.match(/title: /g) ?? []).length, 6);
  for (const path of ["/about", "/robots", "/join", "/events-and-honors", "/team-history", "/micro-specialties/low-altitude-intelligent-sensing-control"]) {
    assert.ok(modules.includes(`href: "${path}"`), `missing homepage route ${path}`);
  }
  for (const [anchor, destination] of [
    ["#about", "/about#about"],
    ["#achievements", "/team-history#achievements"],
    ["#robots", "/robots#robots"],
    ["#certificates", "/events-and-honors#certificates"],
    ["#join", "/join#join"],
  ]) {
    assert.ok(home.includes(`"${anchor}": "${destination}"`), `missing legacy mapping for ${anchor}`);
  }
  assert.match(home, /autoPlay=\{!prefersReducedMotion\}/);
  assert.match(home, /preload=\{prefersReducedMotion \? "none" : "metadata"\}/);
  assert.match(home, /if \(prefersReducedMotion\) heroVideoRef\.current\?\.pause\(\)/);
  assert.match(home, /<HomeVisualNavigation \/>/);
  assert.match(navbar, /label: "加入我们", href: "\/join"/);
  assert.match(styles, /\.home-visual-card:focus-visible/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.home-visual-card:hover > img[\s\S]*?transform: none;/);
});
