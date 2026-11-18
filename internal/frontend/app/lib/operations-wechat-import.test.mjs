import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("WeChat growth upload is accessible only in the WeChat channel", async () => {
  const [routes, channel, importer, client] = await Promise.all([
    read("../routes.ts"),
    read("../routes/dashboard/operations-channel.tsx"),
    read("../routes/dashboard/operations-wechat-import.tsx"),
    read("./operations-progress-client.ts"),
  ]);
  assert.ok(routes.includes('workbench/operations/wechat/import'));
  assert.ok(channel.includes('channel.platforms === "wechat" && board.canManage'));
  assert.ok(channel.includes('/dashboard/workbench/operations/wechat/import'));
  assert.ok(importer.includes('await importWeChatFollowers(file)'));
  assert.ok(importer.includes('accept=".xls"'));
  assert.ok(!importer.includes("importDouyinPosts"));
  assert.ok(client.includes('export function importWeChatFollowers(file: File)'));
});
