import type { Route } from "./+types/traces-of-time";
import TimeHarp from "../components/time-harp";
import "../components/traces-of-time.css";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "时间有迹 · Traces of Time" },
    { name: "description", content: "以光为弦，以沙为迹，以时间为谱。" },
    { name: "theme-color", content: "#080908" },
  ];
}

export default function TracesOfTimeRoute() {
  return <TimeHarp />;
}
