import type { Route } from "./+types/robots";
import Home from "./home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "机器人展示 | TARSGO" },
    { name: "description", content: "浏览 TARSGO 2026、2025 与 2024 三个赛季共 30 张真实机器人定妆照。" },
  ];
}

export default function RobotsPage() {
  return <Home page="robots" />;
}
