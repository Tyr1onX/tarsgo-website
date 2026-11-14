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
  assert.match(page, /\{editing === item\.id && board\.canManage \? renderItemEditor\(\) : null\}/);
  assert.match(page, /\{editing === "new" && board\.canManage \? renderItemEditor\(\) : null\}/);
  const itemActions = page.indexOf('<div className="operations-progress__item-actions">');
  const inlineEditor = page.indexOf('{editing === item.id && board.canManage ? renderItemEditor() : null}');
  const itemHistory = page.indexOf('{historyItem === item.id ? <History');
  assert.ok(itemActions >= 0 && itemActions < inlineEditor && inlineEditor < itemHistory);
  assert.match(client, /method: "POST",[\s\S]*?body: \{ updateId \}/);
  assert.match(router, /POST\("\/operations\/progress\/:id\/stage\/undo", operationsProgressHandler\.UndoStage\)/);
  assert.match(handler, /latest\.ID != input\.UpdateID/);
  assert.match(handler, /return tx\.Delete\(&latest\)\.Error/);
  assert.doesNotMatch(handler, /Kind: "undo"|Update\("kind", "reverted"\)/);
});
