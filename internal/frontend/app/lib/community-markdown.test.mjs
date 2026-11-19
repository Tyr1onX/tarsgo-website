import assert from "node:assert/strict";
import test from "node:test";

import {
  communityStandaloneAttachments,
  decodeCommunityImageTitle,
  encodeCommunityImageTitle,
  safeCommunityMarkdownUrl,
  stripCommunityMarkdown,
  communityEmptyTable,
  insertCommunityMarkdownTable,
} from "./community-markdown.ts";

test("Markdown excerpts keep readable content and remove formatting and image source syntax", () => {
  assert.equal(stripCommunityMarkdown("# 项目记录\n\n这是一段 **重点** 内容，包含 [链接](https://example.com)。\n\n![流程图](/api/community/files/1)"), "项目记录 这是一段 重点 内容，包含 链接。 流程图");
  assert.equal(stripCommunityMarkdown("- [x] 完成任务\n- [ ] 下一步"), "完成任务 下一步");
  assert.equal(stripCommunityMarkdown("```ts\nconst status = 'ok';\n```"), "const status = 'ok';");
});

test("embedded image layout metadata round trips caption, width, and alignment", () => {
  const image = { width: 50, align: "right", caption: "阶段二：完成率 75%" };
  assert.deepEqual(decodeCommunityImageTitle(encodeCommunityImageTitle(image)), image);
  assert.equal(decodeCommunityImageTitle("jijia-image:5:up:bad"), null);
});

test("Markdown URLs reject executable and data protocols while allowing local attachments", () => {
  assert.equal(safeCommunityMarkdownUrl("javascript:alert(1)"), "");
  assert.equal(safeCommunityMarkdownUrl("data:text/html,<script>"), "");
  assert.equal(safeCommunityMarkdownUrl("/api/community/files/23"), "/api/community/files/23");
  assert.equal(safeCommunityMarkdownUrl("blob:https://example.test/preview", true), "blob:https://example.test/preview");
  assert.equal(safeCommunityMarkdownUrl("blob:https://example.test/preview"), "");
});

test("embedded images do not render twice in the legacy attachment gallery", () => {
  const attachments = [{ url: "/api/community/files/1" }, { url: "/api/community/files/2" }];
  assert.deepEqual(communityStandaloneAttachments("![inline](/api/community/files/1)", attachments), [attachments[1]]);
});

test("table insertion creates an isolated, editable three-column GFM block", () => {
  const source = "上文\n下文";
  const inserted = insertCommunityMarkdownTable(source, 2, 2);
  assert.equal(inserted.value, "上文\n\n" + communityEmptyTable + "\n\n下文");
  assert.equal(inserted.value.slice(inserted.start, inserted.end), "列 1");
  assert.deepEqual(communityEmptyTable.split("\n").map((row) => row.split("|").length - 2), [3, 3, 3, 3]);
  assert.equal(insertCommunityMarkdownTable("", 0, 0).value, communityEmptyTable);
  assert.equal(insertCommunityMarkdownTable("前文", 2, 2).value, "前文\n\n" + communityEmptyTable);
  assert.equal(insertCommunityMarkdownTable("已选中内容", 0, 5).value, communityEmptyTable);
});

test("rich and source editors reuse existing table feature and preserve table layout", async () => {
  const { readFile } = await import("node:fs/promises");
  const editor = await readFile(new URL("../components/community-markdown-editor.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../components/community-markdown-editor.css", import.meta.url), "utf8");
  assert.match(editor, /\[Crepe\.Feature\.Table\]: true/);
  assert.match(editor, /createTable\(ctx, 3, 3\)/);
  assert.match(editor, /insertCommunityMarkdownTable\(currentValueRef\.current, textarea\.selectionStart, textarea\.selectionEnd\)/);
  assert.match(editor, /边缘可增删行列/);
  assert.doesNotMatch(stylesheet, /\.ProseMirror table \{ display: block/);
});
