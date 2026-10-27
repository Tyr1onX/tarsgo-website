import type { Route } from "./+types/join";
import { PublicHomePage, groups } from "./home";
import { JoinExperience } from "~/components/join-experience";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "加入吉甲 | TARSGO" },
    { name: "description", content: "了解吉甲大师五个组别、团队实践与真实招新流程。" },
  ];
}

export default function JoinPage() {
  return <PublicHomePage page="join"><JoinExperience groups={groups} /></PublicHomePage>;
}
