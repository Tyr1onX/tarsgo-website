import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const component = await read("../components/brand-loader.tsx");
const css = await read("../components/brand-loader.css");
const logo = await read("../../../../public/assets/images/Logo/tarsgo-logo-v5-light.svg");
const feed = await read("../routes/dashboard/index.tsx");
const thread = await read("../routes/dashboard/community-post.tsx");
const member = await read("../routes/dashboard/community-member-profile.tsx");
const salon = await read("../routes/ai-salon.tsx");
const detail = await read("../routes/ai-salon-detail.tsx");

test("loader reuses only the real TARSGO robot with accessible status", () => {
  assert.match(logo, /id="robot-TARS"/);
  assert.match(component, /tarsgo-logo-v5-light\.svg#robot-TARS/);
  assert.match(component, /<use href=\{robotSymbol\}/);
  assert.match(component, /role="status" aria-label=\{label\}/);
  assert.doesNotMatch(component, /wordmark-TARSGO/);
});

test("sheen delays its appearance and respects reduced motion", () => {
  assert.match(css, /brand-loader-appear 0s 300ms both/);
  assert.match(css, /brand-loader-sheen 2\.5s ease-in-out infinite/);
  assert.match(css, /\.brand-loader__robot--base\s*\{[^}]*opacity: 0\.28;[^}]*blur/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("brand loader is only used when required content is absent", () => {
  assert.match(feed, /visibleLoading && visiblePosts\.length === 0 \? <div[^>]*><BrandLoader/);
  assert.match(thread, /if \(loading\) return <section[^>]*><BrandLoader/);
  assert.match(member, /if \(loading && !result\) return <section[^>]*><BrandLoader/);
  assert.match(salon, /!events \? \(\s*<BrandLoader/);
  assert.match(detail, /!event \? \(\s*!error \? \(\s*<BrandLoader/);
});
