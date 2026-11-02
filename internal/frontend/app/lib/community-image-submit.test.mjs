import assert from "node:assert/strict";
import test from "node:test";

import { withCommunityImageSubmission } from "./community-image-submit.ts";

test("image network failures explain that submission is unconfirmed and must not be retried blindly", async () => {
  const networkError = new TypeError("Failed to fetch");

  await assert.rejects(
    withCommunityImageSubmission(Promise.reject(networkError), 1),
    (error) => {
      assert.equal(error.message, "图片上传请求失败，内容未能确认提交。请检查网络后刷新确认状态，再重试。");
      assert.equal(error.cause, networkError);
      return true;
    },
  );
});

test("server validation errors stay specific for image submissions", async () => {
  const serverError = new Error("图片附件与正文引用不匹配");

  await assert.rejects(withCommunityImageSubmission(Promise.reject(serverError), 1), serverError);
});

test("requests without image uploads keep their original network error", async () => {
  const networkError = new TypeError("Failed to fetch");

  await assert.rejects(withCommunityImageSubmission(Promise.reject(networkError), 0), networkError);
});

test("successful image submissions keep their result", async () => {
  const result = { commentId: 274 };

  assert.equal(await withCommunityImageSubmission(Promise.resolve(result), 1), result);
});
