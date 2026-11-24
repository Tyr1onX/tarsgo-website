// Keep the return destination local to the site and carry it between experience pages.
export function getExperienceReturnTo(state: unknown, fallback = "/"): string {
  const path = (state as { experienceReturnTo?: unknown } | null)?.experienceReturnTo;
  return typeof path === "string" && !path.includes("\\") &&
    (path === "/" || path === "/pixel-jijia" || /^\/dashboard(?:[/?#]|$)/.test(path))
    ? path : fallback;
}

export function experienceReturnLabel(path: string): string {
  if (path === "/pixel-jijia") return "返回像素吉甲";
  return path.startsWith("/dashboard") ? "返回后台" : "返回官网";
}
