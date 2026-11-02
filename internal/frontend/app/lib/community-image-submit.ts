export function withCommunityImageSubmission<T>(request: Promise<T>, fileCount: number): Promise<T> {
  if (fileCount === 0) return request;
  return request.catch((cause: unknown) => {
    if (cause instanceof TypeError) {
      throw new Error("图片上传请求失败，内容未能确认提交。请检查网络后刷新确认状态，再重试。", { cause });
    }
    throw cause;
  });
}
