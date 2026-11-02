import assert from "node:assert/strict";
import test from "node:test";

import { validateCommunityImageBindings } from "./community-image-bindings.ts";

const first = "12345678-1234-1234-1234-123456789abc";
const second = "abcdefab-cdef-abcd-efab-cdefabcdefab";

test("form image bindings accept one matching temporary reference per upload", () => {
  assert.equal(
    validateCommunityImageBindings(
      `说明\n\n![图片](community-upload://${first} "说明")\n\n![第二张](community-upload://${second})`,
      2,
      [first, second],
    ),
    null,
  );
});

test("form image bindings reject files, tokens, and body references that do not correspond", () => {
  assert.match(validateCommunityImageBindings(`![图](community-upload://${first})`, 0, [first]), /不匹配/);
  assert.match(validateCommunityImageBindings(`![图](community-upload://${first})`, 1, [second]), /没有对应上传文件/);
  assert.match(validateCommunityImageBindings(`![图](community-upload://${first})\n![重复](community-upload://${first})`, 1, [first]), /不匹配/);
  assert.match(validateCommunityImageBindings("![图](community-upload://bad)", 1, [first]), /无效/);
  assert.match(validateCommunityImageBindings("正文", 2, [first]), /不匹配/);
});

test("form image bindings reject local browser URLs and allow saved or remote images", () => {
  for (const source of [
    "blob:https://example.test/id",
    "data:image/png;base64,AAAA",
    "file:///tmp/image.png",
    "filesystem:https://example.test/temporary",
    "cid:copied-image",
    "content://clipboard/image",
  ]) {
    assert.match(validateCommunityImageBindings(`![图片](${source})`, 0, []), /无法保存/);
  }
  assert.equal(validateCommunityImageBindings("![已保存](/api/community/files/42)", 0, []), null);
  assert.equal(validateCommunityImageBindings("![远程](https://example.test/image.png)", 0, []), null);
  assert.match(validateCommunityImageBindings("<img src=\"data:image/png;base64,AAAA\">", 0, []), /无法保存/);
});
