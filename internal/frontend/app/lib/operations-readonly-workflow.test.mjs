import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the operations overview stays read-only and links to detailed horizontal workflows", async () => {
  const [view, channel, bar, css] = await Promise.all([
    read("../routes/dashboard/operations-progress.tsx"),
    read("../routes/dashboard/operations-channel.tsx"),
    read("../routes/dashboard/operations-stage-bar.tsx"),
    read("../routes/dashboard/operations-progress.css"),
  ]);
  assert.doesNotMatch(view, /<OperationsStageBar/);
  assert.match(view, /selected\.steps\.filter\(\(step\) => step\.status === "done"\)\.length/);
  assert.match(channel, /<OperationsStageBar item=\{item\}/);
  assert.match(bar, /className="operations-progress__video-stages"/);
  assert.match(bar, /gridTemplateColumns: `repeat\(\$\{item\.steps\.length\}, minmax\(6rem, 1fr\)\)`/);
  assert.match(bar, /<Link className="operations-progress__step-button"/);
  assert.match(bar, /参考负责人：\{step\.assigneeName\}/);
  assert.match(css, /\.operations-progress__video-stages ol\s*\{[\s\S]*?display: grid/);
  for (const action of ["添加环节", "记录进展", "新增事项", "保存名称", "移除环节", "renderItemEditor", "importDouyinPosts"]) {
    assert.ok(!view.includes(action), `overview must not expose ${action}`);
  }
  assert.match(bar, /step\.assigneeName \? <small>/);
  assert.match(bar, /step\.status !== "pending" \? <small>/);
  assert.doesNotMatch(view, /历史发布|board\.posts\.slice/);
});

test("one work detail supports inline owner updates and keeps historical evidence accessible", async () => {
  const [routes, detail, bar, client] = await Promise.all([
    read("../routes.ts"),
    read("../routes/dashboard/operations-work-detail.tsx"),
    read("../routes/dashboard/operations-stage-bar.tsx"),
    read("./operations-progress-client.ts"),
  ]);
  assert.match(routes, /route\("workbench\/operations\/works\/:itemId",/);
  assert.doesNotMatch(routes, /operations-step-detail|operations-step-status|operations-publication-edit/);
  assert.match(bar, /works\/\$\{item\.id\}\?step=\$\{step\.id\}/);
  assert.match(detail, /board\?\.canEditStatus/);
  assert.match(detail, /board\?\.canManage/);
  assert.doesNotMatch(detail, /leadId === board\.viewerId|assigneeId === board\.viewerId/);
  assert.match(detail, /status === "blocked"/);
  assert.match(detail, /await saveOperationsStep\(/);
  assert.match(detail, /await saveOperationsPublication\(/);
  assert.match(detail, /getOperationsStepActivity/);
  assert.match(detail, /operationsStepFileURL/);
  assert.ok(detail.indexOf("window.confirm") < detail.indexOf("await saveOperationsStep("));
  assert.match(detail, /availablePosts\.map\(/);
  assert.doesNotMatch(detail, /uploadOperationsStepFile/);
  assert.match(client, /leadId: number \| null/);
  assert.doesNotMatch(client, /export function uploadOperationsStepFile/);
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
  assert.match(library, /制作作品/);
  assert.match(library, /平台发布记录/);
  assert.match(importer, /window.confirm/);
  assert.match(importer, /await importDouyinPosts\(file\)/);
  assert.match(client, /export function importDouyinPosts\(file: File\)/);
});