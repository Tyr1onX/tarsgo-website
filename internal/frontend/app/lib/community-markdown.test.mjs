import assert from "node:assert/strict";
import test from "node:test";

import {
  communityStandaloneAttachments,
  decodeCommunityImageTitle,
  encodeCommunityImageTitle,
  safeCommunityMarkdownUrl,
  stripCommunityMarkdown,
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
