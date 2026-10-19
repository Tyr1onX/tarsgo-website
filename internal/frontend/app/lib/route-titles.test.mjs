import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routeConfig = readFileSync(resolve(appDirectory, "routes.ts"), "utf8");
const rootModule = readFileSync(resolve(appDirectory, "root.tsx"), "utf8");

function getPageTitle(source, modulePath) {
  const reexport = source.match(/export\s*\{[^}]*\bmeta\b[^}]*\}\s*from\s*"([^"]+)"/);
  if (reexport) {
    const targetPath = resolve(dirname(resolve(appDirectory, modulePath)), `${reexport[1]}.tsx`);
    const targetSource = readFileSync(targetPath, "utf8");
    const targetModule = targetPath.slice(appDirectory.length + 1);
    return getPageTitle(targetSource, targetModule);
  }

  const metaMatch = source.match(/export function meta\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(metaMatch, `${modulePath} must export route metadata`);

  const inlineTitle = metaMatch[1].match(/\{\s*title:\s*"([^"]+)"\s*\}/);
  if (inlineTitle) return inlineTitle[1];

  if (metaMatch[1].match(/\{\s*title\s*\}/)) {
    const titleConstant = source.match(/const title\s*=\s*"([^"]+)"/);
    assert.ok(titleConstant, `${modulePath} must define its referenced title`);
    return titleConstant[1];
  }

  assert.fail(`${modulePath} metadata must define a title`);
}

test("root layout supplies a branded fallback title", () => {
  assert.match(rootModule, /export function meta\(\)\s*\{\s*return \[\{ title: "吉甲大师战队官网 \| TARSGO" \}\];\s*\}/);
});

test("every registered leaf route has a TARSGO page title", () => {
  const modules = [...routeConfig.matchAll(/"(routes\/[^"]+\.tsx)"/g)].map((match) => match[1]);
  assert.ok(modules.length > 0, "route registry must include page modules");

  const layoutModules = new Set(["routes/dashboard/layout.tsx"]);
  for (const modulePath of modules) {
    if (layoutModules.has(modulePath)) continue;

    const source = readFileSync(resolve(appDirectory, modulePath), "utf8");
    const title = getPageTitle(source, modulePath);
    if (modulePath === "routes/home.tsx") {
      assert.equal(title, "TARSGO | 吉林大学吉甲大师战队");
    } else {
      assert.match(title, /^.+ \| TARSGO$/, `${modulePath} title must end in "| TARSGO"`);
    }
  }
});
