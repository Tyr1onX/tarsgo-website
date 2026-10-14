import type { Route } from "./+types/team-history";
import Home from "./home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "团队历程 | TARSGO" },
    { name: "description", content: "按年份查看吉林大学吉甲大师双创基地 2018 至 2025 年的团队历程与历史图片。" },
  ];
}

export default function TeamHistoryPage() {
  return <Home page="team-history" />;
}
