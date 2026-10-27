import type { Route } from "./+types/events-and-honors";
import { PublicHomePage } from "./home";
import { EventsAndHonorsArchive } from "~/components/events-and-honors-archive";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "赛事与荣誉 | TARSGO" },
    { name: "description", content: "按年份查阅吉甲大师的赛事记录、奖项类别与原始证书材料。" },
  ];
}

export default function EventsAndHonorsPage() {
  return <PublicHomePage page="events-and-honors"><EventsAndHonorsArchive /></PublicHomePage>;
}
