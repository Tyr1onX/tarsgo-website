import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPublicMeta } from "./social-meta.ts";

const cases = [
  ["home.tsx", "/", "home.jpg"],
  ["about.tsx", "/about", "about.jpg"],
  ["robots.tsx", "/robots", "robots.jpg"],
  ["join.tsx", "/join", "join.jpg"],
  ["events-and-honors.tsx", "/events-and-honors", "events-and-honors.jpg"],
  ["team-history.tsx", "/team-history", "team-history.jpg"],
  ["micro-specialty-low-altitude.tsx", "/micro-specialties/low-altitude-intelligent-sensing-control", "micro-specialty.jpg"],
  ["ai-salon.tsx", "/programs/ai-salon", "ai-salon.jpg"],
];

test("public meta emits absolute Open Graph URLs, distinct social images, and image dimensions", () => {
  const meta = buildPublicMeta({
    title: "测试标题",
    description: "测试介绍",
    path: "/about",
    image: "/assets/images/Social/about.jpg",
  });
  const property = Object.fromEntries(meta.filter((item) => "property" in item).map((item) => [item.property, item.content]));
  const name = Object.fromEntries(meta.filter((item) => "name" in item).map((item) => [item.name, item.content]));

  assert.equal(property["og:title"], "测试标题");
  assert.equal(property["og:description"], "测试介绍");
  assert.equal(property["og:url"], "https://jijiamaster.com/about");
  assert.equal(property["og:image"], "https://jijiamaster.com/assets/images/Social/about.jpg");
  assert.equal(property["og:image:type"], "image/jpeg");
  assert.equal(property["og:image:width"], "1200");
  assert.equal(property["og:image:height"], "630");
  assert.equal(name["twitter:card"], "summary_large_image");
  assert.equal(name["twitter:image"], property["og:image"]);
});

test("all eight public routes use their own bundled JPEG social cover", async () => {
  const config = await readFile(new URL("../../react-router.config.ts", import.meta.url), "utf8");
  for (const [route, path, file] of cases) {
    assert.ok(config.includes('"' + path + '"'), "social crawler would receive a hydration placeholder at " + path);
    const code = await readFile(new URL("../routes/" + route, import.meta.url), "utf8");
    const imagePath = "/assets/images/Social/" + file;
    assert.ok(code.includes('path: "' + path + '"'), "missing OG URL for " + route);
    assert.ok(code.includes('image: "' + imagePath + '"'), "missing OG photo for " + route);
    const image = await readFile(new URL("../../../../public" + imagePath, import.meta.url));
    assert.equal(image[0], 0xff, file);
    assert.equal(image[1], 0xd8, file);
    assert.equal(image[image.length - 2], 0xff, file);
    assert.equal(image[image.length - 1], 0xd9, file);
  }
});
