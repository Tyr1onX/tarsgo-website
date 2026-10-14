import type { Route } from "./+types/join";
import Home from "./home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "加入吉甲 | TARSGO" },
    { name: "description", content: "了解吉甲大师五个组别、团队实践与真实招新流程。" },
  ];
}

export default function JoinPage() {
  return <Home page="join" />;
}
