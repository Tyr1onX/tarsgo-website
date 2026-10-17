import { useState } from "react";
import type { Route } from "./+types/traces-sand-reveal";
import { Link } from "react-router";
import { ThemeControl } from "~/components/theme-control";
import { HomeVisualNavigation } from "~/components/home-visual-navigation";
import type { HomeImageTreatment } from "~/components/home-sand-reveal-layer";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "时间有迹 · 沙画显影实验 | TARSGO" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function TracesSandRevealRoute() {
  const [mode, setMode] = useState<HomeImageTreatment>("sand");
  const [replayToken, setReplayToken] = useState(0);

  return (
    <main className="public-home traces-sand-preview min-h-screen bg-surface-primary text-fg-primary">
      <header className="public-home-container traces-sand-preview__header">
        <Link to="/" className="traces-sand-preview__back">
          <span aria-hidden="true">←</span>
          <span>TARSGO</span>
        </Link>
        <ThemeControl className="traces-sand-preview__theme" />
      </header>

      <div className="public-home-container traces-sand-preview__intro">
        <div className="traces-sand-preview__title">
          <p>TRACES OF TIME</p>
          <h1>时间有迹 · 沙画显影</h1>
        </div>
        <div className="traces-sand-preview__controls" role="group" aria-label="照片显现方式">
          <div className="traces-sand-preview__switch">
            <button
              type="button"
              aria-pressed={mode === "original"}
              onClick={() => setMode("original")}
            >
              原版
            </button>
            <button
              type="button"
              aria-pressed={mode === "sand"}
              onClick={() => setMode("sand")}
            >
              沙画版
            </button>
          </div>
          <button
            type="button"
            className="traces-sand-preview__replay"
            onClick={() => {
              setMode("sand");
              setReplayToken((token) => token + 1);
            }}
          >
            重播沙画
          </button>
        </div>
      </div>

      <HomeVisualNavigation
        imageTreatment={mode}
        replayToken={replayToken}
        showHeading={false}
      />
    </main>
  );
}
