import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const milestonesSource = home.match(/const timelineMilestones = \[([\s\S]*?)\n\];\n\nconst robots/)?.[1] ?? "";
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

test("the honor gallery shows six certificates by default and retains all original entries", () => {
  const certificateSource = home.match(/const achievementCertificates = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  const certificates = Array.from(certificateSource.matchAll(/"(\/assets\/images\/CertificateOfAchievement\/certificate-\d+\.webp)"/g), ([, path]) => path);
  assert.equal(certificates.length, 25);
  assert.ok(certificates.includes("/assets/images/CertificateOfAchievement/certificate-02.webp"));
  assert.ok(certificates.includes("/assets/images/CertificateOfAchievement/certificate-10.webp"));
  assert.match(home, /achievementCertificates\.slice\(0, 6\)/);
  assert.match(home, /visibleCertificates\.map\(/);
  assert.match(home, /aria-expanded=\{showAllCertificates\}/);
  assert.match(home, /查看全部荣誉/);
  assert.match(home, /收起荣誉/);
  assert.match(home, /certificate-thumbnail[^\"]*aspect-\[4\/3\]/);
  assert.match(home, /className="h-full w-full object-contain"/);
});

test("the original-certificate preview supports keyboard and touch navigation", () => {
  assert.match(home, /key === "ArrowLeft"[\s\S]*?moveCertificatePreview\(-1\)/);
  assert.match(home, /key === "ArrowRight"[\s\S]*?moveCertificatePreview\(1\)/);
  assert.match(home, /key === "Home"[\s\S]*?setSelectedCertificateIndex\(0\)/);
  assert.match(home, /key === "End"[\s\S]*?setSelectedCertificateIndex\(achievementCertificates\.length - 1\)/);
  assert.match(home, /aria-label="查看上一张证书/);
  assert.match(home, /aria-label="查看下一张证书/);
  assert.match(home, /aria-label="关闭证书预览"/);
  assert.match(home, /certificate-preview-image/);
  assert.match(styles, /\.certificate-preview-image\s*\{[^}]*max-height:\s*min\(74dvh,\s*56rem,\s*calc\(92dvh\s*-\s*7rem\)\);/);
});

test("all five about categories and robot options remain available in uniform image frames", () => {
  const aboutSource = home.match(/const aboutModules = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  const robotSource = home.match(/const robots = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  assert.equal((aboutSource.match(/name: /g) ?? []).length, 5);
  assert.equal((robotSource.match(/name: /g) ?? []).length, 5);
  assert.match(home, /aria-label="团队实践分类"/);
  assert.match(home, /aria-label="选择展示机器人"/);
  assert.match(home, /robot-showcase-frame relative aspect-\[16\/10\]/);
  assert.match(home, /robot-showcase-image[^\"]*object-contain/);
  assert.match(home, /visualScale: 1\.45/);
  assert.match(home, /transform: `scale\(\$\{activeRobot\.visualScale\}\)`/);
  assert.match(home, /robot-option-image[^\"]*aspect-\[4\/3\]/);
});

test("every sponsor remains in the homepage logo grid without changing source artwork", () => {
  const sponsorSource = home.match(/const sponsorLogos = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  assert.equal((sponsorSource.match(/name: /g) ?? []).length, 10);
  assert.match(home, /sponsorLogos\.map\(/);
  assert.match(home, /className="home-sponsor-logo"/);
  assert.match(styles, /\.home-sponsor-logo\s*\{[^}]*min-height:\s*5rem;[^}]*background:\s*#fff;/);
  assert.match(styles, /\.home-sponsor-logo img\s*\{[^}]*object-fit:\s*contain;/);
});
