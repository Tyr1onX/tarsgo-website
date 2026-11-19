import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("WeChat and video account follower uploads use their own channel and verified format", async () => {
  const [routes, channel, importer, videoImporter, client] = await Promise.all([
    read("../routes.ts"),
    read("../routes/dashboard/operations-channel.tsx"),
    read("../routes/dashboard/operations-wechat-import.tsx"),
    read("../routes/dashboard/operations-wechat-video-import.tsx"),
    read("./operations-progress-client.ts"),
  ]);
  assert.ok(routes.includes('workbench/operations/wechat/import'));
  assert.ok(routes.includes('workbench/operations/wechat-video/import'));
  assert.ok(channel.includes('channel.platforms === "wechat" && board.canManage'));
  assert.ok(channel.includes('channel.platforms === "wechat_video" && board.canManage'));
  assert.ok(channel.includes('/dashboard/workbench/operations/wechat/import'));
  assert.ok(channel.includes('/dashboard/workbench/operations/wechat-video/import'));
  assert.ok(importer.includes('await importWeChatFollowers(file)'));
  assert.ok(importer.includes('await importWeChatVideoFollowers(file)'));
  assert.ok(importer.includes('isVideo ? ".csv" : ".xls"'));
  assert.ok(videoImporter.includes('platform="wechat_video"'));
  assert.ok(!importer.includes("importDouyinPosts"));
  assert.ok(client.includes('export function importWeChatFollowers(file: File)'));
  assert.ok(client.includes('export function importWeChatVideoFollowers(file: File)'));
});
