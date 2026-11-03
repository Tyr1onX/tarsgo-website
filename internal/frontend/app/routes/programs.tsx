import { replace } from "react-router";

export function meta() {
  return [{ title: "吉甲 AI 沙龙 | TARSGO" }];
}

// Keep bookmarks and inbound links working without retaining an intermediate page.
export function clientLoader() {
  return replace("/programs/ai-salon");
}
export default function ProgramsRedirect() {
  return null;
}
