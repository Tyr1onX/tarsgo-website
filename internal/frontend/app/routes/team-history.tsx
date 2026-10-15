import type { Route } from "./+types/team-history";
import Home from "./home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "团队历程 | TARSGO" },
    { name: "description", content: "查看 2018 至 2026 年 TARS-Go 战队与吉甲大师实践平台的历史事件、真实照片和资料来源。" },
  ];
}

export default function TeamHistoryPage() {
  return <Home page="team-history" />;
}
