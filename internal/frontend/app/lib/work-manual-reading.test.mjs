import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const routes = source("../routes.ts");
const guide = source("../routes/dashboard/guide.tsx");
const briefing = source("../routes/dashboard/recruitment-briefing.tsx");
const navigation = source("./dashboard-navigation.ts");
const service = source("../../../backend/service/workmanual/service.go");
const router = source("../../../backend/router/router.go");
const catalogue = JSON.parse(source("../../../backend/service/workmanual/content/operations.json"));

test("the briefing SOP has its own workbench route, not another sidebar entry", () => {
  assert.match(routes, /route\("guide\/recruitment-briefing", "routes\/dashboard\/recruitment-briefing\.tsx"\)/);
  assert.match(guide, /<Link className="work-manual__directory-item" to="\/dashboard\/guide\/recruitment-briefing">/);
  assert.doesNotMatch(navigation, /href: "\/dashboard\/guide\/recruitment-briefing"/);
  assert.match(briefing, /to="\/dashboard\/guide\?tab=operations"/);
});

test("the dedicated page reuses the single authorized SOP catalogue", () => {
  assert.match(briefing, /hasOperationsWorkManualAccess\(currentUser, groupResolution\?\.groups\)/);
  assert.match(briefing, /apiRequest<OperationsCatalogue>\("\/api\/work-manual\/operations"\)/);
  assert.match(router, /authenticatedAPI\.Use\(middleware\.RequireAuthenticated\(authService\)\)/);
  assert.match(router, /authenticatedAPI\.GET\("\/work-manual\/operations", workManualHandler\.OperationsCatalogue\)/);
  assert.match(service, /authorizeOperations\(ctx, actor\)/);
  assert.equal(catalogue.documents.length, 2);
  assert.equal(catalogue.documents[0].slug, "campus-network-window");
  assert.equal(catalogue.documents[1].slug, "recruitment-briefing");
});

test("briefing is a single seven-step flow without redundant sections", () => {
  const document = catalogue.documents.find((item) => item.slug === "recruitment-briefing");
  assert.deepEqual(document.sections.map((section) => section.id), ["workflow"]);
  const steps = document.sections[0].blocks;
  assert.equal(steps.length, 7);
  assert.ok(steps.every((step) => step.type === "step" && step.items.length === 1));
  assert.match(briefing, /<ol className="briefing-flow__steps">/);
  assert.doesNotMatch(briefing, /<details|ExtraSection|StageContent|历史经验|速查与复盘/);
  assert.match(guide, /<OperationsSOP catalogue=\{operationsCatalogue\} \/>/);
});
