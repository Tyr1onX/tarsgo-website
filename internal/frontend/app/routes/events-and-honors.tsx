import type { Route } from "./+types/events-and-honors";
import Home from "./home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "赛事与荣誉 | TARSGO" },
    { name: "description", content: "查看吉甲大师真实赛事节点与 25 张荣誉证书原图。" },
  ];
}

export default function EventsAndHonorsPage() {
  return <Home page="events-and-honors" />;
}
