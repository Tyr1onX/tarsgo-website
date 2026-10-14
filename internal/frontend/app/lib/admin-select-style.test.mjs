import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const appStyles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const adminStyles = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");
const adminRouteDirectory = new URL("../routes/admin/", import.meta.url);

function collectSelectOpeningTags(source) {
  const tags = [];
  for (const match of source.matchAll(/<select\b/g)) {
    let cursor = match.index + match[0].length;
    let braceDepth = 0;
    let quote = null;
    let escaped = false;

    for (; cursor < source.length; cursor += 1) {
      const character = source[cursor];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }

      if (character === "\"" || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth -= 1;
      } else if (character === ">" && braceDepth === 0) {
        tags.push(source.slice(match.index, cursor + 1));
        break;
      }
    }
  }
  return tags;
}

test("admin native selects retain one non-repeating arrow with room for their text", () => {
  const selectRule = appStyles.match(/(?:^|\n)select\s*\{([^}]+)\}/)?.[1] ?? "";
  const lightSelectRule = appStyles.match(/:root\[data-theme="light"\]\s+select\s*\{([^}]+)\}/)?.[1] ?? "";
  const fieldRule = adminStyles.match(/\.admin-design\s+\.admin-field\s*\{([^}]+)\}/)?.[1] ?? "";
  const adminSelectRule = adminStyles.match(/\.admin-design\s+select\.admin-field\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(selectRule, /appearance:\s*none;/);
  assert.match(selectRule, /background-position:\s*right\s+0\.9rem\s+center;/);
  assert.match(selectRule, /background-repeat:\s*no-repeat;/);
  assert.match(selectRule, /background-size:\s*1rem\s+1rem;/);
  assert.match(lightSelectRule, /background-image:\s*url\(/);
  assert.match(fieldRule, /background-color:\s*var\(--admin-input-surface\);/);
  assert.doesNotMatch(fieldRule, /^\s*background\s*:/m);
  assert.match(adminSelectRule, /padding-right:\s*2\.75rem;/);
});

test("every native select in admin routes uses the shared admin-field styles", async () => {
  const files = (await readdir(adminRouteDirectory)).filter((file) => file.endsWith(".tsx"));
  const selects = [];

  for (const file of files) {
    const source = await readFile(new URL(file, adminRouteDirectory), "utf8");
    selects.push(...collectSelectOpeningTags(source).map((openingTag) => ({ file, openingTag })));
  }

  assert.ok(selects.length > 0, "expected admin routes to contain native selects");
  for (const { file, openingTag } of selects) {
    assert.match(openingTag, /className\s*=\s*"[^"]*\badmin-field\b/, `${file} select must use admin-field`);
  }
});
