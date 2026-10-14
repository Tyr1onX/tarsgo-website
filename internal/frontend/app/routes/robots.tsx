import type { Route } from "./+types/robots";
import Home from "./home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "机器人展示 | TARSGO" },
    { name: "description", content: "浏览 TARSGO 2024 赛季 11 台机器人与设备的真实定妆照。" },
  ];
}

export default function RobotsPage() {
  return <Home page="robots" />;
}
