import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previews = await readFile(new URL("../data/home-image-previews.ts", import.meta.url), "utf8");
const navigation = await readFile(new URL("../components/home-visual-navigation.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../routes/home.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app.css", import.meta.url), "utf8");

test("every homepage photo has a tiny inline, valid WebP preview", () => {
  for (const name of ["about", "robots", "join", "events", "history", "micro"]) {
    const data = previews.match(new RegExp(`  ${name}: "data:image/webp;base64,([^"]+)"`))?.[1];
    assert.ok(data, `missing inline preview for ${name}`);
    const image = Buffer.from(data, "base64");
    assert.equal(image.toString("ascii", 0, 4), "RIFF");
    assert.equal(image.toString("ascii", 8, 12), "WEBP");
    assert.ok(image.length <= 512, `${name} preview exceeds 512 bytes`);
    assert.ok(navigation.includes(`preview: homeImagePreviews.${name}`));
  }
  assert.match(navigation, /className="home-visual-card-preview"/);
  assert.match(navigation, /onLoad=\{\(\) => setImageLoaded\(true\)\}/);
  assert.match(navigation, /onError=\{\(\) => setImageLoaded\(false\)\}/);
  assert.match(styles, /\.home-visual-card\[data-image-loaded="true"\] > img \{ opacity: 1; \}/);
});

test("production homepage shows progressive photos without a reveal animation", () => {
  assert.match(home, /<HomeVisualNavigation \/>/);
  assert.doesNotMatch(navigation, /HomeSandRevealLayer|data-sand-phase|IntersectionObserver/);
  assert.match(styles, /\.home-visual-card-preview \{[\s\S]*?filter: blur\(12px\);/);
});

test("sponsors show a readable brand fallback while an image loads or fails", () => {
  assert.match(home, /function HomeSponsorImage\(/);
  assert.match(home, /className="home-sponsor-fallback"/);
  assert.match(home, /onLoad=\{\(\) => setLoaded\(true\)\}/);
  assert.match(home, /onError=\{\(\) => setLoaded\(false\)\}/);
  assert.match(home, /<HomeSponsorImage src="\/assets\/images\/Sponsors\/dji\.svg"/);
  assert.match(home, /<HomeSponsorImage src=\{sponsor\.image\} alt=\{sponsor\.name\}/);
  assert.match(styles, /\.home-sponsor-image > img\[data-loaded="true"\] \{ opacity: 1; \}/);
});
