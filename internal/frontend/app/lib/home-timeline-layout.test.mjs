import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const milestonesSource = home.match(/const timelineMilestones = \[([\s\S]*?)\n\];\n\nconst sponsorLogos/)?.[1] ?? "";
const milestoneYears = Array.from(milestonesSource.matchAll(/year: "(\d{4})"/g), ([, year]) => year);

test("the timeline keeps all eight historical years and their source records", () => {
  assert.deepEqual(milestoneYears, ["2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]);
  assert.equal((milestonesSource.match(/images:/g) ?? []).length, 8);
  assert.match(milestonesSource, /首次出征 ICRA 人工智能挑战赛（蒙特利尔），获得三等奖/);
  assert.match(milestonesSource, /首次挺进全国总决赛/);
  assert.match(milestonesSource, /机器人全面升级/);
});

test("year controls and the timeline region expose keyboard-accessible navigation", () => {
  assert.match(home, /nav aria-label="按年份定位团队历程"/);
  assert.match(home, /aria-pressed=\{activeTimelineYear === item\.year\}/);
  assert.match(home, /id=\{`team-milestone-\$\{item\.year\}`\}/);
  assert.match(home, /role="region"[\s\S]*?aria-label="团队历程内容，2018 至 2025 年"[\s\S]*?tabIndex=\{0\}/);
  assert.match(home, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
});

test("desktop uses a bounded native scroll region and smaller screens keep natural page flow", () => {
  assert.match(styles, /\.team-timeline-window\s*\{[^}]*height:\s*40rem;[^}]*max-height:\s*40rem;[^}]*overflow-y:\s*scroll;[^}]*overscroll-behavior:\s*auto;/);
  assert.match(styles, /\.team-timeline-window::-webkit-scrollbar\s*\{[^}]*width:\s*0\.875rem;/);
  assert.match(styles, /\.team-timeline-window::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*var\(--admin-accent\);/);
  assert.match(styles, /@media \(max-width: 1023px\)\s*\{[\s\S]*?\.team-timeline-window\s*\{[^}]*height:\s*auto;[^}]*max-height:\s*none;[^}]*overflow:\s*visible;[^}]*overscroll-behavior:\s*auto;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.team-timeline-window\s*\{\s*scroll-behavior:\s*auto;/);
  assert.doesNotMatch(home, /onWheel|touchmove/i);
});

test("home sections share a content width and imagery uses deliberate aspect ratios", () => {
  assert.match(styles, /\.public-home\s*\{[^}]*--public-content-width:\s*84rem;/);
  assert.match(styles, /\.public-home-container\s*\{[^}]*max-width:\s*var\(--public-content-width\);[^}]*margin-inline:\s*auto;/);
  assert.match(home, /className="public-home-container"/);
  assert.match(home, /aspect-\[16\/10\]/);
  assert.match(home, /team-timeline-image overflow-hidden bg-surface-card/);
  assert.match(styles, /\.team-timeline-image\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10;/);
  assert.match(home, /image\.fit === "contain" \? "object-contain" : "object-cover"/);
});

test("the dedicated honors archive owns certificate records, categorizes awards, and preserves duplicate evidence", async () => {
  const archive = await readFile(new URL("../components/events-and-honors-archive.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("./events-and-honors-data.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../components/events-and-honors-archive.css", import.meta.url), "utf8");
  assert.match(home, /<EventsAndHonorsArchive \/>/);
  assert.match(archive, /id="highlights"[\s\S]*?id="competition-records"[\s\S]*?id="certificates"/);
  assert.equal((data.match(/id: "certificate-\d{2}"/g) ?? []).length, 0, "materials are generated from a single numbered source list");
  assert.match(data, /Array\.from\(\{ length: 25 \}/);
  assert.match(data, /id === "certificate-10"[\s\S]*?duplicate/);
  assert.match(data, /id === "certificate-20"[\s\S]*?duplicate/);
  assert.match(data, /id === "certificate-11"[\s\S]*?supporting/);
  assert.match(data, /id === "certificate-22"[\s\S]*?supporting/);
  assert.match(data, /id === "certificate-24"[\s\S]*?pending/);
  for (const category of ["team", "robot", "project", "instructor"]) assert.ok(data.includes('"' + category + '"'));
  assert.match(data, /荣获|优秀指导老师/);
  assert.match(archive, /event.key === "ArrowLeft"/);
  assert.match(archive, /event.key === "ArrowRight"/);
  assert.match(archive, /event.key === "Home"/);
  assert.match(archive, /event.key === "End"/);
  assert.match(archive, /aria-haspopup="dialog"/);
  assert.match(archive, /award\.certificateIds\.length > 0[\s\S]*?查看证书原件/);
  assert.match(styles, /\.honors-featured-item > \.honors-source-list\s*\{\s*grid-column: 1;/);
  assert.match(styles, /@media \(min-width: 640px\)[\s\S]*?\.honors-featured-item > \.honors-source-list\s*\{\s*grid-column: 2;/);
  assert.match(styles, /\.honors-featured-list\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.honors-material-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  const certificates = await Promise.all(Array.from({ length: 25 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return readFile(new URL(`../../../../public/assets/images/CertificateOfAchievement/certificate-${number}.webp`, import.meta.url));
  }));
  assert.equal(certificates.length, 25);
  assert.equal(createHash("sha256").update(certificates[1]).digest("hex"), createHash("sha256").update(certificates[9]).digest("hex"));
  assert.match(data, /certificateIds: \["certificate-03", "certificate-20"\]/);
});

test("all five about categories remain available and the robot route delegates to the photo gallery", () => {
  const aboutSource = home.match(/const aboutModules = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  assert.equal((aboutSource.match(/name: /g) ?? []).length, 5);
  assert.match(home, /aria-label="团队实践分类"/);
  assert.match(home, /import \{ RobotPhotoGallery \} from "\.\.\/components\/robot-photo-gallery"/);
  assert.match(home, /<RobotPhotoGallery \/>/);
});

test("every sponsor remains in the homepage logo grid without changing source artwork", () => {
  const sponsorSource = home.match(/const sponsorLogos = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  assert.equal((sponsorSource.match(/name: /g) ?? []).length, 10);
  assert.match(home, /sponsorLogos\.map\(/);
  assert.match(home, /className="home-sponsor-logo"/);
  assert.match(styles, /\.home-sponsor-logo\s*\{[^}]*min-height:\s*5rem;[^}]*background:\s*#fff;/);
  assert.match(styles, /\.home-sponsor-logo img\s*\{[^}]*object-fit:\s*contain;/);
});
