import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const appStyles = await readFile(new URL("../app.css", import.meta.url), "utf8");
const adminStyles = await readFile(new URL("../admin-design.css", import.meta.url), "utf8");
const adminRouteDirectory = new URL("../routes/admin/", import.meta.url);
const appDirectory = new URL("../", import.meta.url);

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

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

function collectNativeSelectRules(styles) {
  const withoutComments = styles.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/gs)]
    .filter(([, selector]) => /(?<![\w-])select(?![\w-])/i.test(selector));
}

test("native selects keep the browser arrow across global and route styles", async () => {
  const styleFiles = (await listFiles(appDirectory)).filter((path) => path.pathname.endsWith(".css"));
  const routeStyles = await Promise.all(styleFiles.map((path) => readFile(path, "utf8")));
  const selectRules = collectNativeSelectRules([appStyles, adminStyles, ...routeStyles].join("\n"));
  const arrowOverrides = selectRules.filter(([, selector, declarations]) =>
    /::-ms-expand/i.test(selector) ||
    /\bappearance\s*:\s*none\b/i.test(declarations) ||
    /\bbackground-image\s*:/i.test(declarations),
  );

  assert.deepEqual(arrowOverrides, [], "native selects must not hide the platform arrow or paint a CSS arrow");
  assert.doesNotMatch(adminStyles, /\.admin-design\s+select\.admin-field\s*\{/);
  assert.match(adminStyles, /\.admin-design\s+\.admin-field\s*\{[^}]*background-color:\s*var\(--admin-input-surface\);/s);
  assert.match(adminStyles, /\.admin-design\s+\.admin-field\s*\{[^}]*color-scheme:\s*var\(--theme-color-scheme\);/s);
  assert.match(appStyles, /--theme-color-scheme:\s*dark;/);
  assert.match(appStyles, /--theme-color-scheme:\s*light;/);
  assert.match(appStyles, /body\s*\{[^}]*color-scheme:\s*var\(--theme-color-scheme,\s*dark\);/s);
  assert.doesNotMatch(appStyles, /\.motion-select\s*\{/);
});

test("native selects do not opt out of browser appearance in route markup", async () => {
  const files = (await listFiles(new URL("../routes/", import.meta.url))).filter((path) => path.pathname.endsWith(".tsx"));
  const selects = [];

  for (const path of files) {
    const source = await readFile(path, "utf8");
    selects.push(...collectSelectOpeningTags(source).map((openingTag) => ({ path, openingTag })));
  }

  assert.ok(selects.length > 0, "expected routes to contain native selects");
  for (const { path, openingTag } of selects) {
    assert.doesNotMatch(openingTag, /appearance-none|bg-\[[^\]]*url\(/, `${path.pathname} select must use the browser arrow`);
  }
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
