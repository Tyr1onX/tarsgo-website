import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("content center has explicit navigation to works and personal tasks", async () => {
  const [routes, overview, platform, works, detail, editor, step, publishing] = await Promise.all([
    read("../routes.ts"),
    read("../routes/dashboard/operations-progress.tsx"),
    read("../routes/dashboard/operations-channel.tsx"),
    read("../routes/dashboard/operations-works.tsx"),
    read("../routes/dashboard/operations-work-detail.tsx"),
    read("../routes/dashboard/operations-episode-setup.tsx"),
    read("../routes/dashboard/operations-step-detail.tsx"),
    read("../routes/dashboard/operations-publication-edit.tsx"),
  ]);
  for (const path of ["operations/works/new", "operations/works/:itemId",
    "operations/works/:itemId/publish", "operations/tasks", "operations/episodes/:itemId/setup"]) {
    assert.ok(routes.includes(path), `missing explicit route ${path}`);
  }
  assert.match(overview, />我的任务</);
  assert.match(overview, />全部作品</);
  assert.match(overview, /进入平台/);
  assert.doesNotMatch(overview, /viewMode|全部事项|board\.posts\.slice/);
  assert.match(platform, /查看作品详情/);
  assert.match(works, /新建作品/);
  assert.match(works, /item\.seriesName/);
  assert.match(detail, /编辑作品/);
  assert.match(detail, /登记发布/);
  assert.match(editor, /计划发布平台/);
  assert.match(editor, /环节负责人/);
  assert.match(step, /登记平台发布/);
  assert.ok(publishing.indexOf("window.confirm") < publishing.indexOf("await saveOperationsPublication"));
});

test("chart has no point-per-day marker cloud and preserves empty data state", async () => {
  const view = await read("../routes/dashboard/operations-progress.tsx");
  assert.match(view, /const entries = snapshots\.filter/);
  assert.match(view, /暂无账号历史数据/);
  assert.match(view, /近30天/);
  assert.match(view, /<polyline/);
  assert.equal((view.match(/<circle /g) ?? []).length, 1);
  assert.doesNotMatch(view, /coords\.map|entry\.observedOn.*<circle/);
});

test("platform targets are one work with per-platform publishing writes and series-aware continuation", async () => {
  const model = await read("../../../backend/model/operations_progress.go");
  const handler = await read("../../../backend/handler/operations_publications.go");
  const service = await read("../../../backend/service/operationsworkflow/episodes.go");
  const board = await read("../../../backend/handler/operations_progress.go");
  assert.match(model, /type OperationsPublication struct/);
  assert.match(model, /SeriesName/);
  assert.match(handler, /parseOperationsPlatforms/);
  assert.match(handler, /newStatus == "done" && previousStepStatus != "done"/);
  assert.match(handler, /ensureIndependentSuccessor/);
  assert.match(service, /series_name = \?/);
  assert.match(board, /Publications\s+\[\]model\.OperationsPublication/);
});

test("other affairs retain their horizontal workflow and have an explicit details and assignment path", async () => {
  const [overview, detail, editor, backend] = await Promise.all([
    read("../routes/dashboard/operations-progress.tsx"),
    read("../routes/dashboard/operations-work-detail.tsx"),
    read("../routes/dashboard/operations-episode-setup.tsx"),
    read("../../../backend/handler/operations_production.go"),
  ]);
  assert.match(overview, /item\.kind === "merchandise"/);
  assert.match(overview, />查看详情</);
  assert.match(detail, /编辑事务/);
  assert.match(editor, /编辑事务/);
  assert.match(editor, /isOtherWork \? \[\]/);
  assert.match(backend, /item\.Kind != "merchandise"/);
  assert.match(backend, /item\.Kind != "merchandise" \{/);
});

test("follower curves use a concise recent window without inventing historical points", async () => {
  const view = await read("../routes/dashboard/operations-progress.tsx");
  assert.match(view, /const recent = entries\.filter/);
  assert.match(view, /const stride = Math\.max/);
  assert.match(view, /const samples = recent\.filter/);
  assert.match(view, /const points = samples\.map/);
  assert.equal((view.match(/<circle /g) ?? []).length, 1);
});
