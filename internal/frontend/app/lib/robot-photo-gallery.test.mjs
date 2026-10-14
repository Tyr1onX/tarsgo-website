import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/robot-photo-gallery.tsx", import.meta.url), "utf8");
const data = await readFile(new URL("../data/robot-seasons.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../../../../source-assets/robot-gallery/2024/manifest.json", import.meta.url), "utf8"));

test("the 2024 archive contains the eleven uploaded photos in their original order", async () => {
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
  assert.equal(manifest.season, 2024);
  assert.deepEqual(manifest.photos.map((photo) => photo.originalFilename), expected);
  assert.deepEqual(
    [...data.matchAll(/\bid: "([^"]+)"/g)].map(([, id]) => id),
    manifest.photos.map((photo) => photo.id),
  );

  for (const photo of manifest.photos) {
    const entry = data.match(new RegExp(`id: "${photo.id}",([\\s\\S]*?)image: \\{`))?.[1] ?? "";
    assert.ok(entry.includes(`sourceFilename: "${photo.originalFilename}"`), `${photo.id} source filename`);
    assert.ok(entry.includes(`sourceSha256: "${photo.originalSha256}"`), `${photo.id} source checksum`);
    const source = await readFile(new URL(`../../../../source-assets/robot-gallery/2024/${photo.originalPath}`, import.meta.url));
    const digest = createHash("sha256").update(source).digest("hex");
    assert.equal(digest, photo.originalSha256, `${photo.originalFilename} checksum`);
    assert.equal(source.byteLength, photo.originalBytes, `${photo.originalFilename} source size`);
    assert.equal(photo.originalWidth, 8192, `${photo.originalFilename} source width`);
    assert.equal(photo.originalHeight, 5464, `${photo.originalFilename} source height`);
  }
});

test("each source has responsive WebP derivatives without replacing its original", async () => {
  assert.equal(manifest.conversion.format, "WebP");
  assert.deepEqual(manifest.conversion.widths, [720, 1440, 2400]);
  assert.equal(manifest.photos.length, 11);
  for (const photo of manifest.photos) {
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
});

test("gallery filters cover every requested category and keep the source order for all results", () => {
  for (const label of ["全部", "英雄", "工程", "步兵", "空中", "哨兵", "飞镖", "雷达"]) {
    assert.match(component, new RegExp(`label: "${label}"`));
  }
  assert.match(component, /robots\.filter\(\(robot\) => robot\.category === activeCategory\)/);
  assert.match(component, /aria-pressed=\{selected\}/);
  assert.match(component, /loading=\{index === 0 \? "eager" : "lazy"\}/);
  assert.match(component, /fetchPriority=\{index === 0 \? "high" : "auto"\}/);
  assert.match(component, /srcSet=\{getImageSet\(robot\)\}/);
});

test("lightbox supports filtered previous/next navigation, Escape, arrow keys, and native dialog focus restoration", () => {
  assert.match(component, /<dialog[\s\S]*?onCancel=\{/);
  assert.match(component, /event\.key === "ArrowLeft"[\s\S]*?movePreview\(-1\)/);
  assert.match(component, /event\.key === "ArrowRight"[\s\S]*?movePreview\(1\)/);
  assert.match(component, /onClose=\{\(\) => setSelectedRobotId\(null\)\}/);
  assert.match(component, /dialog\.showModal\(\)/);
  assert.match(component, /aria-label="关闭机器人照片预览"/);
  assert.match(component, /aria-label="查看上一张机器人照片/);
  assert.match(component, /aria-label="查看下一张机器人照片/);
  assert.match(component, /String\(visibleRobots\.length\)/);
});

test("photos stay fully visible on a fixed light stage in the platinum and dark themes", () => {
  assert.match(styles, /\.robot-gallery__image\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(styles, /\.robot-gallery__dialog-image\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(styles, /\.robot-gallery__image-button\s*\{[^}]*background:\s*#f5f4f1;/);
  assert.match(styles, /\.robot-gallery__dialog-stage\s*\{[^}]*background:\s*#f5f4f1;/);
  assert.match(styles, /@media \(min-width: 640px\)[\s\S]*?\.robot-gallery__grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*?\.robot-gallery__grid\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.robot-gallery__filter,[\s\S]*?transition:\s*none;/);
});
