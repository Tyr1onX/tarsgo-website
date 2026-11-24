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

export function getPixelReturn(state:unknown):{x:number;y:number;zoom:number;parent:string}|null{
  const value=(state as {pixelReturn?:unknown}|null)?.pixelReturn;
  if(!value||typeof value!=="object")return null;
  const v=value as {x?:unknown;y?:unknown;zoom?:unknown;parent?:unknown};
  if(typeof v.x!=="number"||typeof v.y!=="number"||typeof v.zoom!=="number"||
    !Number.isFinite(v.x)||!Number.isFinite(v.y)||!Number.isFinite(v.zoom)||v.zoom<.5||v.zoom>4)return null;
  return {x:v.x,y:v.y,zoom:v.zoom,parent:getExperienceReturnTo({experienceReturnTo:v.parent})};
}
