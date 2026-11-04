import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url));

test("homescreen metadata uses the official robot icon and standalone mode", async () => {
  const root = (await read("../root.tsx")).toString("utf8");
  const manifest = JSON.parse((await read("../../../../public/site.webmanifest")).toString("utf8"));

  assert.match(root, /rel: "apple-touch-icon", href: "\/apple-touch-icon\.png"/);
  assert.match(root, /rel: "manifest", href: "\/site\.webmanifest"/);
  assert.match(root, /name="apple-mobile-web-app-title" content="吉甲大师"/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.short_name, "吉甲大师");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);

  for (const [filename, expectedSize] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
    const png = await read(`../../../../public/${filename}`);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), expectedSize);
    assert.equal(png.readUInt32BE(20), expectedSize);
  }
});
