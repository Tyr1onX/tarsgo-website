import type { Route } from "./+types/join";
import Home from "./home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "加入吉甲 | TARSGO" },
    { name: "description", content: "了解吉甲大师五个组别、训练培养方式与当前报名入口。" },
  ];
}

export default function JoinPage() {
  return <Home page="join" />;
}
