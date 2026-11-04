/** An editorial illustration of a work in progress, not a depiction of an event. */
export function SalonHeroArt() {
  return (
    <div className="salon-collage" aria-hidden="true">
      <div className="salon-collage-grid" />
      <div className="salon-collage-sheet">
        <div className="salon-collage-top"><span>● &nbsp; ● &nbsp; ●</span><span>TARSGO / ROBOT COLLECTION</span><span>↗</span></div>
        <div className="salon-collage-canvas">
          <img src="/assets/images/Salon/tarsgo-robots-preview.webp" width="1000" height="640" alt="" fetchPriority="high" />
        </div>
        <div className="salon-collage-bottom"><span>吉甲 · 机器人展示页</span><span>吉甲 AI 沙龙</span></div>
      </div>
      <div className="salon-collage-note"><span className="salon-collage-spark" /><p>让一个想法<br /><strong>慢慢成形。</strong></p><small>IDEAS IN MOTION ↗</small></div>
      <div className="salon-collage-stamp">TARSGO<br /><span>AI SALON</span></div>
    </div>
  );
}
