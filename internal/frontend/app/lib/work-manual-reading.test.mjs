import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const routes = source("../routes.ts");
const guide = source("../routes/dashboard/guide.tsx");
const briefing = source("../routes/dashboard/recruitment-briefing.tsx");
const documentView = source("../components/work-manual-document.tsx");
const styles = source("../routes/dashboard/work-manual.css");
const navigation = source("./dashboard-navigation.ts");
const service = source("../../../backend/service/workmanual/service.go");
const router = source("../../../backend/router/router.go");
const catalogue = JSON.parse(source("../../../backend/service/workmanual/content/operations.json"));

test("the briefing SOP has its own workbench route, not another sidebar entry", () => {
  assert.match(routes, /route\("guide\/recruitment-briefing", "routes\/dashboard\/recruitment-briefing\.tsx"\)/);
  assert.match(guide, /<Link className="work-manual__directory-item" to="\/dashboard\/guide\/recruitment-briefing">/);
  assert.doesNotMatch(navigation, /href: "\/dashboard\/guide\/recruitment-briefing"/);
  assert.match(briefing, /to="\/dashboard\/guide\?tab=operations"/);
  assert.match(briefing, /<WorkManualDocument document=\{document\} titleLevel=\{1\} \/>/);
});

test("both SOP pages use the same document renderer and authorized catalogue", () => {
  assert.match(briefing, /hasOperationsWorkManualAccess\(currentUser, groupResolution\?\.groups\)/);
  assert.match(briefing, /apiRequest<OperationsCatalogue>\("\/api\/work-manual\/operations"\)/);
  assert.match(briefing, /if \(!canRead\) return;/);
  assert.match(router, /authenticatedAPI\.Use\(middleware\.RequireAuthenticated\(authService\)\)/);
  assert.match(router, /authenticatedAPI\.GET\("\/work-manual\/operations", workManualHandler\.OperationsCatalogue\)/);
  assert.match(service, /authorizeOperations\(ctx, actor\)/);
  assert.match(guide, /<WorkManualDocument document=\{document\} titleLevel=\{2\} \/>/);
  assert.match(documentView, /block\.completion/);
  assert.equal(catalogue.documents.length, 2);
  assert.equal(catalogue.documents[0].slug, "campus-network-window");
  assert.equal(catalogue.documents[1].slug, "recruitment-briefing");
  assert.equal(catalogue.documents[0].sections[3].blocks[0].href, "/api/work-manual/operations/templates/campus-network-window-application.doc");
});

test("briefing contains the confirmed detailed SOP and no separate visual treatment", () => {
  const document = catalogue.documents.find((item) => item.slug === "recruitment-briefing");
  assert.deepEqual(document.sections.map((section) => [section.id, section.title]), [
    ["scenario", "适用场景"],
    ["workflow", "办理流程"],
    ["notes", "注意事项"],
  ]);
  const steps = document.sections[1].blocks;
  assert.equal(steps.length, 7);
  assert.ok(steps.every((step) => step.type === "step" && step.items.length >= 4 && step.completion));
  assert.deepEqual(steps.map((step) => step.title), [
    "第一步：确定宣讲时间与场地",
    "第二步：准备宣讲材料",
    "第三步：准备报名渠道",
    "第四步：确定现场人员分工",
    "第五步：到场检查设备",
    "第六步：开展现场宣讲",
    "第七步：结束活动并整理资料",
  ]);
  assert.equal(steps[3].items.length, 8);
  assert.match(document.sections[2].blocks[0].items[0], /直播必须实际监看/);
  assert.doesNotMatch(briefing + styles, /briefing-flow|briefing-timeline|briefing__number/);
  assert.doesNotMatch(guide, /document\.sections\.map\(\(section\) => <li/);
  assert.match(guide, /<OperationsSOP catalogue=\{operationsCatalogue\} \/>/);
});
