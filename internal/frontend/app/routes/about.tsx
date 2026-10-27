import type { Route } from "./+types/about";
import { PublicHomePage, groups } from "./home";
import { AboutTeamPage } from "~/components/about-team-page";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "认识吉甲 | TARSGO" },
    { name: "description", content: "从 2018 年底组队、真实的机器人研发现场，到一代代学生留下的公开方案，认识吉林大学吉甲大师与 TARS-Go。" },
  ];
}

export default function AboutPage() {
  return <PublicHomePage page="about"><AboutTeamPage groups={groups} /></PublicHomePage>;
}
