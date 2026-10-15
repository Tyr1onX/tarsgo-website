import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = await readFile(new URL("../routes.ts", import.meta.url), "utf8");
const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const navbar = await readFile(new URL("../components/navbar.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const joinExperience = await readFile(new URL("../components/join-experience.tsx", import.meta.url), "utf8");
const joinStyles = await readFile(new URL("../components/join-experience.css", import.meta.url), "utf8");
const aboutPage = await readFile(new URL("../components/about-team-page.tsx", import.meta.url), "utf8");
const aboutStyles = await readFile(new URL("../components/about-team-page.css", import.meta.url), "utf8");
const aboutData = await readFile(new URL("../data/about-team.ts", import.meta.url), "utf8");
const aboutSources = await readFile(new URL("../../../../docs/about-page-fact-sources.md", import.meta.url), "utf8");
const historyData = await readFile(new URL("../data/team-history.ts", import.meta.url), "utf8");
const historyArchive = await readFile(new URL("../components/team-history-archive.tsx", import.meta.url), "utf8");
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
  for (const anchor of ["hero", "about", "robots"]) {
    const anchorSource = anchor === "about" ? aboutPage : home;
    assert.ok(anchorSource.includes(`id="${anchor}"`), `missing legacy home anchor #${anchor}`);
  }
  assert.ok(historyArchive.includes('id="achievements"'), "missing legacy archive anchor #achievements");
  assert.ok(eventsArchive.includes('id="certificates"'), "missing archive anchor #certificates");
  assert.match(home, /"#certificates": "\/events-and-honors#certificates"/);
  assert.ok(joinExperience.includes("id=\"join\""), "missing legacy join anchor #join");
  assert.match(home, /hero-showreel\.mp4/);
  assert.match(home, /import \{ TeamHistoryArchive \} from "\.\.\/components\/team-history-archive"/);
  assert.match(home, /<TeamHistoryArchive \/>/);
  assert.match(historyData, /year: 2018,[\s\S]*?year: 2026,/);
  assert.match(historyArchive, /href=\{`#team-history-\$\{year\}`\}/);
  assert.match(honorsData, /Array\.from\(\{ length: 25 \}/);
  assert.match(eventsArchive, /getMaterialsForYear\(year\)\.map\(/);
  assert.doesNotMatch(home, /timelineMilestones|scrollToTimelineYear/);
  assert.match(home, /<RobotPhotoGallery \/>/);
});

test("topic content keeps the five group definitions, dedicated about page, and separate evidence-based archives", () => {
  assert.match(home, /const groups = \[/);
  assert.match(home, /机械组/);
  assert.match(home, /电控组/);
  assert.match(home, /视觉组/);
  assert.match(home, /AI组/);
  assert.match(home, /运营组/);
  assert.match(home, /<AboutTeamPage groups=\{groups\} \/>/);
  assert.doesNotMatch(home, /const aboutModules = \[/);
  assert.match(aboutPage, /吉甲大师/);
  assert.match(aboutPage, /TARS-Go/);
  assert.match(home, /<EventsAndHonorsArchive \/>/);
  assert.match(home, /<TeamHistoryArchive \/>/);
  assert.match(historyData, /sourceIds: \[/);
  assert.match(eventsArchive, /精选成果[\s\S]*?历年赛事[\s\S]*?荣誉证书/);
  assert.match(honorsData, /source\("RoboMaster 2025 全国赛获奖名单"/);
  assert.match(joinExperience, /memberGrowthStages\.map/);
});

test("the homepage uses six image-led routes, preserves legacy hashes, and keeps reduced-motion video behavior", () => {
  const modules = home.match(/const homeNavigationModules = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  assert.equal((modules.match(/title: /g) ?? []).length, 6);
  assert.doesNotMatch(home, /25 张荣誉证书原图/);
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

test("the about page explains platform identity, group collaboration, member growth, and traceable sources", async () => {
  assert.match(aboutPage, /一个实践平台，一支工程战队/);
  assert.match(aboutPage, /吉甲大师是平台，TARS-Go 是战队/);
  assert.match(aboutPage, /about-groups-grid/);
  assert.match(aboutPage, /about-engineering-flow/);
  assert.match(aboutPage, /about-operations-thread/);
  assert.match(aboutPage, /about-growth-path/);
  assert.match(aboutPage, /五个组别/);
  assert.match(aboutPage, /训练营、校内实践、技术开源和前辈分享/);
  assert.match(aboutPage, /不是统一课表或固定晋升制度/);
  assert.match(aboutPage, /to="\/team-history"/);
  assert.match(aboutPage, /to="\/robots"/);
  assert.match(aboutPage, /to="\/events-and-honors"/);
  assert.match(aboutPage, /to="\/join"/);
  assert.match(aboutPage, /loading="lazy"/);
  assert.match(aboutData, /teamOutcomes/);
  assert.match(aboutData, /engineeringStages/);
  assert.match(aboutData, /memberGrowthStages/);
  assert.match(aboutSources, /team-foundation-v1\.0\.md/);
  assert.match(aboutSources, /当前各组实际人员配置/);
  assert.match(aboutSources, /赛季口号与长期队训/);
  assert.match(aboutStyles, /:root\[data-theme="dark"\] \.about-group-mark__light/);
  assert.match(aboutStyles, /:root\[data-theme="dark"\] \.about-group-mark__dark/);
  for (const breakpoint of ["640px", "900px", "1200px", "1500px"]) {
    assert.ok(aboutStyles.includes(`min-width: ${breakpoint}`), `missing about layout breakpoint ${breakpoint}`);
  }

  const operationsMark = await readFile(new URL("../../../../public/assets/images/Groups/operations-black.svg", import.meta.url));
  assert.equal(
    createHash("sha256").update(operationsMark).digest("hex"),
    "a62b6c62a94e6141669bc6de6602cca280eeacd2975302d2762615bcb3788bf8",
    "the site must keep the latest seven-piece Operations mark, not the withdrawn old O mark",
  );

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
  assert.match(joinExperience, /activeGroup\.collaboration/);
  assert.match(joinExperience, /import \{ memberGrowthStages \} from "\.\.\/data\/about-team"/);
  assert.match(joinStyles, /:root\[data-theme="dark"\] \.join-group-mark__light/);
  assert.match(joinStyles, /:root\[data-theme="dark"\] \.join-group-mark__dark/);
  assert.match(joinStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the join guide shows the verified current cycle and only a truthful next action", () => {
  assert.match(joinExperience, /phase: "between-cycles"/);
  assert.match(joinExperience, /cycle: "2026 纳新"/);
  assert.match(joinExperience, /本轮结果通知已基本完成；下一轮安排尚未发布/);
  assert.doesNotMatch(joinExperience, /to="\/register"/);
  assert.match(joinExperience, /当届报名开放后/);
  assert.match(joinExperience, /to="\/dashboard\/users\/registrations"/);
  assert.match(joinExperience, /href="#footer-social-heading"/);
  assert.match(joinExperience, /publicRecruitmentState\.phase === "open"/);
  assert.match(joinExperience, /材料初筛/);
  assert.match(joinExperience, /确认面试/);
  assert.match(joinExperience, /查看结果/);
  assert.match(joinExperience, /注册完成后仍要单独提交报名/);
  assert.match(joinStyles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(joinStyles, /@media \(min-width: 768px\) and \(max-width: 1023px\)[\s\S]*?\.join-growth-path\s*\{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("the join guide reuses shared group facts and references existing local photography", async () => {
  const imagePaths = [...joinExperience.matchAll(/(?:src=|image:)\s*"(\/assets\/images\/[^\"]+\.webp)"/g)].map((match) => match[1]);
  assert.ok(imagePaths.length >= 5, "the join guide should remain image-led");
  assert.equal(new Set(imagePaths).size, imagePaths.length, "the featured join photos should not repeat");
  for (const imagePath of imagePaths) {
    await readFile(new URL(`../../../../public${imagePath}`, import.meta.url));
  }
  assert.match(home, /collaboration:/);
  assert.match(joinExperience, /activeGroup\.collaboration/);
});

test("the dedicated join guide only renders on its join route", () => {
  assert.match(home, /routePage === "join" \? <JoinExperience groups=\{groups\} \/> : null/);
});
