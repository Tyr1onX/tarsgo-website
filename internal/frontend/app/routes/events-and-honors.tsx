import type { Route } from "./+types/events-and-honors";
import { PublicHomePage } from "./home";
import { EventsAndHonorsArchive } from "~/components/events-and-honors-archive";
import { buildPublicMeta } from "~/lib/social-meta";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "赛事与荣誉 | TARSGO",
    description: "按年份查阅吉甲大师的赛事记录、奖项类别与原始证书材料。",
    path: "/events-and-honors",
    image: "/assets/images/Social/events-and-honors.jpg",
  });
}

export default function EventsAndHonorsPage() {
  return <PublicHomePage page="events-and-honors"><EventsAndHonorsArchive /></PublicHomePage>;
}
