import type { Route } from "./+types/robots";
import Home from "./home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "机器人展示 | TARSGO" },
    { name: "description", content: "浏览吉甲大师现有的五类机器人影像与真实介绍。" },
  ];
}

export default function RobotsPage() {
  return <Home page="robots" />;
}
