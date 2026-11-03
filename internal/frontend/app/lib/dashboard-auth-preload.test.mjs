import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const rootSource = await readFile(new URL("../root.tsx", import.meta.url), "utf8");
const preloadScript = rootSource.match(/const dashboardAuthPreloadScript = `([\s\S]*?)`;/)?.[1];

function executePreload(pathname) {
  const requests = [];
  const document = {
    createElement: (tagName) => ({ tagName }),
    head: { appendChild: (request) => requests.push(request) },
  };

  runInNewContext(preloadScript ?? "", {
    window: { location: { pathname } },
    document,
  });

  return requests;
}

test("dashboard auth preload warms only the existing credentialed /api/me fetch", () => {
  assert.ok(preloadScript, "root should expose the early dashboard auth preload script");

  const [request] = executePreload("/dashboard/workbench");
  assert.deepEqual(request, {
    tagName: "link",
    rel: "preload",
    as: "fetch",
    crossOrigin: "use-credentials",
    href: "/api/me",
  });
});

test("public routes and first-admin setup do not preload authenticated account data", () => {
  assert.deepEqual(executePreload("/"), []);
  assert.deepEqual(executePreload("/dashboard/setup/super-admin"), []);
});
