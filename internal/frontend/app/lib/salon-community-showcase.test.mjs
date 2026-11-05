import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detail = await readFile(new URL("../routes/ai-salon-detail.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../salon.css", import.meta.url), "utf8");

test("AI salon detail shows real JLUAI branding and Pixel JLU while preserving registration", async () => {
  assert.match(detail, /<SiteLogo className="salon-partners__team-logo"/);
  assert.match(detail, /src="\/assets\/images\/Community\/jluai\.png"/);
  assert.match(detail, /src="\/assets\/images\/Community\/pixel-jlu-preview\.jpg"/);
  assert.match(detail, /href="https:\/\/jlu\.online\/"/);
  assert.match(detail, /href="https:\/\/jluai\.cn\/"/);
  assert.match(detail, /onClick=\{\(\) => trackSalonRegistrationClick\(event\.id\)\}/);
  assert.match(css, /\.salon-community-feature__preview img\s*\{/);

  const logo = await readFile(new URL("../../../../public/assets/images/Community/jluai.png", import.meta.url));
  const preview = await readFile(new URL("../../../../public/assets/images/Community/pixel-jlu-preview.jpg", import.meta.url));
  assert.ok(logo.byteLength > 0);
  assert.equal(preview[0], 0xff);
  assert.equal(preview[1], 0xd8);
  assert.ok(preview.byteLength < 200_000, "pixel map preview should stay below 200 KB");
});
