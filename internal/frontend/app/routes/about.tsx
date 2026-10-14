import type { Route } from "./+types/about";
import Home from "./home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "认识吉甲 | TARSGO" },
    { name: "description", content: "通过参赛、备赛、训练、创新实践与校企合作，认识吉林大学吉甲大师双创基地。" },
  ];
}

export default function AboutPage() {
  return <Home page="about" />;
}
