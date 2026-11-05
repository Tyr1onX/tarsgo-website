// An online event may promote one standalone HTTPS link at the start of its
// existing Markdown content. Keep the exact URL, including partner parameters.
export function salonContent(summary: string, online: boolean): {
  summary: string;
  action: { label: string; href: string } | null;
} {
  const unchanged = { summary, action: null };
  if (!online) return unchanged;
  const source = summary.trimStart();
  const match = source.match(/^\[([^\]\r\n]+)\]\((https:\/\/[^\s)]+)\)[ \t]*(?:\r?\n[ \t]*\r?\n|$)/);
  if (!match) return unchanged;
  try {
    const url = new URL(match[2]);
    if (!url.hostname || url.username || url.password || !match[1].trim()) return unchanged;
  } catch {
    return unchanged;
  }
  return {
    summary: source.slice(match[0].length),
    action: { label: match[1].trim(), href: match[2] },
  };
}
