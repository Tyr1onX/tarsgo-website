import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/robot-photo-gallery.tsx", import.meta.url), "utf8");
const data = await readFile(new URL("../data/robot-seasons.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const manifests = new Map();
const { robotSeasons, sortRobotsByNumber } = await import("../data/robot-seasons.ts");
for (const season of [2024, 2025, 2026]) {
  try {
    manifests.set(
      season,
      JSON.parse(await readFile(new URL(`../../../../source-assets/robot-gallery/${season}/manifest.json`, import.meta.url), "utf8")),
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function seasonData(season) {
  const start = data.indexOf(`season: ${season},`);
  assert.notEqual(start, -1, `${season} season data`);
  const nextSeason = data.indexOf("season:", start + 1);
  return data.slice(start, nextSeason === -1 ? data.length : nextSeason);
}

async function assertManifestAssets(season, manifest, expectedFiles, dimensions) {
  const seasonSource = seasonData(season);
  assert.equal(manifest.season, season);
  assert.equal(manifest.photos.length, expectedFiles.length);
  assert.deepEqual(manifest.photos.map((photo) => photo.originalFilename), expectedFiles);
  assert.equal(manifest.sourceArchive, `source-assets/robot-gallery/${season}/originals/`);

  for (const photo of manifest.photos) {
    const sourceEntryStart = seasonSource.indexOf(`sourceFilename: ${JSON.stringify(photo.originalFilename)},`);
    assert.notEqual(sourceEntryStart, -1, `${season} source entry for ${photo.originalFilename}`);
    const sourceEntry = seasonSource.slice(sourceEntryStart, seasonSource.indexOf("image: {", sourceEntryStart));
    assert.ok(sourceEntry.includes(`sourceSha256: "${photo.originalSha256}"`), `${photo.originalFilename} TypeScript checksum`);
    assert.ok(seasonSource.includes(`/Robot/${season}/`), `${season} derivative paths`);

    const source = await readFile(new URL(`../../../../source-assets/robot-gallery/${season}/${photo.originalPath}`, import.meta.url));
    const digest = createHash("sha256").update(source).digest("hex");
    assert.equal(digest, photo.originalSha256, `${photo.originalFilename} checksum`);
    assert.equal(source.byteLength, photo.originalBytes, `${photo.originalFilename} source size`);
    assert.equal(photo.originalWidth, dimensions[0], `${photo.originalFilename} source width`);
    assert.equal(photo.originalHeight, dimensions[1], `${photo.originalFilename} source height`);
    assert.deepEqual(photo.assets.map((asset) => asset.width), [720, 1440, 2400]);

    for (const asset of photo.assets) {
      const output = new URL(`../../../../${asset.path}`, import.meta.url);
      const bytes = await readFile(output);
      const fileInfo = await stat(output);
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      assert.equal(fileInfo.size, asset.bytes);
    }
  }
}

test("the 2024 archive keeps its eleven original photos and order when source assets are available", { skip: !manifests.has(2024) }, async () => {
  const expected = [
    "1号英雄.JPG",
    "1号英雄（备车）.JPG",
    "2号工程.JPG",
    "4号步兵.JPG",
    "9号雷达.JPG",
    "3号步兵.JPG",
    "5号步兵（备车）.JPG",
    "7号哨兵.JPG",
    "5号步兵.JPG",
    "8号飞镖.JPG",
    "6号无人机.JPG",
  ];
  await assertManifestAssets(2024, manifests.get(2024), expected, [8192, 5464]);
});

test("the 2025 archive maps the nine uploaded filenames to their own season and robots when source assets are available", { skip: !manifests.has(2025) }, async () => {
  const manifest = manifests.get(2025);
  const expected = [
    "1号英雄.JPG", "2号工程.JPG", "3号步兵.JPG", "4号步兵.JPG",
    "7号哨兵.JPG", "9号雷达.JPG", "8号飞镖.JPG", "英雄备车.JPG", "6号无人机.JPG",
  ];
  assert.equal(manifest.conversion.format, "WebP");
  assert.deepEqual(manifest.conversion.widths, [720, 1440, 2400]);
  await assertManifestAssets(2025, manifest, expected, [6000, 4000]);
  assert.deepEqual(manifest.photos.map(({ name, category }) => [name, category]), [
    ["1号英雄机器人", "英雄"], ["2号工程机器人", "工程"], ["3号步兵机器人", "步兵"],
    ["4号步兵机器人", "步兵"], ["7号哨兵机器人", "哨兵"], ["9号雷达系统", "雷达"],
    ["8号飞镖系统", "飞镖"], ["英雄机器人（备车）", "英雄"], ["6号无人机", "空中"],
  ]);
});

test("the 2026 archive maps all ten uploaded photos, including both independent backup robots when source assets are available", { skip: !manifests.has(2026) }, async () => {
  const manifest = manifests.get(2026);
  const expected = [
    "3.JPG", "4.JPG", "1.JPG", "1（备车）.JPG", "2.JPG",
    "9.JPG", "3（备车）.JPG", "7.JPG", "8.JPG", "6.JPG",
  ];
  assert.equal(manifest.conversion.format, "WebP");
  assert.deepEqual(manifest.conversion.widths, [720, 1440, 2400]);
  await assertManifestAssets(2026, manifest, expected, [6960, 4640]);
  assert.deepEqual(manifest.photos.map(({ name, category }) => [name, category]), [
    ["3号步兵机器人", "步兵"], ["4号步兵机器人", "步兵"], ["1号英雄机器人", "英雄"],
    ["1号英雄机器人（备车）", "英雄"], ["2号工程机器人", "工程"], ["9号雷达系统", "雷达"],
    ["3号步兵机器人（备车）", "步兵"], ["7号哨兵机器人", "哨兵"], ["8号飞镖系统", "飞镖"],
    ["6号无人机", "空中"],
  ]);
  assert.equal(new Set(manifest.photos.map(({ id }) => id)).size, 10);
});

test("all three seasons sort by robot number and keep numbered backups next to their main robots", () => {
  const expectedIdsBySeason = new Map([
    [2024, [
      "hero-01", "hero-01-backup", "engineering-02", "infantry-03", "infantry-04",
      "infantry-05", "infantry-05-backup", "air-06", "sentinel-07", "dart-08", "radar-09",
    ]],
    [2025, [
      "2025-hero-01", "2025-engineering-02", "2025-infantry-03", "2025-infantry-04",
      "2025-air-06", "2025-sentinel-07", "2025-dart-08", "2025-radar-09", "2025-hero-backup",
    ]],
    [2026, [
      "2026-hero-01", "2026-hero-01-backup", "2026-engineering-02", "2026-infantry-03",
      "2026-infantry-03-backup", "2026-infantry-04", "2026-air-06", "2026-sentinel-07",
      "2026-dart-08", "2026-radar-09",
    ]],
  ]);

  for (const season of robotSeasons) {
    const ordered = sortRobotsByNumber(season.robots);
    const expectedIds = expectedIdsBySeason.get(season.season);
    assert.deepEqual(ordered.map(({ id }) => id), expectedIds, `${season.season} season order`);

    for (const category of new Set(ordered.map(({ category }) => category))) {
      const filtered = ordered.filter((robot) => robot.category === category);
      assert.deepEqual(
        filtered.map(({ id }) => id),
        expectedIds.filter((id) => ordered.find((robot) => robot.id === id).category === category),
        `${season.season} ${category} filter order`,
      );
    }
  }

  assert.deepEqual(robotSeasons.map(({ season }) => season), [2026, 2025, 2024]);
});

test("all public robot photos have intact responsive WebP variants and source fingerprints", async () => {
  assert.deepEqual(robotSeasons.map(({ season }) => season), [2026, 2025, 2024]);
  const fingerprints = new Set();

  for (const season of robotSeasons) {
    for (const robot of season.robots) {
      assert.match(robot.sourceSha256, /^[a-f0-9]{64}$/);
      assert.ok(!fingerprints.has(robot.sourceSha256), `${robot.id} has a duplicate source fingerprint`);
      fingerprints.add(robot.sourceSha256);

      for (const [width, imagePath] of [[720, robot.image.thumbnail], [1440, robot.image.medium], [2400, robot.image.large]]) {
        assert.ok(imagePath.includes(`/Robot/${season.season}/`), `${robot.id} ${width}px image stays in its season`);
        assert.ok(imagePath.endsWith(`-${width}.webp`), `${robot.id} has its ${width}px image`);
        const image = await readFile(new URL(`../../../../public/${imagePath.slice(1)}`, import.meta.url));
        assert.equal(image.toString("ascii", 0, 4), "RIFF", `${imagePath} RIFF container`);
        assert.equal(image.toString("ascii", 8, 12), "WEBP", `${imagePath} WebP payload`);
      }
    }
  }

  assert.equal(fingerprints.size, 30);
});

test("all three seasons contain thirty unique photo fingerprints and 2026 is the default", () => {
  const allPhotos = robotSeasons.flatMap(({ robots }) => robots);
  assert.equal(allPhotos.length, 30);
  const allHashes = allPhotos.map(({ sourceSha256 }) => sourceSha256);
  assert.equal(new Set(allHashes).size, 30);
  assert.deepEqual(
    [...data.matchAll(/season: (202\d),/g)].map(([, season]) => Number(season)),
    [2026, 2025, 2024],
  );
  assert.match(component, /useState\(2026\)/);
  assert.match(component, /robotSeasons\.map\(\(season\)/);
  assert.match(component, /aria-pressed=\{activeSeasonYear === season\.season\}/);
  assert.match(home, /image: "\/assets\/images\/Robot\/2026\/hero-01-1440\.webp"/);
  assert.match(home, /2026 \/ 2025 \/ 2024 赛季机器人阵容/);
  assert.doesNotMatch(home, /切换赛季，浏览 2026、2025 与 2024 三季共 30 张真实机器人定妆照/);
  assert.doesNotMatch(component, /activeSeason\.description/);
  assert.doesNotMatch(data, /收录 202[456] 赛季/);
});

test("switching seasons resets the category and closes any active preview", () => {
  assert.match(component, /function selectSeason\(seasonYear: number\)[\s\S]*?dialogRef\.current\?\.close\(\);[\s\S]*?setSelectedRobotId\(null\);[\s\S]*?setActiveCategory\("all"\);[\s\S]*?setActiveSeasonYear\(seasonYear\);/);
  assert.match(component, /const robots = useMemo\(\(\) => sortRobotsByNumber\(activeSeason\.robots\), \[activeSeason\]\)/);
  assert.match(component, /robots\.filter\(\(robot\) => robot\.category === activeCategory\)/);
  assert.match(component, /\{activeSeason\.season\} SEASON · \{selectedRobot\.category\}/);
});

test("gallery filters cover every requested category and use natural number order", () => {
  for (const label of ["全部", "英雄", "工程", "步兵", "空中", "哨兵", "飞镖", "雷达"]) {
    assert.match(component, new RegExp(`label: "${label}"`));
  }
  assert.match(component, /sortRobotsByNumber\(activeSeason\.robots\)/);
  assert.match(component, /robots\.filter\(\(robot\) => robot\.category === activeCategory\)/);
  assert.match(component, /aria-pressed=\{selected\}/);
  assert.match(component, /loading=\{index === 0 \? "eager" : "lazy"\}/);
  assert.match(component, /fetchPriority=\{index === 0 \? "high" : "auto"\}/);
  assert.match(component, /srcSet=\{getImageSet\(robot\)\}/);
});

test("lightbox supports filtered previous/next navigation, Escape, arrow keys, and native dialog focus restoration", () => {
  assert.match(component, /const selectedRobotIndex = visibleRobots\.findIndex/);
  assert.match(component, /visibleRobots\[nextIndex\]\.id/);
  assert.match(component, /<dialog[\s\S]*?onCancel=\{/);
  assert.match(component, /event\.key === "ArrowLeft"[\s\S]*?movePreview\(-1\)/);
  assert.match(component, /event\.key === "ArrowRight"[\s\S]*?movePreview\(1\)/);
  assert.match(component, /onClose=\{\(\) => setSelectedRobotId\(null\)\}/);
  assert.match(component, /dialog\.showModal\(\)/);
  assert.match(component, /aria-label="关闭机器人照片预览"/);
  assert.match(component, /aria-label="查看上一张机器人照片/);
  assert.match(component, /aria-label="查看下一张机器人照片/);
  assert.match(component, /String\(visibleRobots\.length\)/);
  assert.match(component, /robot-gallery__season-switch/);
});

test("photos stay fully visible on a fixed light stage in the platinum and dark themes", () => {
  assert.match(styles, /\.robot-gallery__image\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(styles, /\.robot-gallery__dialog-image\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(styles, /\.robot-gallery__image-button\s*\{[^}]*background:\s*#f5f4f1;/);
  assert.match(styles, /\.robot-gallery__dialog-stage\s*\{[^}]*background:\s*#f5f4f1;/);
  assert.match(styles, /@media \(min-width: 640px\)[\s\S]*?\.robot-gallery__grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*?\.robot-gallery__grid\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.robot-gallery__filter,[\s\S]*?transition:\s*none;/);
  assert.match(styles, /\.robot-gallery__season-switch button:focus-visible/);
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*?\.robot-gallery__season-switch\s*\{[^}]*width:\s*100%/);
});
