import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { honorAwards, honorMaterials } from "./events-and-honors-data.ts";

const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const aboutPage = await readFile(new URL("../components/about-team-page.tsx", import.meta.url), "utf8");
const aboutStyles = await readFile(new URL("../components/about-team-page.css", import.meta.url), "utf8");
const historyData = await readFile(new URL("../data/team-history.ts", import.meta.url), "utf8");
const historyArchive = await readFile(new URL("../components/team-history-archive.tsx", import.meta.url), "utf8");
const historyStyles = await readFile(new URL("../components/team-history-archive.css", import.meta.url), "utf8");
const honorsData = await readFile(new URL("./events-and-honors-data.ts", import.meta.url), "utf8");
const milestoneYears = Array.from(historyData.matchAll(/year: (\d{4}),/g), ([, year]) => year);

test("the archive uses sourced events across the requested historical range", () => {
  assert.equal(milestoneYears[0], "2018");
  assert.equal(milestoneYears.at(-1), "2026");
  assert.deepEqual(milestoneYears, [...milestoneYears].sort());
  assert.equal(new Set(milestoneYears).size, milestoneYears.length);
  assert.doesNotMatch(historyData, /stories:\s*\[\s*\]/);
  assert.match(historyData, /第一次走上国际赛场/);
  assert.match(historyData, /名称来自电影《星际穿越》中的机器人 TARS/);
  assert.match(historyData, /第一次进入 RoboMaster 全国总决赛/);
  assert.match(historyData, /TARS-Go 发布 2025 步兵机器人开源资料/);
  assert.match(honorsData, /RoboMaster 2026 机甲大师超级对抗赛全国赛[\s\S]*?全国三等奖/);
  assert.ok((historyData.match(/sourceIds: \[/g) ?? []).length >= milestoneYears.length);
  assert.match(historyData, /teamHistorySources = \{/);
  assert.match(historyData, /honorIds: \["rm-2025-east-team", "rm-2025-national-team", "rm-2025-infantry"\]/);
  assert.match(historyData, /honorIds: \["rm-2026-national-team"\]/);
  assert.match(historyArchive, /import \{ honorAwards \} from "\.\.\/lib\/events-and-honors-data"/);
  assert.match(honorsData, /id: "rm-2026-national-team"/);
  assert.match(honorsData, /id: "rm-2025-infantry"[\s\S]*?机器人竞技奖 · 二等奖/);
  assert.match(honorsData, /id: "rm-2025-hero"[\s\S]*?机器人竞技奖 · 一等奖/);
});

test("year links and source citations use accessible labels and natural page flow", () => {
  assert.match(historyArchive, /nav className="team-history-years" aria-label="按年份浏览团队历程"/);
  assert.match(historyArchive, /href=\{`#team-history-\$\{year\}`\}/);
  assert.match(historyArchive, /id=\{`team-history-\$\{year\}`\}/);
  assert.match(historyArchive, /aria-label=\{`\$\{story\.title\}的资料依据`\}/);
  assert.match(historyArchive, /target="_blank" rel="noreferrer"/);
  assert.doesNotMatch(historyArchive, /team-timeline-window|overflow-y:\s*scroll/);
  assert.doesNotMatch(historyStyles, /height:\s*40rem|max-height:\s*40rem|overflow-y:\s*scroll/);
  assert.match(historyStyles, /scroll-margin-top/);
  assert.doesNotMatch(styles, /team-timeline/);
});

test("real photos, source labels, cross-links and theme tokens are part of the archive", () => {
  assert.equal((historyData.match(/src: "\/assets\/images\//g) ?? []).length, 6);
  assert.match(historyArchive, /<img src=\{image\.src\} alt=\{image\.alt\} loading="lazy" decoding="async" \/>/);
  assert.match(historyArchive, /team-history-related/);
  assert.match(historyArchive, /to="\/events-and-honors"/);
  assert.match(historyArchive, /to="\/robots"/);
  assert.match(historyStyles, /var\(--admin-surface\)/);
  assert.match(historyStyles, /var\(--admin-accent\)/);
  assert.match(historyStyles, /@media \(max-width: 639px\)/);
  assert.match(historyStyles, /@media \(min-width: 1024px\)/);
});

test("home sections share a content width and imagery uses deliberate aspect ratios", () => {
  assert.match(styles, /\.public-home\s*\{[^}]*--public-content-width:\s*84rem;/);
  assert.match(styles, /\.public-home-container\s*\{[^}]*max-width:\s*var\(--public-content-width\);[^}]*margin-inline:\s*auto;/);
  assert.match(home, /className="public-home-container"/);
  assert.match(aboutPage, /about-assembly-[a-f0-9]{8}\.webp/);
  assert.match(aboutStyles, /\.about-place-grid\s*\{/);
  assert.match(aboutStyles, /grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(historyArchive, /className="team-history-photo"/);
  assert.match(historyStyles, /aspect-ratio:\s*16\s*\/\s*10;/);
  assert.match(historyStyles, /object-fit:\s*cover/);
});

test("the honors archive pairs a real competition photo with selected results and a single year-indexed record", async () => {
  const archive = await readFile(new URL("../components/events-and-honors-archive.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("./events-and-honors-data.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../components/events-and-honors-archive.css", import.meta.url), "utf8");
  assert.match(home, /<EventsAndHonorsArchive \/>/);
  assert.match(archive, /id="highlights"[\s\S]*?id="competition-records"[\s\S]*?id="certificates"/);
  assert.match(home, /routePage === "events-and-honors" \? "public-topic-hero--events"/);
  assert.match(archive, /honors-featured-visual[\s\S]*?2024-national-competition\.webp/);
  assert.match(archive, /spotlightAward\.result/);
  assert.match(archive, /aria-label="按年份查看赛事档案"[\s\S]*?honors-year-" \+ year/);
  assert.match(data, /existingHonorMaterials: HonorMaterial\[\] = Array\.from\(\{ length: 25 \}/);
  assert.match(data, /const addedHonorMaterials: HonorMaterial\[\] = \[/);
  assert.equal((data.match(/id: "certificate-\d{2}"/g) ?? []).length, 19, "new material records are explicit and keep their intake classifications");
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
  assert.match(archive, /honors-preview-original/);
  assert.match(archive, /award\.certificateIds\.length > 0[\s\S]*?查看证书原件/);
  assert.match(styles, /\.honors-featured-showcase\s*\{[^}]*grid-template-columns: minmax\(0, 1\.15fr\) minmax\(20rem, 0\.85fr\)/);
  assert.match(styles, /\.honors-year-timeline\s*\{[^}]*border-left:/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.honors-featured-showcase\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.honors-material-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*?\.honors-material-grid\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.honors-material-open:focus-visible/);
  const certificates = await Promise.all(Array.from({ length: 44 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return readFile(new URL(`../../../../public/assets/images/CertificateOfAchievement/certificate-${number}.webp`, import.meta.url));
  }));
  assert.equal(certificates.length, 44);
  for (const certificate of certificates) {
    assert.equal(certificate.toString("ascii", 0, 4), "RIFF");
    assert.equal(certificate.toString("ascii", 8, 12), "WEBP");
    assert.ok(certificate.length > 10_000);
  }
  assert.equal(createHash("sha256").update(certificates[1]).digest("hex"), createHash("sha256").update(certificates[9]).digest("hex"));
  assert.match(data, /certificateIds: \["certificate-03", "certificate-20"\]/);

  assert.equal(honorMaterials.length, 44);
  assert.deepEqual(honorMaterials.map((material) => material.id), Array.from({ length: 44 }, (_, index) => `certificate-${String(index + 1).padStart(2, "0")}`));
  for (const award of honorAwards) {
    for (const certificateId of award.certificateIds) {
      const material = honorMaterials.find((candidate) => candidate.id === certificateId);
      assert.ok(material, `${award.id} references missing ${certificateId}`);
      assert.equal(material.awardId, award.id, `${certificateId} must point back to ${award.id}`);
    }
  }

  const intakeAwardIds = [
    "ican-2023-injection-vision-jilin-first",
    "ican-2023-outstanding-instructor",
    "challenge-cup-2026-jijiazhichuang",
  ];
  assert.deepEqual(honorAwards.filter((award) => intakeAwardIds.includes(award.id)).map((award) => award.category).sort(), ["instructor", "project", "project"]);
  assert.deepEqual(honorAwards.find((award) => award.id === "ican-2023-injection-vision-jilin-first").certificateIds, ["certificate-30"]);
  assert.deepEqual(honorAwards.find((award) => award.id === "ican-2023-injection-vision").certificateIds, ["certificate-21"]);

  const newDuplicates = honorMaterials.filter((material) => [27, 28, 32, 34, 39, 41].includes(Number(material.id.slice("certificate-".length))));
  assert.equal(newDuplicates.length, 6);
  for (const material of newDuplicates) {
    assert.equal(material.relation, "duplicate");
    assert.ok(material.awardId);
    assert.ok(honorAwards.some((award) => award.id === material.awardId));
  }
  const duplicateOriginals = new Map([
    ["certificate-27", "#14"],
    ["certificate-28", "#06"],
    ["certificate-32", "#21"],
    ["certificate-34", "#04"],
    ["certificate-39", "#12"],
    ["certificate-41", "#23"],
  ]);
  for (const [materialId, originalId] of duplicateOriginals) {
    assert.ok(honorMaterials.find((material) => material.id === materialId).note?.includes(originalId));
  }
  const associatedEnvelope = honorMaterials.find((material) => material.id === "certificate-29");
  assert.equal(associatedEnvelope.relation, "supporting");
  assert.ok(associatedEnvelope.note?.includes("#22"));
  const intakeMaterials = honorMaterials.filter((material) => Number(material.id.slice("certificate-".length)) >= 26);
  const pendingMaterials = intakeMaterials.filter((material) => material.relation === "pending");
  assert.equal(pendingMaterials.length, 8);
  assert.ok(pendingMaterials.every((material) => !material.awardId));
  assert.ok(pendingMaterials.some((material) => material.id === "certificate-26" && material.note?.includes("#24")));
  const completionMaterials = honorMaterials.filter((material) => material.kind === "project-completion");
  assert.equal(completionMaterials.length, 4);
  assert.equal(completionMaterials.filter((material) => material.relation === "pending").length, 3);
  assert.equal(completionMaterials.filter((material) => material.relation === "supporting").length, 1);
  assert.ok(completionMaterials.every((material) => !material.awardId));
});

test("the about route renders the brand and group system while the robot route delegates to the photo gallery", () => {
  assert.match(home, /<AboutTeamPage groups=\{groups\} \/>/);
  assert.match(home, /name: "机械组"/);
  assert.match(home, /name: "电控组"/);
  assert.match(home, /name: "视觉组"/);
  assert.match(home, /name: "AI组"/);
  assert.match(home, /name: "运营组"/);
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
