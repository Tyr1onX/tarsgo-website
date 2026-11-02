const unpersistableImageMarkdown = /!\[[^\]]*\]\(\s*<?(?:blob:|data:image\/|file:|filesystem:|cid:|content:)/i;
const unpersistableImageHTML = /<img\b[^>]*\bsrc\s*=\s*(?:["']\s*)?(?:blob:|data:image\/|file:|filesystem:|cid:|content:)/i;

export function validateCommunityImageBindings(body: string, fileCount: number, uploadTokens: string[]) {
  if (unpersistableImageMarkdown.test(body) || unpersistableImageHTML.test(body)) {
    return "正文中包含无法保存的本地图片，请重新粘贴或使用“插入图片”选择文件。";
  }
  if (uploadTokens.length && uploadTokens.length !== fileCount) {
    return "图片文件与正文引用不匹配，请重新插入图片后再发布。";
  }

  const references = [...body.matchAll(/community-upload:\/\/([A-Za-z0-9_-]{16,64})/g)];
  if (body.replace(/community-upload:\/\/[A-Za-z0-9_-]{16,64}/g, "").includes("community-upload://")) {
    return "正文中包含无效的临时图片地址，请重新插入图片后再发布。";
  }

  const nonemptyTokens = uploadTokens.filter(Boolean);
  const knownTokens = new Set(nonemptyTokens);
  if (knownTokens.size !== nonemptyTokens.length) {
    return "图片临时引用重复，请重新插入图片后再发布。";
  }
  if (references.some((match) => !knownTokens.has(match[1]))) {
    return "正文引用的图片没有对应上传文件，请重新插入图片后再发布。";
  }

  const imageReferences = [...body.matchAll(/!\[[^\]]*\]\(\s*<?community-upload:\/\/([A-Za-z0-9_-]{16,64})(?=[\s)>])/g)];
  for (const token of knownTokens) {
    const bodyCount = references.filter((match) => match[1] === token).length;
    const imageCount = imageReferences.filter((match) => match[1] === token).length;
    if (bodyCount !== 1 || imageCount !== 1) {
      return "图片文件与正文引用不匹配，请重新插入图片后再发布。";
    }
  }

  return null;
}
