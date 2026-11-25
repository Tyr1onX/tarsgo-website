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
  assert.match(overview, />检索作品</);
  assert.match(overview, />发起一期视频</);
  assert.match(overview, /查看任务/);
  assert.match(platform, /查看作品详情/);
  assert.match(works, /作品检索/);
  assert.match(works, /type="search"/);
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
  assert.match(css, /align-items: stretch/);
  assert.match(css, /operations-progress__last-post-title/);
});

test("operations role shortcut maps unique real member accounts without assigning publication", async () => {
  const editor = await read("../routes/dashboard/operations-episode-setup.tsx");
  assert.match(editor, /planning: "马鹤铭"/);
  assert.match(editor, /materials: "安博"/);
  assert.match(editor, /editing: "王钰涵"/);
  assert.match(editor, /member\.name\.trim\(\) === roles\[step\.key\]/);
  assert.match(editor, /matches\.length === 1/);
  assert.match(editor, /board\.viewerId/);
  assert.match(editor, /step\.key === "review"/);
  assert.match(editor, /step\.key === "published"/);
  assert.match(editor, /next\[step\.id\] = 0/);
  assert.match(editor, /套用分工（由我审核）/);
  assert.match(editor, /setUnmatched\(missing\)/);
  assert.match(editor, /await setupOperationsEpisode\(/);
});

test("quick launch starts planning without advancing to filming or forcing assignment setup", async () => {
  const [overview, create, backend, works, css] = await Promise.all([
    read("../routes/dashboard/operations-progress.tsx"),
    read("../routes/dashboard/operations-work-new.tsx"),
    read("../../../backend/handler/operations_production.go"),
    read("../routes/dashboard/operations-works.tsx"),
    read("../routes/dashboard/operations-progress.css"),
  ]);
  assert.match(overview, />发起一期视频</);
  assert.match(create, /createOperationsEpisode\(channel\.id, title\.trim\(\), seriesName\.trim\(\), true\)/);
  assert.match(create, /navigate\(`\/dashboard\/workbench\/operations\/works\/\$\{work\.id\}`/);
  assert.doesNotMatch(create, /\/episodes\/\$\{work\.id\}\/setup/);
  assert.match(backend, /operationsworkflow\.EnsureUpcoming\(tx, channelID, input\.SeriesName\)/);
  assert.match(backend, /Update\("status", "active"\)/);
  assert.match(backend, /"planning", "pending"/);
  assert.match(works, /operations-progress__library-list/);
  assert.match(works, /type="search"/);
  assert.match(works, /getOperationsWorks\(platform, page, search\)/);
  assert.doesNotMatch(works, /operations-progress__work-cover|operations-progress__works-grid/);
  assert.match(css, /align-items: stretch/);
  assert.doesNotMatch(css, /grid-template-rows: auto minmax\(8rem/);
  assert.match(css, /operations-progress__library-row/);
});

test("works search uses the existing URL filters and replaces history while typing", async () => {
  const works = await read("../routes/dashboard/operations-works.tsx");
  assert.match(works, /const query = params\.get\("q"\) \?\? ""/);
  assert.match(works, /useState\(query\.trim\(\)\)/);
  assert.match(works, /setParams\(next, \{ replace, flushSync: true \}\)/);
  assert.match(works, /updateParams\(\{ q: event\.target\.value, page: "" \}, true\)/);
  assert.doesNotMatch(works, /setQuery/);
});

test("operations overview shows compact platform snapshots and keeps full workflow in detail pages", async () => {
  const [overview, css, detail] = await Promise.all([
    read("../routes/dashboard/operations-progress.tsx"),
    read("../routes/dashboard/operations-progress.css"),
    read("../routes/dashboard/operations-work-detail.tsx"),
  ]);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1120px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /operations-progress__trend-main/);
  assert.match(css, /operations-progress__overview-other/);
  assert.doesNotMatch(overview, /<OperationsStageBar/);
  assert.match(overview, /selected.steps.filter\(\(step\) => step.status === "done"\).length/);
  assert.match(overview, /currentStep.assigneeName/);
  assert.match(overview, /latestPost.viewCount.toLocaleString/);
  assert.match(detail, /<OperationsStageBar/);
});

test("operations delete actions are permission-gated and historical posts stay suppressed after sync", async () => {
  const [channel, works, client, handler, model, progress] = await Promise.all([
    read("../routes/dashboard/operations-channel.tsx"),
    read("../routes/dashboard/operations-works.tsx"),
    read("./operations-progress-client.ts"),
    read("../../../backend/handler/operations_production.go"),
    read("../../../backend/model/operations_public_metrics.go"),
    read("../../../backend/handler/operations_progress.go"),
  ]);
  const router = await read("../../../backend/router/router.go");
  assert.match(channel, /board\.canManage && item\.steps\.every/);
  assert.match(channel, /"删除策划"/);
  assert.match(channel, /await deleteOperationsEpisodePlan\(item\.id\)/);
  assert.doesNotMatch(channel, />历史发布</);
  assert.match(works, /board\?\.canManage \? <button/);
  assert.match(works, /"删除记录"/);
  assert.match(works, /await deleteOperationsPost\(id\)/);
  assert.match(client, /method: "DELETE"/);
  assert.match(router, /DELETE\("\/operations\/progress\/:id\/plan"/);
  assert.match(router, /DELETE\("\/operations\/posts\/:id"/);
  assert.match(handler, /func \(h \*OperationsProgressHandler\) DeleteEpisodePlan/);
  assert.match(handler, /func \(h \*OperationsProgressHandler\) DeletePost/);
  assert.match(handler, /errOperationsPlanCannotDelete/);
  assert.match(handler, /Where\("hidden = \?", false\)/);
  assert.match(model, /Hidden\s+bool/);
  assert.match(progress, /Where\("hidden = \?", false\)/);
});

test("merchandise overview lists individual items without showing the old generic card twice", async () => {
  const [overview, migration] = await Promise.all([
    read("../routes/dashboard/operations-progress.tsx"),
    read("../../../backend/database/operations_merchandise_v84.go"),
  ]);
  assert.match(overview, /hasMerchandiseItems/);
  assert.match(overview, /item\.title === "周边制作"/);
  assert.match(overview, /"周边制作" : "其他事务"/);
  for (const name of ["小灯泡", "指尖陀螺", "鼠标垫", "帆布袋", "尺子", "小口袋", "卡通人物立牌", "钥匙扣", "光栅卡", "机器人拼接积木"]) {
    assert.ok(migration.includes(`"${name}"`), `missing single-product task: ${name}`);
  }
  assert.doesNotMatch(migration, /第一批|同步推进|后期跟进|Priority|priority/);
});
