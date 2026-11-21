import type { Route } from "./+types/join";
import { PublicHomePage, groups } from "./home";
import { JoinExperience } from "~/components/join-experience";
import { buildPublicMeta } from "~/lib/social-meta";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "加入吉甲 | TARSGO",
    description: "了解吉甲大师五个组别、团队实践与真实招新流程。",
    path: "/join",
    image: "/assets/images/Social/join.jpg",
  });
}

export default function JoinPage() {
  return <PublicHomePage page="join"><JoinExperience groups={groups} /></PublicHomePage>;
}
