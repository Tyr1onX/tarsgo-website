import { Fragment, Slice, type Node as ProseMirrorNode, type NodeType } from "@milkdown/kit/prose/model";

export const communityEnableHtmlFileUploader = true;

export function isUnpersistableCommunityImageSource(source: unknown) {
  if (typeof source !== "string") return false;
  return /^(?:blob:|data:image\/|file:|filesystem:|cid:|content:)/i.test(source.trim());
}

export function matchCommunityClipboardImageFiles(sources: readonly unknown[], files: readonly File[]) {
  const matchingIndexes = sources.length === files.length
    ? sources.map((_, index) => index)
    : sources.flatMap((source, index) => isUnpersistableCommunityImageSource(source) ? [index] : []);
  const assignments = new Map<number, File>();
  const usedFiles = new Set<number>();
  matchingIndexes.forEach((imageIndex, fileIndex) => {
    if (!files[fileIndex]) return;
    assignments.set(imageIndex, files[fileIndex]!);
    usedFiles.add(fileIndex);
  });
  return {
    assignments,
    extraFiles: files.filter((_, index) => !usedFiles.has(index)),
  };
}

export function bindCommunityClipboardImages(
  slice: Slice,
  imageType: NodeType,
  files: readonly File[],
  createImage: (file: File, source: ProseMirrorNode) => ProseMirrorNode,
) {
  const imageNodes: ProseMirrorNode[] = [];
  slice.content.descendants((node) => {
    if (node.type === imageType) imageNodes.push(node);
  });
  const matches = matchCommunityClipboardImageFiles(imageNodes.map((node) => node.attrs.src), files);
  let imageIndex = 0;

  function bindFragment(fragment: Fragment) {
    const children: ProseMirrorNode[] = [];
    fragment.forEach((node) => {
      const file = node.type === imageType ? matches.assignments.get(imageIndex++) : undefined;
      if (node.type === imageType && file) {
        children.push(createImage(file, node));
        return;
      }
      children.push(node.content.size ? node.copy(bindFragment(node.content)) : node);
    });
    return Fragment.fromArray(children);
  }

  return {
    slice: new Slice(bindFragment(slice.content), slice.openStart, slice.openEnd),
    extraFiles: matches.extraFiles,
  };
}

export function removeUnpersistableCommunityClipboardImages(
  slice: Slice,
  imageType: NodeType,
  isStagedUploadSource: (source: unknown) => boolean = () => false,
) {
  let removed = 0;

  function cleanFragment(fragment: Fragment) {
    const children: ProseMirrorNode[] = [];
    fragment.forEach((node) => {
      if (node.type === imageType && isUnpersistableCommunityImageSource(node.attrs.src) && !isStagedUploadSource(node.attrs.src)) {
        removed += 1;
        return;
      }
      children.push(node.content.size ? node.copy(cleanFragment(node.content)) : node);
    });
    return Fragment.fromArray(children);
  }

  return {
    slice: new Slice(cleanFragment(slice.content), slice.openStart, slice.openEnd),
    removed,
  };
}
