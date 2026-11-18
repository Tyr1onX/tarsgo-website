import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("operations overview keeps the horizontal stage bar and exposes no editors", async () => {
  const [view, css] = await Promise.all([
    read("../routes/dashboard/operations-progress.tsx"),
    read("../routes/dashboard/operations-progress.css"),
  ]);
  assert.match(view, /className="operations-progress__video-stages"/);
  assert.match(view, /gridTemplateColumns: `repeat\(\$\{item\.steps\.length\}, minmax\(6rem, 1fr\)\)`/);
  assert.match(view, /<Link className="operations-progress__step-button"/);
  assert.match(css, /\.operations-progress__video-stages ol\s*\{[\s\S]*?display: grid/);
  for (const action of ["添加环节", "记录进展", "新增事项", "保存名称", "移除环节", "renderItemEditor"]) {
    assert.ok(!view.includes(action), `overview should not expose ${action}`);
  }
  assert.match(view, /step\.assigneeName \? <small>/);
  assert.match(view, /step\.status !== "pending" \? <small>/);
});

test("step detail is read-only and the separate status page confirms before saving", async () => {
  const [routes, detail, form, client] = await Promise.all([
    read("../routes.ts"),
    read("../routes/dashboard/operations-step-detail.tsx"),
    read("../routes/dashboard/operations-step-status.tsx"),
    read("./operations-progress-client.ts"),
  ]);
  assert.match(routes, /route\("workbench\/operations\/:itemId\/steps\/:stepId",/);
  assert.match(routes, /route\("workbench\/operations\/:itemId\/steps\/:stepId\/status",/);
  assert.match(detail, /canUpdate \? <Link/);
  assert.doesNotMatch(detail, /<form|saveOperationsStep/);
  assert.match(form, /!canUpdate \? <p/);
  assert.match(form, /status === "blocked" \? <label>卡点原因/);
  assert.match(form, /disabled=\{saving \|\| !changed\}/);
  assert.ok(form.indexOf("window.confirm(summary)") < form.indexOf("await saveOperationsStep("));
  assert.match(client, /changes: \{ status: OperationsStepStatus; blockReason\?: string \}/);
  assert.doesNotMatch(client, /export function (createOperationsItem|addOperationsStep|deleteOperationsStep|recordOperationsUpdate)/);
});

test("existing Douyin import remains available outside task editing", async () => {
  const [routes, overview, importer, client] = await Promise.all([
    read("../routes.ts"),
    read("../routes/dashboard/operations-progress.tsx"),
    read("../routes/dashboard/operations-douyin-import.tsx"),
    read("./operations-progress-client.ts"),
  ]);
  assert.ok(routes.includes('workbench/operations/douyin/import'));
  assert.ok(overview.includes('operations/douyin/import'));
  assert.ok(!overview.includes('importDouyinPosts(file)'));
  assert.ok(importer.includes('window.confirm'));
  assert.ok(importer.includes('await importDouyinPosts(file)'));
  assert.ok(client.includes('export function importDouyinPosts(file: File)'));
});