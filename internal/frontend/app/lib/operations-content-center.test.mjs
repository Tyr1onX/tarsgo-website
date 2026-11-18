import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("content center keeps management separate from one-page workflow execution", async () => {
  const [routes, overview, platform, works, detail, editor, bar] = await Promise.all([
    read("../routes.ts"),
    read("../routes/dashboard/operations-progress.tsx"),
    read("../routes/dashboard/operations-channel.tsx"),
    read("../routes/dashboard/operations-works.tsx"),
    read("../routes/dashboard/operations-work-detail.tsx"),
    read("../routes/dashboard/operations-episode-setup.tsx"),
    read("../routes/dashboard/operations-stage-bar.tsx"),
  ]);
  for (const path of ["operations/works/new", "operations/works/:itemId",
    "operations/tasks", "operations/episodes/:itemId/setup"]) {
    assert.ok(routes.includes(path), `missing explicit route ${path}`);
  }
  assert.doesNotMatch(routes, /operations-step-detail|operations-step-status|operations-publication-edit/);
  assert.match(overview, />我的任务</);
  assert.match(overview, />全部作品</);
  assert.match(overview, /查看任务/);
  assert.match(platform, /查看作品详情/);
  assert.match(works, /新建作品/);
  assert.match(works, /item\.seriesName/);
  assert.match(detail, /管理作品/);
  assert.match(detail, /selectedStep/);
  assert.match(detail, /getOperationsWorks/);
  assert.match(detail, /await saveOperationsPublication/);
  assert.match(editor, /总负责人/);
  assert.match(editor, /环节负责人/);
  assert.match(bar, /works\/\$\{item\.id\}\?step/);
});

test("chart has no point-per-day marker cloud and preserves empty data state", async () => {
  const view = await read("../routes/dashboard/operations-progress.tsx");
  assert.match(view, /const entries = snapshots\.filter/);
  assert.match(view, /暂无账号数据/);
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
  assert.match(detail, /管理作品/);
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

test("platform cards prioritize current production then the real latest published work", async () => {
  const [overview, client, handler, css] = await Promise.all([
    read("../routes/dashboard/operations-progress.tsx"),
    read("./operations-progress-client.ts"),
    read("../../../backend/handler/operations_progress.go"),
    read("../routes/dashboard/operations-progress.css"),
  ]);
  assert.match(client, /latestPosts: OperationsPost\[\]/);
  assert.match(handler, /"latestPosts": latestPosts/);
  assert.match(handler, /Order\("published_at DESC, id DESC"\)/);
  assert.match(overview, /const selected = \[\.\.\.active\]/);
  assert.match(overview, /\{selected \? <div className="operations-progress__platform-feature">/);
  assert.match(overview, /: latestPost \? <div className="operations-progress__last-post">/);
  assert.match(overview, /latestPost=\{board\.latestPosts\.find/);
  assert.match(overview, /currentStep\.assigneeName/);
  assert.match(overview, /latestPost\.viewCount\.toLocaleString/);
  assert.doesNotMatch(overview, /当前没有正在制作的作品/);
  assert.match(css, /align-items: start/);
  assert.match(css, /operations-progress__last-post-title/);
});