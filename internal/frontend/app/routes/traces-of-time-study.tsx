import type { Route } from "./+types/traces-of-time-study";
import TimeHarpStudy from "../components/time-harp-study";
import "../components/time-harp-study.css";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "时间有迹 · 形态研究 V0.2" },
    { name: "description", content: "2018—2026 时间竖琴的独立造型与交互研究。" },
    { name: "theme-color", content: "#080908" },
  ];
}

export default function TracesOfTimeStudyRoute() {
  return <TimeHarpStudy />;
}
