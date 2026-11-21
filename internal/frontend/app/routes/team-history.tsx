import type { Route } from "./+types/team-history";
import { PublicHomePage } from "./home";
import { TeamHistoryArchive } from "~/components/team-history-archive";
import { buildPublicMeta } from "~/lib/social-meta";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "团队历程 | TARSGO",
    description: "查看 2018 至 2026 年 TARS-Go 战队与吉甲大师实践平台的历史事件、真实照片和资料来源。",
    path: "/team-history",
    image: "/assets/images/Social/team-history.jpg",
  });
}

export default function TeamHistoryPage() {
  return <PublicHomePage page="team-history"><TeamHistoryArchive /></PublicHomePage>;
}
