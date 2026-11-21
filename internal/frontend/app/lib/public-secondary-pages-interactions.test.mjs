import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("public photo lightbox uses a native modal and preserves accessible keyboard controls", async () => {
  const source = await read("components/public-motion.tsx");
  const styles = await read("components/public-motion.css");
  assert.match(source, /<dialog[\s\S]*?ref=\{dialogRef\}/);
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /onClose=\{onClose\}/);
  assert.match(source, /dialogRef\.current\?\.close\(\)/);
  assert.match(source, /autoFocus/);
  assert.match(source, /event\.key === "ArrowLeft"/);
  assert.match(source, /event\.key === "ArrowRight"/);
  assert.match(styles, /\.public-lightbox:not\(\[open\]\)\s*\{\s*display: none/);
  assert.doesNotMatch(source, /<figcaption|caption\?: string/);
});

test("join page keeps five group navigation but removes the three-question matcher entirely", async () => {
  const join = await read("components/join-experience.tsx");
  const styles = await read("components/public-motion.css");
  assert.match(join, /role="tablist"/);
  assert.match(join, /useSearchParams\(\)/);
  assert.match(join, /<GroupAnimatedMark/);
  assert.doesNotMatch(join, /matcherQuestions|matcherOpen|recommendedGroupName|join-matcher|方向自测/);
  assert.doesNotMatch(styles, /\.join-matcher/);
});

test("public photos have no decorative captions and honors counts exclude pending source materials", async () => {
  const about = await read("components/about-team-page.tsx");
  const robot = await read("components/robot-photo-gallery.tsx");
  const honors = await read("components/events-and-honors-archive.tsx");
  const history = await read("components/team-history-archive.tsx");
  const micro = await read("routes/micro-specialty-low-altitude.tsx");
  const join = await read("components/join-experience.tsx");
  for (const source of [about, honors, history, join]) {
    assert.doesNotMatch(source, /<figcaption/);
  }
  assert.doesNotMatch(robot, /robot-gallery__view-label|<p>\{robot\.category\}<\/p>/);
  assert.doesNotMatch(micro, /首堂课 · 真实课堂记录|caption:/);
  assert.match(honors, /honorMaterials\.filter\(\(material\) => material\.relation === "certificate"\)\.length/);
  assert.match(honors, /已关联的荣誉材料/);
  assert.doesNotMatch(honors, /AnimatedCounter target=\{honorAwards\.length\} suffix="\+"/);
});
