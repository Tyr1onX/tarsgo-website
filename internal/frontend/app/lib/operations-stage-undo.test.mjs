import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("latest stage or confirmation can be undone only from its history row", async () => {
  const [page, client, router, handler] = await Promise.all([
    read("../routes/dashboard/operations-progress.tsx"),
    read("./operations-progress-client.ts"),
    read("../../../backend/router/router.go"),
    read("../../../backend/handler/operations_stage.go"),
  ]);
  assert.match(page, /entry\.id === latestActionID && \(entry\.kind === "stage" \|\| entry\.kind === "confirmed"\)/);
  assert.match(page, /item\.lastUpdate\?\.kind === "stage" \|\| item\.lastUpdate\?\.kind === "confirmed"/);
  assert.match(page, /onClick=\{\(\) => onUndo\(entry\.id\)\}/);
  assert.match(page, /await undoOperationsStage\(itemId, updateId\)/);
  assert.match(page, /entry\.kind === "reverted" \? "已撤回/);
  assert.match(client, /method: "POST",[\s\S]*?body: \{ updateId \}/);
  assert.match(router, /POST\("\/operations\/progress\/:id\/stage\/undo", operationsProgressHandler\.UndoStage\)/);
  assert.match(handler, /latest\.ID != input\.UpdateID/);
  assert.match(handler, /tx\.Model\(&latest\)\.Update\("kind", "reverted"\)/);
  assert.match(handler, /Kind: "undo"/);
});
