import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const joinExperience = await readFile(new URL("../components/join-experience.tsx", import.meta.url), "utf8");
const joinStyles = await readFile(new URL("../components/join-experience.css", import.meta.url), "utf8");
const eventsArchive = await readFile(new URL("../components/events-and-honors-archive.tsx", import.meta.url), "utf8");
const eventsStyles = await readFile(new URL("../components/events-and-honors-archive.css", import.meta.url), "utf8");
const honorsData = await readFile(new URL("./events-and-honors-data.ts", import.meta.url), "utf8");

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

test("the original home keeps its video and legacy anchors while archive content lives in its own component", () => {
  for (const anchor of ["hero", "about", "achievements", "robots"]) {
    assert.ok(home.includes(`id="${anchor}"`), `missing legacy home anchor #${anchor}`);
  }
  assert.ok(eventsArchive.includes('id="certificates"'), "missing archive anchor #certificates");
  assert.match(home, /"#certificates": "\/events-and-honors#certificates"/);
  assert.ok(joinExperience.includes("id=\"join\""), "missing legacy join anchor #join");
  assert.match(home, /hero-showreel\.mp4/);
  assert.match(home, /const timelineMilestones = \[/);
  assert.match(home, /year: "2018"[\s\S]*?year: "2025"/);
  assert.match(honorsData, /Array\.from\(\{ length: 25 \}/);
  assert.match(eventsArchive, /getMaterialsForYear\(year\)\.map\(/);
  assert.match(home, /scrollToTimelineYear/);
  assert.match(home, /<RobotPhotoGallery \/>/);
});

test("topic content uses the existing five groups, practice modules, and a dedicated evidence-based honors archive", () => {
  assert.match(home, /const groups = \[/);
  assert.match(home, /机械组/);
  assert.match(home, /电控组/);
  assert.match(home, /视觉组/);
  assert.match(home, /AI组/);
  assert.match(home, /运营组/);
  assert.match(home, /const aboutModules = \[/);
  assert.match(home, /<EventsAndHonorsArchive \/>/);
  assert.match(eventsArchive, /精选成果[\s\S]*?历年赛事[\s\S]*?荣誉证书/);
  assert.match(honorsData, /赛事组委会公布的全国赛团队名次/);
  assert.match(joinExperience, /从具体任务开始/);
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

test("the homepage visual navigation uses two rows from tablet width and the required four-column desktop grid", () => {
  const desktopGrid = styles.match(/@media \(min-width: 1024px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const tabletGrid = styles.match(/@media \(min-width: 768px\) and \(max-width: 1023px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(desktopGrid, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(desktopGrid, /grid-template-rows: repeat\(2, clamp\(17\.5rem, 21vw, 20rem\)\)/);
  for (const [card, placement] of [
    ["about", /grid-column: 1; grid-row: 1;/],
    ["robots", /grid-column: 2; grid-row: 1;/],
    ["join", /grid-column: 3 \/ span 2; grid-row: 1;/],
    ["events", /grid-column: 1 \/ span 2; grid-row: 2;/],
    ["history", /grid-column: 3; grid-row: 2;/],
    ["micro", /grid-column: 4; grid-row: 2;/],
  ]) {
    assert.match(desktopGrid, new RegExp(`\\.home-visual-card--${card} \\{[^}]*${placement.source}[^}]*\\}`));
  }

  assert.match(tabletGrid, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(tabletGrid, /grid-template-rows: repeat\(2, clamp\(17rem, 28vw, 19rem\)\)/);
  for (const [card, placement] of [
    ["about", /grid-column: 1; grid-row: 1;/],
    ["robots", /grid-column: 2; grid-row: 1;/],
    ["join", /grid-column: 3; grid-row: 1;/],
    ["events", /grid-column: 1; grid-row: 2;/],
    ["history", /grid-column: 2; grid-row: 2;/],
    ["micro", /grid-column: 3; grid-row: 2;/],
  ]) {
    assert.match(tabletGrid, new RegExp(`\\.home-visual-card--${card} \\{[^}]*${placement.source}[^}]*\\}`));
  }

  assert.match(styles, /@media \(min-width: 640px\) \{[\s\S]*?\.home-visual-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 1023px\)/);
  assert.match(styles, /@media \(min-width: 1024px\) \{\s*\.home-visual-grid/);
  for (const card of ["about", "robots", "join", "events", "history", "micro"]) {
    assert.match(styles, new RegExp(`\\.home-visual-card--${card} > img \\{ object-position: center \\d+%; \\}`));
  }
});

test("the five uploaded groups keep matching black and white SVG geometry with square source canvases", async () => {
  const groups = ["mechanical", "electrical-control", "vision", "ai", "operations"];
  for (const group of groups) {
    const [black, white, structure] = await Promise.all([
      readFile(new URL(`../../../../public/assets/images/Groups/${group}-black.svg`, import.meta.url), "utf8"),
      readFile(new URL(`../../../../public/assets/images/Groups/${group}-white.svg`, import.meta.url), "utf8"),
      readFile(new URL(`../../../../public/assets/images/Groups/${group}-structure.svg`, import.meta.url), "utf8"),
    ]);
    const geometry = (svg) => ({
      viewBox: svg.match(/viewBox="([^"]+)"/)?.[1],
      transforms: [...svg.matchAll(/transform="([^"]+)"/g)].map((match) => match[1]),
      paths: [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((match) => match[1]),
    });

    assert.match(black, /width="1600"[^>]*height="1600"/);
    assert.match(white, /width="1600"[^>]*height="1600"/);
    assert.match(structure, /width="1600"[^>]*height="1600"/);
    assert.match(black, /#000000/i, `${group} black variant must stay black`);
    assert.doesNotMatch(black, /#FFFFFF/i, `${group} black variant must not contain white fills`);
    assert.match(white, /#FFFFFF/i, `${group} white variant must stay white`);
    assert.doesNotMatch(white, /#000000/i, `${group} white variant must not contain black fills`);
    assert.match(structure, /<path\b/);
    assert.deepEqual(geometry(white), geometry(black), `${group} color variants must preserve vector geometry`);
    for (const svg of [black, white, structure]) {
      assert.doesNotMatch(svg, /<script\b|<foreignObject\b|href="https?:/i);
    }
  }
});

test("group identity appears on the about and join pages with accessible theme-aware tabs", () => {
  assert.match(home, /team-composition-heading/);
  assert.match(home, /<SiteLogo className=/);
  assert.match(home, /吉林大学吉甲大师双创基地/);
  assert.match(home, /team-composition__groups/);
  assert.match(joinExperience, /role="tablist"/);
  assert.match(joinExperience, /role="tab"/);
  assert.match(joinExperience, /aria-selected=\{isActive\}/);
  assert.match(joinExperience, /event\.key === "ArrowRight"/);
  assert.match(joinExperience, /event\.key === "ArrowLeft"/);
  assert.match(joinExperience, /event\.key === "Home"/);
  assert.match(joinExperience, /event\.key === "End"/);
  assert.match(joinExperience, /role="tabpanel"/);
  assert.match(joinExperience, /aria-live="polite"/);
  assert.match(joinExperience, /activeGroup\.directions\.map/);
  assert.match(styles, /:root\[data-theme="dark"\] \.team-group-mark__image--light\s*\{\s*display:\s*none;/);
  assert.match(styles, /:root\[data-theme="dark"\] \.team-group-mark__image--dark\s*\{\s*display:\s*block;/);
  assert.match(joinStyles, /:root\[data-theme="dark"\] \.join-group-mark__light/);
  assert.match(joinStyles, /:root\[data-theme="dark"\] \.join-group-mark__dark/);
  assert.match(joinStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the join guide distinguishes account creation from an open recruitment application", () => {
  assert.match(joinExperience, /创建账号本身不等于提交招新报名/);
  assert.match(joinExperience, /to="\/register"/);
  assert.match(joinExperience, /to="\/dashboard\/users\/registrations"/);
  assert.match(joinExperience, /当前是否开放招新/);
  assert.match(joinExperience, /初筛通过不代表最终录取/);
  assert.match(joinStyles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});

test("the dedicated join guide only renders on its join route", () => {
  assert.match(home, /routePage === "join" \? <JoinExperience groups=\{groups\} \/> : null/);
});
