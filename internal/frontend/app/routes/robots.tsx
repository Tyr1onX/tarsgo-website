import type { Route } from "./+types/robots";
import { PublicHomePage } from "./home";
import { RobotPhotoGallery } from "~/components/robot-photo-gallery";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "机器人展示 | TARSGO" },
    { name: "description", content: "浏览 TARSGO 2026、2025 与 2024 三个赛季共 30 张真实机器人定妆照。" },
  ];
}

export default function RobotsPage() {
  return (
    <PublicHomePage page="robots">
      <section
        id="robots"
        className="border-t border-[var(--theme-border-subtle)] bg-transparent py-8 sm:py-10 lg:py-12"
      >
        <div className="public-home-container">
          <RobotPhotoGallery />
        </div>
      </section>
    </PublicHomePage>
  );
}
