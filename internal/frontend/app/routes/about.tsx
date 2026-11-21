import type { Route } from "./+types/about";
import { PublicHomePage, groups } from "./home";
import { AboutTeamPage } from "~/components/about-team-page";
import { buildPublicMeta } from "~/lib/social-meta";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "认识吉甲 | TARSGO",
    description: "从 2018 年底组队、真实的机器人研发现场，到一代代学生留下的公开方案，认识吉林大学吉甲大师与 TARS-Go。",
    path: "/about",
    image: "/assets/images/Social/about.jpg",
  });
}

export default function AboutPage() {
  return <PublicHomePage page="about"><AboutTeamPage groups={groups} /></PublicHomePage>;
}
