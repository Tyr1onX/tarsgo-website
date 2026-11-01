export type CommunityImageLayout = { width: 25 | 50 | 75 | 100; align: "left" | "center" | "right"; caption: string };

const imageTitlePrefix = "jijia-image:";

export function encodeCommunityImageTitle(layout: CommunityImageLayout) {
  return `${imageTitlePrefix}${layout.width}:${layout.align}:${encodeURIComponent(layout.caption)}`;
}

export function decodeCommunityImageTitle(title?: string | null): CommunityImageLayout | null {
  if (!title?.startsWith(imageTitlePrefix)) return null;
  const [rawWidth, rawAlign, ...rawCaption] = title.slice(imageTitlePrefix.length).split(":");
  const width = Number(rawWidth);
  const align = rawAlign;
  if (![25, 50, 75, 100].includes(width) || !["left", "center", "right"].includes(align)) return null;
  let caption = "";
  try { caption = decodeURIComponent(rawCaption.join(":")); } catch { return null; }
  return { width: width as CommunityImageLayout["width"], align: align as CommunityImageLayout["align"], caption };
}

export function safeCommunityMarkdownUrl(url: string, allowBlob = false) {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|\/|#)/i.test(trimmed)) return trimmed;
  if (allowBlob && /^blob:/i.test(trimmed)) return trimmed;
  return "";
}

export function stripCommunityMarkdown(source: string) {
  return source
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1 ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(`{1,3}|\*{1,3}|_{1,3}|~~)/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function communityStandaloneAttachments<T extends { url: string }>(body: string, attachments: T[]) {
  return attachments.filter((attachment) => !body.includes(attachment.url));
}
