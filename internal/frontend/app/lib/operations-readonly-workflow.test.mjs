import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the operations overview stays read-only and reuses its horizontal progress bar", async () => {
  const [view, channel, bar, css] = await Promise.all([
    read("../routes/dashboard/operations-progress.tsx"),
    read("../routes/dashboard/operations-channel.tsx"),
    read("../routes/dashboard/operations-stage-bar.tsx"),
    read("../routes/dashboard/operations-progress.css"),
  ]);
  assert.match(view, /<OperationsStageBar item=\{featured\}/);
  assert.match(channel, /<OperationsStageBar item=\{item\}/);
  assert.match(bar, /className="operations-progress__video-stages"/);
  assert.match(bar, /gridTemplateColumns: `repeat\(\$\{item\.steps\.length\}, minmax\(6rem, 1fr\)\)`/);
  assert.match(bar, /<Link className="operations-progress__step-button"/);
  assert.match(css, /\.operations-progress__video-stages ol\s*\{[\s\S]*?display: grid/);
  for (const action of ["添加环节", "记录进展", "新增事项", "保存名称", "移除环节", "renderItemEditor", "importDouyinPosts"]) {
    assert.ok(!view.includes(action), `overview must not expose ${action}`);
  }
  assert.match(bar, /step\.assigneeName \? <small>/);
  assert.match(bar, /step\.status !== "pending" \? <small>/);
  assert.doesNotMatch(view, /历史发布|board\.posts\.slice/);
});

test("step detail is read-only, status updates confirm first and accept optional evidence", async () => {
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
  assert.match(form, /await uploadOperationsStepFile/);
  assert.match(client, /changes: \{ status: OperationsStepStatus; blockReason\?: string; note\?: string; evidenceUrl\?: string \}/);
  assert.doesNotMatch(client, /export function (createOperationsItem|addOperationsStep|deleteOperationsStep|recordOperationsUpdate)/);
});

test("platform production, artwork library and Douyin import are separate surfaces", async () => {
  const [routes, channel, library, importer, client] = await Promise.all([
    read("../routes.ts"),
    read("../routes/dashboard/operations-channel.tsx"),
    read("../routes/dashboard/operations-works.tsx"),
    read("../routes/dashboard/operations-douyin-import.tsx"),
    read("./operations-progress-client.ts"),
  ]);
  for (const uri of ["workbench/operations/channels/:channelId", "workbench/operations/works", "workbench/operations/douyin/import"]) {
    assert.ok(routes.includes(uri), `missing route ${uri}`);
  }
  assert.ok(channel.includes("/dashboard/workbench/operations/douyin/import"));
  assert.ok(channel.includes("/api/operations/douyin/authorize"));
  assert.match(library, /已发布作品/);
  assert.match(library, /制作档案/);
  assert.match(importer, /window.confirm/);
  assert.match(importer, /await importDouyinPosts\(file\)/);
  assert.match(client, /export function importDouyinPosts\(file: File\)/);
});